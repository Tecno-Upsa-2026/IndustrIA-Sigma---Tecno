import { calcSimResults } from '../../simulation/metrics.js';
import { MACHINE_PROFILES, state } from '../../store/state.js';
import { buildMachineDiagnostics } from './csv-diagnostics.js';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotVars(machine) {
  return Object.fromEntries(Object.entries(machine?.vars || {}).map(([name, entry]) => [name, entry.value]));
}

function baseVars(profile) {
  return Object.fromEntries(Object.entries(profile.variables).map(([name, entry]) => [name, entry.base_value]));
}

function confidenceFor(profile, variable) {
  const reliability = variable.cpk != null && variable.cpk < 1.33 ? 0.78 : 0.86;
  const calibration = variable.historicalStd > 0 ? Math.max(0.45, Math.min(0.98, 1 - variable.historicalStd / Math.max(Math.abs(variable.historicalMean) || 1, 1))) : 0.72;
  const correlationBoost = Math.min(0.12, variable.correlatedWith.length * 0.03);
  return parseFloat((Math.max(0.35, Math.min(0.98, reliability * calibration + correlationBoost))).toFixed(2));
}

function pickIssues(diagnostics) {
  return diagnostics.flaggedVariables
    .slice()
    .sort((a, b) => Math.abs(b.sigmaDelta) - Math.abs(a.sigmaDelta))
    .slice(0, 3);
}

function suggestValue(variable) {
  if (variable.type === 'quality') {
    return variable.target;
  }
  return variable.historicalMean;
}

function secondaryEffects(variable) {
  if (!variable.correlatedWith.length) return [];
  return variable.correlatedWith.map(item => ({
    variable: item.name,
    correlation: item.corr,
    effect: item.corr >= 0 ? 'sube' : 'baja',
  }));
}

function buildScenario(profile, machine, diagnostics, variable) {
  const currentVars = snapshotVars(machine);
  const recommendedVars = { ...currentVars, [variable.name]: suggestValue(variable) };
  const current = calcSimResults({ vars: currentVars }, profile.machineId);
  const recommended = calcSimResults({ vars: recommendedVars }, profile.machineId);
  const baseline = calcSimResults({ vars: baseVars(profile) }, profile.machineId);

  return {
    machineId: profile.machineId,
    process: profile.process,
    variable: variable.name,
    from: roundValue(currentVars[variable.name]),
    to: roundValue(recommendedVars[variable.name]),
    unit: variable.unit || '',
    confidence: confidenceFor(profile, variable),
    current,
    recommended,
    baseline,
    impact: {
      defectDelta: roundValue(recommended.defect - current.defect),
      oeeDelta: roundValue(recommended.oee - current.oee),
      sigmaDelta: roundValue(recommended.sigma - current.sigma),
      cpkDelta: roundValue((recommended.cpk || 0) - (current.cpk || 0)),
    },
    effects: secondaryEffects(variable),
    reason: variable.type === 'quality'
      ? `Acercar ${variable.name} al objetivo histórico mejora el capability.`
      : `Retornar ${variable.name} a la media histórica reduce la desviación de proceso (${variable.sigmaDelta.toFixed(2)}σ).`,
    diagnosticsSummary: diagnostics.summary,
    recommendedParams: recommendedVars,
  };
}

function roundValue(value, digits = 4) {
  return parseFloat(Number(value).toFixed(digits));
}

export function buildRecommendations(machineId) {
  const profile = MACHINE_PROFILES[machineId];
  const machine = state.machines[machineId];
  if (!profile || !machine) return null;

  const diagnostics = buildMachineDiagnostics(machineId);
  const issues = pickIssues(diagnostics);
  const scenarios = issues.map(issue => buildScenario(profile, machine, diagnostics, issue));

  return {
    machineId,
    process: profile.process,
    diagnostics,
    scenarios,
  };
}

export function compareMachineScenarios(machineId, recommendedParams = {}) {
  const profile = MACHINE_PROFILES[machineId];
  const machine = state.machines[machineId];
  if (!profile || !machine) return null;

  const currentVars = snapshotVars(machine);
  const baselineVars = baseVars(profile);
  const base = calcSimResults({ vars: baselineVars }, machineId);
  const current = calcSimResults({ vars: currentVars }, machineId);
  const recommended = calcSimResults({ vars: { ...currentVars, ...recommendedParams } }, machineId);

  return {
    machineId,
    baseline: base,
    current,
    recommended,
    improvement: {
      defectPct: roundValue(((current.defect - recommended.defect) / Math.max(current.defect, 0.01)) * 100),
      oeePts: roundValue(recommended.oee - current.oee),
      sigmaPts: roundValue(recommended.sigma - current.sigma),
      production: roundValue(recommended.production - current.production),
      energy: roundValue(recommended.energy - current.energy),
    },
  };
}
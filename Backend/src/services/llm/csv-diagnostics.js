import { state, MACHINE_PROFILES, getActiveAlerts } from '../../store/state.js';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  return parseFloat(Number(value).toFixed(digits));
}

function getMachineHistory(machineId, name) {
  return state.machineHistory?.[machineId]?.[name] || [];
}

function getControlLimits(profile, entry) {
  return entry.historicalControlLimits || profile.historicalControlLimits?.[entry.name] || {
    mean: entry.base_value,
    std: Math.max(entry.noise || 0.01, 0.01),
    ucl: entry.base_value + Math.max(entry.noise || 0.01, 0.01) * 3,
    lcl: entry.base_value - Math.max(entry.noise || 0.01, 0.01) * 3,
    warnUpper: entry.base_value + Math.max(entry.noise || 0.01, 0.01) * 2,
    warnLower: entry.base_value - Math.max(entry.noise || 0.01, 0.01) * 2,
  };
}

function computeCpk(mean, std, usl, lsl) {
  const safeStd = Math.max(std || 0.01, 0.01);
  return Math.min((usl - mean) / (3 * safeStd), (mean - lsl) / (3 * safeStd));
}

function trendLabel(delta, std) {
  if (Math.abs(delta) <= Math.max(std || 0, 0.01) * 0.35) return 'estable';
  return delta > 0 ? 'ascendente' : 'descendente';
}

function relevantCorrelations(profile, variableName) {
  const corrRow = profile.correlations?.[variableName] || {};
  return Object.entries(corrRow)
    .filter(([, corr]) => Math.abs(corr) >= 0.35)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([name, corr]) => ({ name, corr: round(corr, 4) }));
}

function machineAlerts(machineId) {
  return getActiveAlerts()
    .filter(alert => alert.machine === machineId)
    .map(alert => ({
      id: alert.id,
      sev: alert.sev,
      title: alert.title,
      detail: alert.detail,
      time: alert.time,
      ai: alert.ai,
      status: alert.status,
    }));
}

export function buildMachineDiagnostics(machineId) {
  if (!machineId) return null;

  const machine = state.machines[machineId];
  const profile = MACHINE_PROFILES[machineId];
  if (!machine || !profile) return null;

  const variables = Object.entries(profile.variables).map(([name, entry]) => {
    const current = num(machine.vars?.[name]?.value ?? machine[name] ?? entry.value ?? entry.base_value);
    const limits = getControlLimits(profile, entry);
    const sigma = (current - limits.mean) / Math.max(limits.std, 0.01);
    const nearWarn = current >= limits.warnLower && current <= limits.warnUpper ? false : Math.abs(current - limits.mean) <= Math.max(limits.std, 0.01) * 2.2;
    const nearCrit = current >= limits.lcl && current <= limits.ucl ? false : Math.abs(current - limits.mean) <= Math.max(limits.std, 0.01) * 3.15;
    const deviation = current - limits.mean;
    const cpk = entry.type === 'quality' ? computeCpk(limits.mean, limits.std, entry.quality_usl ?? limits.ucl, entry.quality_lsl ?? limits.lcl) : null;
    const target = entry.type === 'quality' ? (entry.quality_target ?? limits.mean) : entry.base_value;
    const targetDeviation = current - target;
    const history = getMachineHistory(machineId, name);
    const recent = history.length ? history[history.length - 1] : current;

    return {
      name,
      type: entry.type,
      unit: entry.unit || '',
      current: round(current, 4),
      baseValue: round(entry.base_value, 4),
      historicalMean: round(limits.mean, 4),
      historicalStd: round(limits.std, 4),
      delta: round(deviation, 4),
      sigmaDelta: round(sigma, 2),
      target: round(target, 4),
      targetDeviation: round(targetDeviation, 4),
      warn: entry.warn,
      crit: entry.crit,
      warnLower: round(limits.warnLower, 4),
      warnUpper: round(limits.warnUpper, 4),
      ucl: round(limits.ucl, 4),
      lcl: round(limits.lcl, 4),
      cpk: cpk != null ? round(cpk, 3) : null,
      trend: trendLabel(current - recent, limits.std),
      correlatedWith: relevantCorrelations(profile, name),
      flagged: Math.abs(sigma) >= 1.5 || nearWarn || nearCrit || (entry.type === 'quality' && cpk != null && cpk < 1.33),
    };
  });

  const flaggedVariables = variables.filter(variable => variable.flagged);
  const alerts = machineAlerts(machineId);
  const anomalyScore = num(machine.anomalyScore, 0);

  const diagnostics = {
    machineId,
    machineName: machine.name,
    process: machine.process,
    line: machine.line,
    status: machine.status,
    anomalyScore: round(anomalyScore, 4),
    anomalyLevel: anomalyScore > 0.75 ? 'high' : anomalyScore > 0.45 ? 'medium' : 'low',
    alerts,
    variables,
    flaggedVariables,
    summary: flaggedVariables.length
      ? `${machineId}: ${flaggedVariables.length} variable${flaggedVariables.length !== 1 ? 's' : ''} fuera de norma`
      : `${machineId}: todas las variables dentro de parámetros`,
  };

  state.csvDiagnostics = state.csvDiagnostics || {};
  state.csvDiagnostics[machineId] = diagnostics;
  return diagnostics;
}

export function buildPlantDiagnostics(machineIds = []) {
  const ids = machineIds.length ? machineIds : Object.keys(MACHINE_PROFILES);
  return ids.map(id => buildMachineDiagnostics(id)).filter(Boolean);
}

export function formatDiagnosticsForLLM(diagnostics) {
  if (!diagnostics) return 'Sin diagnóstico disponible.';

  const lines = [];
  lines.push(`${diagnostics.machineId} (${diagnostics.machineName})`);
  lines.push(`estado=${diagnostics.status}, anomaly=${diagnostics.anomalyScore.toFixed(2)}, nivel=${diagnostics.anomalyLevel}`);

  if (diagnostics.flaggedVariables.length) {
    for (const variable of diagnostics.flaggedVariables) {
      const corrText = variable.correlatedWith.length
        ? variable.correlatedWith.map(item => `${item.name}(r=${item.corr.toFixed(2)})`).join(', ')
        : 'sin correlaciones fuertes';
      const unit = variable.unit ? ` ${variable.unit}` : '';
      lines.push(
        `${variable.name}: actual=${variable.current.toFixed(3)}${unit}, base=${variable.historicalMean.toFixed(3)}${unit}, sd=${variable.historicalStd.toFixed(3)}, ` +
        `desviación=${variable.sigmaDelta.toFixed(2)}σ, tendencia=${variable.trend}, correlaciones=${corrText}`
      );
      if (variable.type === 'quality') {
        lines.push(`  quality: target=${variable.target.toFixed(3)}, cpk=${variable.cpk != null ? variable.cpk.toFixed(2) : '—'}`);
      }
    }
  } else {
    lines.push('todas las variables dentro de parámetros');
  }

  if (diagnostics.alerts.length) {
    lines.push('alertas activas:');
    for (const alert of diagnostics.alerts.slice(0, 5)) {
      lines.push(`  [${alert.sev}] ${alert.title} · ${alert.detail}`);
    }
  }

  return lines.join('\n');
}

export function formatPlantDiagnosticsForLLM(machineIds = []) {
  return buildPlantDiagnostics(machineIds).map(diag => formatDiagnosticsForLLM(diag)).join('\n\n');
}
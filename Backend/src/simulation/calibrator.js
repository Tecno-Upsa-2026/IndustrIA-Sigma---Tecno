import { state, MACHINE_PROFILES } from '../store/state.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function std(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function autocorrelation(values) {
  if (values.length < 3) return 0;
  const avg = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length - 1; i++) {
    numerator += (values[i] - avg) * (values[i + 1] - avg);
  }
  for (const value of values) {
    denominator += (value - avg) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function linearTrend(values) {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function calibrateFromDataRows(dataRows = []) {
  const groups = new Map();

  for (const row of dataRows) {
    const key = `${row.machine_id}::${row.var_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const calibrations = {};

  for (const [key, rows] of groups.entries()) {
    const values = rows.map(row => row.value).filter(Number.isFinite);
    if (!values.length) continue;

    const sorted = [...rows].sort((a, b) => a.ts - b.ts).map(row => row.value);
    const avg = mean(values);
    const deviation = std(values);
    const r1 = autocorrelation(sorted);
    const trend = linearTrend(sorted);

    calibrations[key] = {
      mean: avg,
      std: deviation,
      autocorrelation: r1,
      trend,
      spring: clamp(Math.abs(r1) * 0.08 + 0.02, 0.01, 0.1),
      drift: trend * 0.01,
      count: values.length,
    };
  }

  return calibrations;
}

export function applyCalibration(calibrations = {}) {
  let updated = 0;

  for (const machine of Object.values(state.machines)) {
    const profile = MACHINE_PROFILES[machine.id];
    if (!profile) continue;

    for (const [varName, entry] of Object.entries(profile.variables)) {
      const calibration = calibrations[`${machine.id}::${varName}`];
      if (!calibration) continue;

      entry.base_value = calibration.mean;
      entry.noise = calibration.std;
      entry.spring = calibration.spring;
      entry.drift = calibration.drift;
      entry.value = calibration.mean;
      entry.calibrated = true;

      if (machine.vars[varName]) {
        machine.vars[varName].base_value = calibration.mean;
        machine.vars[varName].noise = calibration.std;
        machine.vars[varName].spring = calibration.spring;
        machine.vars[varName].drift = calibration.drift;
        machine.vars[varName].value = calibration.mean;
      }

      if (machine[varName] !== undefined) {
        machine[varName] = calibration.mean;
      }

      updated++;
    }

    const primaryVar = profile.summaryVars?.temp || profile.primaryVar;
    if (primaryVar && machine.vars[primaryVar]) {
      machine.temp = machine.vars[primaryVar].value;
      machine.primaryValue = machine.vars[primaryVar].value;
    }
    const vibVar = profile.summaryVars?.vib;
    if (vibVar && machine.vars[vibVar]) machine.vib = machine.vars[vibVar].value;
    const loadVar = profile.summaryVars?.load || primaryVar;
    if (loadVar && machine.vars[loadVar]) machine.load = machine.vars[loadVar].value;
    const energyVar = profile.summaryVars?.energy;
    if (energyVar && machine.vars[energyVar]) machine.energy = machine.vars[energyVar].value;

    machine.defect = clamp(profile.defectBase, 0, 20);
    machine.oee = clamp(96 - machine.defect * 4, 0, 100);
  }

  return updated;
}

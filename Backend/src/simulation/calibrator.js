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

function pearsonCorr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const num = xs.slice(0, n).reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const da  = Math.sqrt(xs.slice(0, n).reduce((acc, x) => acc + (x - mx) ** 2, 0));
  const db  = Math.sqrt(ys.slice(0, n).reduce((acc, y) => acc + (y - my) ** 2, 0));
  return (da && db) ? parseFloat((num / (da * db)).toFixed(4)) : 0;
}

// Returns { calibrations, correlationsByMachine }
// calibrations: { "machineId::varName": { mean, std, spring, drift, ... } }
// correlationsByMachine: { machineId: { varA: { varB: r, ... } } }
export function calibrateFromDataRows(dataRows = []) {
  const byMachine = new Map();

  for (const row of dataRows) {
    if (!byMachine.has(row.machine_id)) byMachine.set(row.machine_id, new Map());
    const byVar = byMachine.get(row.machine_id);
    if (!byVar.has(row.var_name)) byVar.set(row.var_name, []);
    byVar.get(row.var_name).push(row);
  }

  const calibrations = {};
  const correlationsByMachine = {};

  for (const [machineId, byVar] of byMachine.entries()) {
    const varSeries = {};
    correlationsByMachine[machineId] = {};

    for (const [varName, rows] of byVar.entries()) {
      const sorted = [...rows].sort((a, b) => a.ts - b.ts);
      const values = sorted.map(row => row.value).filter(Number.isFinite);
      if (!values.length) continue;

      varSeries[varName] = values;

      const avg       = mean(values);
      const deviation = std(values);
      const r1        = autocorrelation(values);
      const trend     = linearTrend(values);

      calibrations[`${machineId}::${varName}`] = {
        mean:            avg,
        std:             deviation,
        autocorrelation: r1,
        trend,
        spring:          clamp(Math.abs(r1) * 0.08 + 0.02, 0.01, 0.1),
        drift:           trend * 0.01,
        count:           values.length,
        controlLimits: {
          mean:        avg,
          std:         deviation,
          upper2Sigma: avg + deviation * 2,
          lower2Sigma: avg - deviation * 2,
          upper3Sigma: avg + deviation * 3,
          lower3Sigma: avg - deviation * 3,
        },
      };
    }

    // Pairwise Pearson correlations between all variables of this machine
    const varNames = Object.keys(varSeries);
    for (let i = 0; i < varNames.length; i++) {
      const nameA = varNames[i];
      correlationsByMachine[machineId][nameA] = {};
      for (let j = 0; j < varNames.length; j++) {
        if (i === j) continue;
        const nameB = varNames[j];
        const r = pearsonCorr(varSeries[nameA], varSeries[nameB]);
        if (Math.abs(r) >= 0.15) {
          correlationsByMachine[machineId][nameA][nameB] = r;
        }
      }
    }
  }

  return { calibrations, correlationsByMachine };
}

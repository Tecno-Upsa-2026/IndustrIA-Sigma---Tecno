// ─────────────────────────────────────────────────────────────────────────────
// Industrial metrics calculator: SPC stats, OEE, Cp/Cpk, DPMO, Sigma Level.
// ─────────────────────────────────────────────────────────────────────────────

import { state, getMachinesArray, MACHINE_PROFILES } from '../store/state.js';

// Normal distribution inverse (approximation — Beasley-Springer-Moro)
function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return  Infinity;
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    return y * (((a[3]*r+a[2])*r+a[1])*r+a[0]) / ((((b[3]*r+b[2])*r+b[1])*r+b[0])*r+1);
  }
  let r = p < 0.5 ? p : 1 - p;
  r = Math.log(-Math.log(r));
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] * Math.pow(r, i);
  return p < 0.5 ? -x : x;
}

// ── SPC stats from array of points ───────────────────────────────────────────
export function calcSPCStats(points) {
  const n = points.length;
  if (!n) {
    return { points, mean: 0, sd: 0, ucl: 0, lcl: 0, usl: 0, lsl: 0, cp: 0, cpk: 0, oocIndices: [], wecoIndices: [] };
  }

  const mean = points.reduce((sum, value) => sum + value, 0) / n;
  const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const safeSd = sd > 1e-9 ? sd : 1e-9;
  const ucl = mean + 3 * safeSd;
  const lcl = mean - 3 * safeSd;
  const usl = mean + 2.5 * safeSd + 0.15;
  const lsl = mean - 2.5 * safeSd - 0.15;
  const cp = (usl - lsl) / (6 * safeSd);
  const cpk = Math.min((usl - mean) / (3 * safeSd), (mean - lsl) / (3 * safeSd));

  const oocIndices = points.reduce((indices, value, index) => {
    if (value > ucl || value < lcl) indices.push(index);
    return indices;
  }, []);
  const wecoIndices = detectWECO(points, mean, safeSd);

  return { points, mean, sd, ucl, lcl, usl, lsl, cp, cpk, oocIndices, wecoIndices };
}

function pushRule(hits, index, rule) {
  const item = hits.get(index) || { index, rules: [] };
  if (!item.rules.includes(rule)) item.rules.push(rule);
  hits.set(index, item);
}

function sideOf(value, mean) {
  if (value > mean) return 1;
  if (value < mean) return -1;
  return 0;
}

// Standard WECO rules (Western Electric Company rules):
// R1 — 1 point beyond ±3σ
// R2 — 9 consecutive points on the same side of the mean
// R3 — 6 consecutive points monotonically increasing or decreasing
// R4 — 14 consecutive points alternating up/down
// R5 — 2 of 3 consecutive points beyond ±2σ (zone A), same side
// R6 — 4 of 5 consecutive points beyond ±1σ (zone B or beyond), same side
// R7 — 15 consecutive points within ±1σ (zone C, any side)
// R8 — 8 consecutive points beyond ±1σ on both sides (outside zone C)
function detectWECO(points, mean, sd) {
  const hits = new Map();
  const zone1 = sd;
  const zone2 = 2 * sd;
  const zone3 = 3 * sd;

  // R1: 1 point beyond ±3σ
  for (let i = 0; i < points.length; i++) {
    if (Math.abs(points[i] - mean) > zone3) pushRule(hits, i, 'R1');
  }

  // R2: 9 consecutive points on the same side of the mean
  for (let i = 8; i < points.length; i++) {
    const window = points.slice(i - 8, i + 1);
    const side0 = sideOf(window[0], mean);
    if (side0 !== 0 && window.every(v => sideOf(v, mean) === side0)) pushRule(hits, i, 'R2');
  }

  // R3: 6 consecutive points monotonically increasing or decreasing
  for (let i = 5; i < points.length; i++) {
    const window = points.slice(i - 5, i + 1);
    let up = true, down = true;
    for (let j = 1; j < window.length; j++) {
      if (!(window[j] > window[j - 1])) up   = false;
      if (!(window[j] < window[j - 1])) down = false;
    }
    if (up || down) pushRule(hits, i, 'R3');
  }

  // R4: 14 consecutive points alternating above/below mean
  for (let i = 13; i < points.length; i++) {
    const window = points.slice(i - 13, i + 1);
    let alternating = true;
    let lastSide = sideOf(window[0], mean);
    if (lastSide === 0) alternating = false;
    for (let j = 1; j < window.length && alternating; j++) {
      const cur = sideOf(window[j], mean);
      if (cur === 0 || cur === lastSide) alternating = false;
      lastSide = cur;
    }
    if (alternating) pushRule(hits, i, 'R4');
  }

  // R5: 2 of 3 consecutive points beyond ±2σ (zone A), same side
  for (let i = 2; i < points.length; i++) {
    const window = [points[i - 2], points[i - 1], points[i]];
    const zoneA = window.filter(v => Math.abs(v - mean) > zone2);
    if (zoneA.length >= 2) {
      const allSameSide = zoneA.every(v => sideOf(v, mean) !== 0 && sideOf(v, mean) === sideOf(zoneA[0], mean));
      if (allSameSide) pushRule(hits, i, 'R5');
    }
  }

  // R6: 4 of 5 consecutive points beyond ±1σ (zone B or beyond), same side
  for (let i = 4; i < points.length; i++) {
    const window = points.slice(i - 4, i + 1);
    const zoneB = window.filter(v => Math.abs(v - mean) > zone1);
    if (zoneB.length >= 4) {
      const allSameSide = zoneB.every(v => sideOf(v, mean) !== 0 && sideOf(v, mean) === sideOf(zoneB[0], mean));
      if (allSameSide) pushRule(hits, i, 'R6');
    }
  }

  // R7: 15 consecutive points within ±1σ (zone C, any side — hugging the mean)
  for (let i = 14; i < points.length; i++) {
    const window = points.slice(i - 14, i + 1);
    if (window.every(v => Math.abs(v - mean) <= zone1)) pushRule(hits, i, 'R7');
  }

  // R8: 8 consecutive points beyond ±1σ on either side (outside zone C, both sides present)
  for (let i = 7; i < points.length; i++) {
    const window = points.slice(i - 7, i + 1);
    const allOutsideC = window.every(v => Math.abs(v - mean) > zone1);
    if (allOutsideC) {
      const hasBothSides = window.some(v => v > mean) && window.some(v => v < mean);
      if (hasBothSides) pushRule(hits, i, 'R8');
    }
  }

  return Array.from(hits.values()).sort((a, b) => a.index - b.index);
}

// ── Global platform metrics ───────────────────────────────────────────────────
export function calcGlobalMetrics() {
  const machines = getMachinesArray().filter(m => m.status !== 'IDLE');
  if (!machines.length) return {};

  const avgOEE    = machines.reduce((s, m) => s + m.oee, 0) / machines.length;
  const avgDefect = machines.reduce((s, m) => s + m.defect, 0) / machines.length;
  const totalEnergy = Object.values(state.machines).reduce((s, m) => s + (m.energy || 0), 0);

  // DPMO from defect rate
  const dpmo = Math.round(avgDefect * 10000);

  // Sigma level (industry: 1.5σ shift)
  const yieldPct = Math.max(0, 100 - avgDefect);
  const sigmaRaw = normInv(1 - dpmo / 1e6);
  const sigma = parseFloat((sigmaRaw + 1.5).toFixed(2));

  // Active alerts
  const activeAlerts = state.alerts.filter(a => a.status === 'active').length;

  // Production: latest value
  const latestProd = state.productionHistory[state.productionHistory.length - 1]?.value || 1840;

  const capabilitySamples = [];
  for (const pts of Object.values(state.spcWindows)) {
    if (Array.isArray(pts) && pts.length >= 2) capabilitySamples.push(calcSPCStats(pts));
  }
  const avgCp = capabilitySamples.length ? capabilitySamples.reduce((sum, sample) => sum + sample.cp, 0) / capabilitySamples.length : 0;
  const avgCpk = capabilitySamples.length ? capabilitySamples.reduce((sum, sample) => sum + sample.cpk, 0) / capabilitySamples.length : 0;

  return {
    oee:          parseFloat(avgOEE.toFixed(1)),
    sigma:        isFinite(sigma) ? sigma : 4.5,
    yield:        parseFloat(yieldPct.toFixed(1)),
    dpmo:         dpmo,
    activeAlerts,
    energy:       Math.round(totalEnergy),
    production:   latestProd,
    cp:           parseFloat(avgCp.toFixed(2)),
    cpk:          parseFloat(avgCpk.toFixed(2)),
  };
}

// ── Simulator result calculator ───────────────────────────────────────────────
// When machineId + params.vars are provided, uses profile-aware physics.
// Falls back to the generic 5-param model for backward compatibility.
export function calcSimResults(params, machineId) {
  const profile = machineId ? MACHINE_PROFILES[machineId] : null;
  if (profile && params?.vars) {
    return calcMachineSimResults(params.vars, profile);
  }

  const { temp = 220, speed = 100, pressure = 150, vibration = 0.5, torque = 214 } = params || {};
  const tempDev   = Math.abs(temp - 220) / 20;
  const speedDev  = Math.abs(speed - 100) / 100;
  const vibEffect = vibration / 0.5;
  const defect    = parseFloat(Math.max(0.1, 1.0 + tempDev * 4 + vibEffect * 2 + speedDev * 1.5).toFixed(2));
  const cp        = parseFloat(Math.max(0.5, 1.55 - tempDev * 0.5 - vibEffect * 0.3).toFixed(3));
  const cpk       = parseFloat((cp * 0.92).toFixed(3));
  const yieldVal  = parseFloat(Math.max(70, 100 - defect * 1.2).toFixed(1));
  const dpmo      = Math.round(defect * 10000);
  const sigmaRaw  = normInv(1 - dpmo / 1e6);
  const sigma     = parseFloat(((isFinite(sigmaRaw) ? sigmaRaw : 4) + 1.5).toFixed(2));
  const energyVal = Math.round(380 + speed * 0.8 + torque * 0.1);
  const production= Math.round(1400 + speed * 5 - defect * 20);
  const riskPct   = Math.round(Math.min(99, 20 + tempDev * 60 + vibEffect * 40));
  return { defect, cp, cpk, yield: yieldVal, dpmo, sigma, energy: energyVal, production, risk: riskPct };
}

function calcMachineSimResults(vars, profile) {
  let totalPenalty = 0;
  let count = 0;

  for (const [varName, value] of Object.entries(vars)) {
    const pvar = profile.variables[varName];
    if (!pvar) continue;
    const range = Math.max(pvar.max - pvar.min, 1);
    const dev   = Math.abs(value - pvar.base_value) / range;
    totalPenalty += pvar.type === 'quality' ? dev * 4 : dev * 2;
    count++;
  }

  const avgPenalty = count ? totalPenalty / count : 0;
  const defect     = parseFloat(Math.max(0.1, profile.defectBase + avgPenalty * 5).toFixed(2));
  const cp         = parseFloat(Math.max(0.5, 1.55 - avgPenalty * 0.8).toFixed(3));
  const cpk        = parseFloat((cp * 0.92).toFixed(3));
  const yieldVal   = parseFloat(Math.max(70, 100 - defect * 1.2).toFixed(1));
  const dpmo       = Math.round(defect * 10000);
  const sigma      = parseFloat(Math.max(1.5, 5 - defect * 0.3).toFixed(2));

  const loadVar   = profile.summaryVars?.load || profile.primaryVar;
  const loadPvar  = loadVar ? profile.variables[loadVar] : null;
  const loadVal   = loadVar ? (vars[loadVar] ?? loadPvar?.base_value ?? 0) : 0;
  const loadMin   = loadPvar?.min ?? 0;
  const loadMax   = loadPvar?.max ?? Math.max(loadVal * 2, 1);
  const loadPct   = (loadVal - loadMin) / Math.max(loadMax - loadMin, 1);

  const energyVar  = profile.summaryVars?.energy;
  const energyBase = energyVar ? (profile.variables[energyVar]?.base_value ?? 0) : 0;
  const energyVal  = energyBase > 0
    ? Math.round(energyBase * (1 + avgPenalty * 0.3))
    : Math.round(200 + loadPct * 300 + avgPenalty * 100);

  const production = Math.round(600 + loadPct * 800 - defect * 15);
  const riskPct    = Math.round(Math.min(99, 10 + avgPenalty * 80));

  return { defect, cp, cpk, yield: yieldVal, dpmo, sigma, energy: energyVal, production, risk: riskPct };
}

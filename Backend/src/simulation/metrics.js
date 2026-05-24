// ─────────────────────────────────────────────────────────────────────────────
// Industrial metrics calculator: SPC stats, OEE, Cp/Cpk, DPMO, Sigma Level.
// ─────────────────────────────────────────────────────────────────────────────

import { state, getMachinesArray } from '../store/state.js';

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

function detectWECO(points, mean, sd) {
  const hits = new Map();
  const zone1 = sd;
  const zone2 = 2 * sd;
  const zone3 = 3 * sd;

  for (let i = 0; i < points.length; i++) {
    const value = points[i];
    if (Math.abs(value - mean) > zone3) pushRule(hits, i, 'R1');
  }

  for (let i = 2; i < points.length; i++) {
    const window = [points[i - 2], points[i - 1], points[i]];
    const zoneA = window.filter(v => Math.abs(v - mean) > zone2);
    if (zoneA.length >= 2) {
      pushRule(hits, i, 'R2');
      const sameSide = zoneA.every(v => sideOf(v, mean) === sideOf(zoneA[0], mean) && sideOf(v, mean) !== 0);
      if (sameSide) pushRule(hits, i, 'R8');
    }
  }

  for (let i = 4; i < points.length; i++) {
    const window = points.slice(i - 4, i + 1);
    const zoneB = window.filter(v => Math.abs(v - mean) > zone1);
    if (zoneB.length >= 4) pushRule(hits, i, 'R3');
  }

  for (let i = 7; i < points.length; i++) {
    const window = points.slice(i - 7, i + 1);
    const sameSide = window.every(v => sideOf(v, mean) !== 0 && sideOf(v, mean) === sideOf(window[0], mean));
    if (sameSide) pushRule(hits, i, 'R4');
  }

  for (let i = 14; i < points.length; i++) {
    const window = points.slice(i - 14, i + 1);
    const allInsideC = window.every(v => Math.abs(v - mean) <= zone1);
    if (allInsideC) pushRule(hits, i, 'R5');
  }

  for (let i = 7; i < points.length; i++) {
    const window = points.slice(i - 7, i + 1);
    let increasing = true;
    let decreasing = true;
    for (let j = 1; j < window.length; j++) {
      if (!(window[j] > window[j - 1])) increasing = false;
      if (!(window[j] < window[j - 1])) decreasing = false;
    }
    if (increasing || decreasing) pushRule(hits, i, 'R6');
  }

  for (let i = 13; i < points.length; i++) {
    const window = points.slice(i - 13, i + 1);
    let alternating = true;
    let lastSide = sideOf(window[0], mean);
    if (lastSide === 0) alternating = false;
    for (let j = 1; j < window.length && alternating; j++) {
      const currentSide = sideOf(window[j], mean);
      if (currentSide === 0 || currentSide === lastSide) alternating = false;
      lastSide = currentSide;
    }
    if (alternating) pushRule(hits, i, 'R7');
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
export function calcSimResults(params) {
  // Physics model: how params affect quality
  const { temp, speed, pressure, vibration, torque } = params;

  // Baseline temp 220°C — deviation degrades Cp
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

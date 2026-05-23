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
  const n    = points.length;
  const mean = points.reduce((s, v) => s + v, 0) / n;
  const sd   = Math.sqrt(points.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const ucl  = mean + 3 * sd;
  const lcl  = mean - 3 * sd;
  const usl  = mean + 2.5 * sd + 0.15;
  const lsl  = mean - 2.5 * sd - 0.15;

  // Process capability
  const cp  = (usl - lsl) / (6 * sd);
  const cpk = Math.min((usl - mean) / (3 * sd), (mean - lsl) / (3 * sd));

  // WECO rule detections
  const oocIndices  = points.reduce((a, v, i) => { if (v > ucl || v < lcl) a.push(i); return a; }, []);
  const wecoIndices = detectWECO(points, mean, sd, ucl, lcl);

  return { points, mean, sd, ucl, lcl, usl, lsl, cp, cpk, oocIndices, wecoIndices };
}

// ── WECO rule 1 (any point beyond ±3σ) already covered by OOC.
//    Rule 5: 2 of 3 consecutive in zone A (beyond ±2σ)
function detectWECO(pts, mean, sd) {
  const hits = [];
  const zoneA = 2 * sd;
  for (let i = 2; i < pts.length; i++) {
    const window = [pts[i-2], pts[i-1], pts[i]];
    const beyond = window.filter(v => Math.abs(v - mean) > zoneA).length;
    if (beyond >= 2) hits.push(i);
  }
  return hits;
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

  return {
    oee:          parseFloat(avgOEE.toFixed(1)),
    sigma:        isFinite(sigma) ? sigma : 4.5,
    yield:        parseFloat(yieldPct.toFixed(1)),
    dpmo:         dpmo,
    activeAlerts,
    energy:       Math.round(totalEnergy),
    production:   latestProd,
    cp:           1.42,   // aggregate capability (demo value)
    cpk:          1.31,
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

import { Router } from 'express';
import { state, getMachinesArray } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';

const router = Router();

// GET /api/lss/metrics — DPMO, Sigma, Yield, Cp, RTY, savings
router.get('/metrics', (_req, res) => {
  const g = calcGlobalMetrics();
  const machines = getMachinesArray().filter(m => m.status !== 'IDLE');
  const avgDpmo = g.dpmo;
  const rty = parseFloat((machines.reduce((s,m) => s + (100-m.defect), 0) / machines.length).toFixed(1));
  res.json({
    dpmo:        avgDpmo,
    sigma:       g.sigma,
    yield:       g.yield,
    rty,
    cp:          g.cp,
    cpk:         g.cpk,
    savingsYTD:  182000,
  });
});

// GET /api/lss/pareto
router.get('/pareto', (_req, res) => {
  // Dynamic pareto based on current machine states
  const base = [
    { cause:'Temperatura', count:148 },
    { cause:'Vibración',   count:97  },
    { cause:'Presión',     count:64  },
    { cause:'Material',    count:42  },
    { cause:'Operario',    count:28  },
    { cause:'Calibración', count:18  },
    { cause:'Otros',       count:10  },
  ];
  // Slightly jitter counts based on live machine data
  const ovenTemp = state.machines['OVN-09']?.temp || 248;
  base[0].count = Math.round(148 + (ovenTemp - 248) * 2);
  res.json(base);
});

// GET /api/lss/yield-by-line
router.get('/yield-by-line', (_req, res) => {
  const byLine = {};
  for (const m of getMachinesArray()) {
    if (!byLine[m.line]) byLine[m.line] = { machines:[], defectSum:0, count:0 };
    if (m.status !== 'IDLE') {
      byLine[m.line].defectSum += m.defect;
      byLine[m.line].count++;
    }
  }
  const result = Object.entries(byLine).map(([line, d]) => ({
    line,
    yield: d.count ? parseFloat((100 - d.defectSum / d.count).toFixed(1)) : 100,
  }));
  res.json(result);
});

// GET /api/lss/dpmo-trend — last 30 data points
router.get('/dpmo-trend', (_req, res) => {
  const pts = state.productionHistory.slice(-30).map((p, i) => ({
    i,
    ts:   p.ts,
    dpmo: Math.max(800, 1500 - i * 20 + (Math.random() - 0.5) * 80),
  }));
  res.json(pts);
});

// GET /api/lss/dmaic — DMAIC project status
router.get('/dmaic', (_req, res) => {
  res.json({
    project: 'INJ-07 yield uplift',
    phases: [
      { p:'D', name:'Define',  pct:100, c:'#22D3EE' },
      { p:'M', name:'Measure', pct:100, c:'#22D3EE' },
      { p:'A', name:'Analyze', pct:74,  c:'#A855F7' },
      { p:'I', name:'Improve', pct:32,  c:'#F59E0B' },
      { p:'C', name:'Control', pct:8,   c:'#64748B' },
    ],
  });
});

export default router;

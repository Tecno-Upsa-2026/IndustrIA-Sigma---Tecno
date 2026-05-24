import { Router } from 'express';
import { state } from '../store/state.js';
import { calcSPCStats } from '../simulation/metrics.js';

const router = Router();

// GET /api/spc/:machineId
router.get('/:machineId', (req, res) => {
  const pts = state.spcWindows[req.params.machineId];
  if (!pts) return res.status(404).json({ error: 'Máquina no encontrada' });
  res.json(calcSPCStats(pts));
});

// GET /api/spc/:machineId/latest — last 10 subgroups for table
router.get('/:machineId/latest', (req, res) => {
  const pts = state.spcWindows[req.params.machineId];
  if (!pts) return res.status(404).json({ error: 'Máquina no encontrada' });
  const stats = calcSPCStats(pts);
  const last10 = pts.slice(-10).map((v, i) => {
    const idx = pts.length - 10 + i;
    const ooc  = v > stats.ucl || v < stats.lcl;
    const warn = v > stats.usl || v < stats.lsl;
    const weco = stats.wecoIndices.find(hit => hit.index === idx)?.rules || [];
    return {
      idx: idx + 1,
      ts:  Date.now() - (10 - i) * 60000,
      xbar: parseFloat(v.toFixed(4)),
      r:   parseFloat((Math.random() * 0.4 + 0.1).toFixed(4)),
      sd:  parseFloat((Math.random() * 0.2 + 0.05).toFixed(4)),
      usl: parseFloat(stats.usl.toFixed(3)),
      lsl: parseFloat(stats.lsl.toFixed(3)),
      status: ooc ? 'OOC' : warn ? 'WARN' : 'OK',
      weco:   weco.length ? weco.join(',') : (ooc ? 'R1' : warn ? 'R5' : '—'),
    };
  });
  res.json({ ...stats, last10 });
});

// GET /api/spc  — all machines overview
router.get('/', (_req, res) => {
  const result = {};
  for (const [id, pts] of Object.entries(state.spcWindows)) {
    if (pts.length < 2) continue;
    const s = calcSPCStats(pts);
    result[id] = { cp: s.cp, cpk: s.cpk, oocCount: s.oocIndices.length };
  }
  res.json(result);
});

export default router;

import { Router } from 'express';
import { state, getMachinesArray, getActiveAlerts } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';

const router = Router();

// GET /api/dashboard — full dashboard snapshot
router.get('/', (_req, res) => {
  const metrics = calcGlobalMetrics();
  res.json({
    metrics,
    machines:  getMachinesArray(),
    alerts:    getActiveAlerts().slice(0, 10),
    events:    state.events.slice(0, 15),
    production: state.productionHistory.slice(-60),
    wsClients: 0,
  });
});

// GET /api/dashboard/production?range=24h|7d|30d
router.get('/production', (req, res) => {
  const range  = req.query.range || '24h';
  const limit  = range === '30d' ? 1440 : range === '7d' ? 10080 : 60;
  const points = state.productionHistory.slice(-limit);
  res.json({ range, points });
});

export default router;

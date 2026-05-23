import { Router } from 'express';
import { state, getActiveAlerts, addEvent } from '../store/state.js';
import { broadcaster } from '../ws/broadcaster.js';

const router = Router();

// GET /api/alerts?sev=CRITICAL|HIGH|MEDIUM|LOW&status=active|acknowledged|closed
router.get('/', (req, res) => {
  let list = [...state.alerts];
  if (req.query.sev)    list = list.filter(a => a.sev === req.query.sev.toUpperCase());
  if (req.query.status) list = list.filter(a => a.status === req.query.status);
  else                  list = list.filter(a => a.status !== 'closed');
  res.json(list);
});

// GET /api/alerts/:id
router.get('/:id', (req, res) => {
  const a = state.alerts.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alerta no encontrada' });
  res.json(a);
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', (req, res) => {
  const a = state.alerts.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alerta no encontrada' });
  a.status = 'acknowledged';
  a.acknowledgedAt = Date.now();
  a.acknowledgedBy = 'L. Mendoza';
  addEvent(`Alerta ${a.id} reconocida`, 'info');
  broadcaster.emit({ type:'ALERT_UPDATE', alert: a });
  res.json(a);
});

// PATCH /api/alerts/:id/escalate
router.patch('/:id/escalate', (req, res) => {
  const a = state.alerts.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alerta no encontrada' });
  const { to, message } = req.body;
  a.escalated = true;
  a.escalatedTo = to || 'Plant Manager';
  a.escalationMessage = message || '';
  a.escalatedAt = Date.now();
  addEvent(`Alerta ${a.id} escalada a ${a.escalatedTo}`, 'warn');
  broadcaster.emit({ type:'ALERT_UPDATE', alert: a });
  res.json(a);
});

// DELETE /api/alerts/:id — close alert
router.delete('/:id', (req, res) => {
  const a = state.alerts.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alerta no encontrada' });
  a.status = 'closed';
  a.closedAt = Date.now();
  addEvent(`Alerta ${a.id} cerrada`, 'ok');
  broadcaster.emit({ type:'ALERT_UPDATE', alert: a });
  res.json({ ok: true });
});

// PATCH /api/alerts/mark-all — acknowledge all active
router.patch('/mark-all', (req, res) => {
  let count = 0;
  for (const a of state.alerts) {
    if (a.status === 'active') {
      a.status = 'acknowledged';
      a.acknowledgedAt = Date.now();
      count++;
    }
  }
  addEvent(`${count} alertas marcadas como reconocidas`, 'info');
  broadcaster.emit({ type:'ALERTS_BULK_UPDATE' });
  res.json({ ok: true, count });
});

// POST /api/alerts/:id/apply — apply AI recommendation (command to machine)
router.post('/:id/apply', (req, res) => {
  const a = state.alerts.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alerta no encontrada' });

  const machine = state.machines[a.machine];
  if (machine) {
    // Apply setpoint based on alert type
    if (a.title.toLowerCase().includes('temperatura') || a.title.toLowerCase().includes('calentamiento')) {
      machine.setpointOverride = 230;
      addEvent(`Setpoint aplicado automáticamente ${a.machine} → 230°C`, 'ok');
    }
  }

  a.status = 'acknowledged';
  a.appliedAt = Date.now();
  broadcaster.emit({ type:'ALERT_UPDATE', alert: a });
  broadcaster.emit({ type:'COMMAND_APPLIED', machineId: a.machine, action:'setpoint', value: 230 });

  res.json({ ok: true, message: 'Acción aplicada correctamente. Setpoint ajustado.' });
});

// GET /api/alerts/stats
router.get('/stats/summary', (_req, res) => {
  const active = state.alerts.filter(a => a.status !== 'closed');
  res.json({
    total:    active.length,
    critical: active.filter(a => a.sev === 'CRITICAL').length,
    high:     active.filter(a => a.sev === 'HIGH').length,
    medium:   active.filter(a => a.sev === 'MEDIUM').length,
    low:      active.filter(a => a.sev === 'LOW').length,
  });
});

export default router;

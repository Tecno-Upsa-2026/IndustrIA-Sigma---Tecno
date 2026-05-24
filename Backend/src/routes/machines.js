import { Router } from 'express';
import { state, getMachinesArray, addEvent } from '../store/state.js';
import { MACHINE_PROFILES } from '../store/state.js';
import { broadcaster } from '../ws/broadcaster.js';

const router = Router();

// GET /api/machines
router.get('/', (_req, res) => {
  res.json(getMachinesArray());
});

// GET /api/machines/:id
router.get('/:id', (req, res) => {
  const m = state.machines[req.params.id];
  if (!m) return res.status(404).json({ error: 'Máquina no encontrada' });

  // Include SPC window
  const spc = state.spcWindows[m.id] || [];
  res.json({ ...m, spcWindow: spc });
});

// POST /api/machines — add new machine
router.post('/', (req, res) => {
  const { id, name, line } = req.body;
  if (!id || !name || !line) return res.status(400).json({ error: 'id, name y line son requeridos' });
  if (state.machines[id]) return res.status(409).json({ error: 'ID ya existe' });

  const machine = {
    id, name, line,
    process: 'CUSTOM',
    status: 'IDLE', temp: 24, vib: 0.05, rpm: 0,
    load: 0, defect: 0, oee: 0, energy: 2,
    vars: {},
    quality: {},
    setpointOverride: null,
  };
  state.machines[id] = machine;
  state.spcWindows[id] = [];
  addEvent(`Máquina ${id} registrada`, 'info');
  broadcaster.emit({ type:'MACHINE_ADDED', machine });
  res.status(201).json(machine);
});

// PATCH /api/machines/:id — update config (name, line, setpoint)
router.patch('/:id', (req, res) => {
  const m = state.machines[req.params.id];
  if (!m) return res.status(404).json({ error: 'Máquina no encontrada' });

  const allowed = ['name', 'line', 'status', 'setpointOverride'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) m[k] = req.body[k];
  }

  // If setpoint changed, log it
  if (req.body.setpointOverride !== undefined) {
    addEvent(`Setpoint ${m.id} → ${req.body.setpointOverride}°C`, 'info');
    broadcaster.emit({ type:'SETPOINT_CHANGED', machineId: m.id, value: req.body.setpointOverride });
  }

  res.json(m);
});

// DELETE /api/machines/:id
router.delete('/:id', (req, res) => {
  const m = state.machines[req.params.id];
  if (!m) return res.status(404).json({ error: 'Máquina no encontrada' });

  delete state.machines[req.params.id];
  delete state.spcWindows[req.params.id];
  addEvent(`Máquina ${req.params.id} eliminada`, 'info');
  broadcaster.emit({ type:'MACHINE_REMOVED', machineId: req.params.id });
  res.json({ ok: true });
});

// POST /api/machines/:id/command — apply AI recommendation (setpoint, etc.)
router.post('/:id/command', (req, res) => {
  const m = state.machines[req.params.id];
  if (!m) return res.status(404).json({ error: 'Máquina no encontrada' });

  const { action, value } = req.body;

  if (action === 'setpoint') {
    m.setpointOverride = parseFloat(value);
    addEvent(`Setpoint aplicado ${m.id} → ${value}°C`, 'ok');
    broadcaster.emit({ type:'COMMAND_APPLIED', machineId: m.id, action, value });
    return res.json({ ok: true, message: `Setpoint de ${m.id} ajustado a ${value}°C` });
  }

  if (action === 'restart') {
    m.status = 'RUNNING';
    addEvent(`${m.id} reiniciada`, 'ok');
    broadcaster.emit({ type:'MACHINE_STATUS_CHANGE', machineId: m.id, from: m.status, to: 'RUNNING' });
    return res.json({ ok: true, message: `${m.id} reiniciada correctamente` });
  }

  res.status(400).json({ error: 'Acción no reconocida' });
});

export default router;

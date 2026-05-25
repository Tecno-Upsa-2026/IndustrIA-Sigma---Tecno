import { Router } from 'express';
import { state, addEvent, MACHINE_PROFILES } from '../store/state.js';
import { calcSimResults } from '../simulation/metrics.js';
import { getRecommendedSetpoints } from '../simulation/optimizer.js';
import { broadcaster } from '../ws/broadcaster.js';

const router = Router();

// GET /api/simulator — current state
router.get('/', (_req, res) => {
  res.json({
    status:    state.simulator.status,
    params:    state.simulator.params,
    results:   state.simulator.results,
    history:   state.simulator.history.slice(-60),
    scenarios: state.simulator.scenarios,
  });
});

// PATCH /api/simulator/params — update parameters
// Accepts { machineId, vars: { varName: value } } for machine-specific simulation
// or legacy { temp, speed, pressure, vibration, torque } for generic model
router.patch('/params', (req, res) => {
  const { temp, speed, pressure, vibration, torque, machineId, vars } = req.body;

  if (vars && machineId) {
    state.simulator.params = {
      machineId,
      vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, parseFloat(v)])),
    };
    state.simulator.results = calcSimResults(state.simulator.params, machineId);
  } else {
    if (temp      !== undefined) state.simulator.params.temp      = parseFloat(temp);
    if (speed     !== undefined) state.simulator.params.speed     = parseFloat(speed);
    if (pressure  !== undefined) state.simulator.params.pressure  = parseFloat(pressure);
    if (vibration !== undefined) state.simulator.params.vibration = parseFloat(vibration);
    if (torque    !== undefined) state.simulator.params.torque    = parseFloat(torque);
    state.simulator.results = calcSimResults(state.simulator.params);
  }

  broadcaster.emit({ type:'SIM_UPDATE', params: state.simulator.params, results: state.simulator.results });
  res.json({ params: state.simulator.params, results: state.simulator.results });
});

// POST /api/simulator/run — start simulation
router.post('/run', (_req, res) => {
  if (state.simulator.status === 'running') return res.json({ ok:true, message:'Ya en ejecución' });
  state.simulator.status = 'running';
  state.simulator.history = [];
  addEvent('Simulación iniciada', 'info');
  broadcaster.emit({ type:'SIM_STATUS', status:'running' });
  res.json({ ok:true, status:'running' });
});

// POST /api/simulator/stop
router.post('/stop', (_req, res) => {
  state.simulator.status = 'stopped';
  addEvent('Simulación detenida', 'info');
  broadcaster.emit({ type:'SIM_STATUS', status:'stopped' });
  res.json({ ok:true, status:'stopped' });
});

// POST /api/simulator/reset
router.post('/reset', (_req, res) => {
  state.simulator.status  = 'idle';
  state.simulator.params  = { temp:220, speed:100, pressure:150, vibration:0.5, torque:214 };
  state.simulator.results = calcSimResults(state.simulator.params);
  state.simulator.history = [];
  addEvent('Simulación reseteada', 'info');
  broadcaster.emit({ type:'SIM_STATUS', status:'idle' });
  broadcaster.emit({ type:'SIM_UPDATE', params: state.simulator.params, results: state.simulator.results });
  res.json({ ok:true, status:'idle', params: state.simulator.params, results: state.simulator.results });
});

// POST /api/simulator/scenarios — save new scenario
router.post('/scenarios', (req, res) => {
  const { name, desc, type } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  const scenario = {
    id:     `s${Date.now()}`,
    name,
    desc:   desc || '',
    type:   type || 'Custom',
    params: { ...state.simulator.params },
  };
  state.simulator.scenarios.push(scenario);
  res.status(201).json(scenario);
});

// POST /api/simulator/scenarios/:id/load — load saved scenario
router.post('/scenarios/:id/load', (req, res) => {
  const sc = state.simulator.scenarios.find(s => s.id === req.params.id);
  if (!sc) return res.status(404).json({ error: 'Escenario no encontrado' });
  state.simulator.params  = { ...sc.params };
  state.simulator.results = calcSimResults(state.simulator.params);
  broadcaster.emit({ type:'SIM_UPDATE', params: state.simulator.params, results: state.simulator.results });
  res.json({ ok:true, params: state.simulator.params, results: state.simulator.results });
});

// DELETE /api/simulator/scenarios/:id
router.delete('/scenarios/:id', (req, res) => {
  const idx = state.simulator.scenarios.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Escenario no encontrado' });
  state.simulator.scenarios.splice(idx, 1);
  res.json({ ok:true });
});

// POST /api/simulator/optimize — recommend optimal setpoints for a machine
router.post('/optimize', (req, res) => {
  const { machineId } = req.body || {};
  if (!machineId) return res.status(400).json({ error: 'machineId requerido' });

  const profile = MACHINE_PROFILES[machineId];
  if (!profile) return res.status(404).json({ error: 'Máquina no encontrada' });

  const recommendations = getRecommendedSetpoints(profile, { maxCombinations: 500 });
  res.json({
    machineId,
    process: profile.process,
    recommendations,
  });
});

export default router;

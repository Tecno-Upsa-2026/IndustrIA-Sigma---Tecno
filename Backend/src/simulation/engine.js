// ─────────────────────────────────────────────────────────────────────────────
// Simulation engine: 1 Hz tick loop.
// All machines use the generic correlation-based model from simulator.js.
// ─────────────────────────────────────────────────────────────────────────────

import { state, getMachinesArray, addEvent, MACHINE_PROFILES } from '../store/state.js';
import { updateMachine, evalStatus, addSPCPoint } from './physics.js';
import { updateGenericMachine } from './simulator.js';
import { checkThresholds, maybeGenerateEvent } from './alerting.js';
import { calcGlobalMetrics, calcSimResults } from './metrics.js';
import { detectAnomaly, getAnomalyTrend } from './anomaly.js';
import { getRecommendedSetpoints } from './optimizer.js';
import { broadcaster } from '../ws/broadcaster.js';

let simInterval = null;
let prodTimer = 0;

export function startEngine() {
  if (simInterval) return;
  simInterval = setInterval(tick, 1000);
  console.log('  [engine] simulation tick started');
}

export function stopEngine() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

function maybeUpdateProduction() {
  prodTimer++;
  if (prodTimer % 60 !== 0) return;

  const machines = getMachinesArray().filter(machine => machine.status !== 'IDLE');
  const baseRate = machines.reduce((sum, machine) => sum + (machine.oee / 100) * 30, 0);
  const noise = (Math.random() - 0.5) * 40;
  const value = Math.round(Math.max(800, baseRate + noise));
  state.productionHistory.push({ ts: Date.now(), value });
  if (state.productionHistory.length > 1440) state.productionHistory.shift();
}

function tickSimulator() {
  if (state.simulator.status !== 'running') return;
  const machineId = state.simulator.params?.machineId;
  const results   = calcSimResults(state.simulator.params, machineId);
  state.simulator.results = results;
  state.simulator.history.push({ ts: Date.now(), ...results });
  if (state.simulator.history.length > 60) state.simulator.history.shift();
}

function updateMachineByProcess(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile) return updateMachine(machine);
  return updateGenericMachine(machine, profile);
}

function tick() {
  state.tick++;

  for (const machine of getMachinesArray()) {
    updateMachineByProcess(machine);
    const newStatus = evalStatus(machine);

    if (newStatus !== machine.status && machine.status !== 'IDLE') {
      addEvent(`${machine.id} → ${newStatus}`, newStatus === 'CRITICAL' ? 'critical' : newStatus === 'WARN' ? 'warn' : 'ok');
      broadcaster.emit({ type: 'MACHINE_STATUS_CHANGE', machineId: machine.id, from: machine.status, to: newStatus });
    }
    machine.status = newStatus;

    detectAnomaly(machine, MACHINE_PROFILES[machine.id]);

    checkThresholds(machine);

    if (state.tick % 5 === 0) {
      addSPCPoint(state.spcWindows, machine.id, machine, MACHINE_PROFILES[machine.id]);
    }

    if (state.tick % 300 === 0 && machine.status !== 'IDLE') {
      const profile = MACHINE_PROFILES[machine.id];
      if (profile) {
        machine.optimizedSetpoints = getRecommendedSetpoints(profile, { maxCombinations: 500 });
      }
    }
  }

  tickSimulator();
  maybeUpdateProduction();
  maybeGenerateEvent();

  broadcaster.emit({
    type:       'TICK',
    ts:         Date.now(),
    tick:       state.tick,
    machines:   state.machines,
    alerts:     state.alerts.filter(alert => alert.status !== 'closed').slice(0, 20),
    metrics:    calcGlobalMetrics(),
    events:     state.events.slice(0, 15),
    simulator:  { status: state.simulator.status, results: state.simulator.results },
    anomaly:    Object.fromEntries(
      getMachinesArray().map(machine => [machine.id, { score: machine.anomalyScore || 0, trend: getAnomalyTrend(machine.id) || [] }])
    ),
    production: state.productionHistory.slice(-60),
  });
}

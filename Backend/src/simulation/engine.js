// ─────────────────────────────────────────────────────────────────────────────
// Simulation engine: 1 Hz tick loop.
// Updates machine physics, evaluates statuses, runs SPC, broadcasts state.
// ─────────────────────────────────────────────────────────────────────────────

import { state, getMachinesArray, addEvent } from '../store/state.js';
import { updateMachine, evalStatus, addSPCPoint } from './physics.js';
import { checkThresholds, maybeGenerateEvent } from './alerting.js';
import { calcGlobalMetrics, calcSPCStats, calcSimResults } from './metrics.js';
import { broadcaster } from '../ws/broadcaster.js';

let simInterval = null;
let prodTimer   = 0;

export function startEngine() {
  if (simInterval) return;
  simInterval = setInterval(tick, 1000);
  console.log('  [engine] simulation tick started');
}

export function stopEngine() {
  if (simInterval) { clearInterval(simInterval); simInterval = null; }
}

// ── Production history: add a point every 60 ticks (1 per minute) ─────────────
function maybeUpdateProduction() {
  prodTimer++;
  if (prodTimer % 60 === 0) {
    const machines = getMachinesArray().filter(m => m.status !== 'IDLE');
    const baseRate  = machines.reduce((s, m) => s + (m.oee / 100) * 30, 0);
    const noise     = (Math.random() - 0.5) * 40;
    const val       = Math.round(Math.max(800, baseRate + noise));
    state.productionHistory.push({ ts: Date.now(), value: val });
    if (state.productionHistory.length > 1440) state.productionHistory.shift();
  }
}

// ── Simulator sub-loop ────────────────────────────────────────────────────────
function tickSimulator() {
  if (state.simulator.status !== 'running') return;
  const results = calcSimResults(state.simulator.params);
  state.simulator.results = results;
  // Rolling history (60 points)
  state.simulator.history.push({ ts: Date.now(), ...results });
  if (state.simulator.history.length > 60) state.simulator.history.shift();
}

// ── Main tick ─────────────────────────────────────────────────────────────────
function tick() {
  state.tick++;

  // 1. Update each machine
  for (const machine of getMachinesArray()) {
    updateMachine(machine);
    const newStatus = evalStatus(machine);

    // Emit status change event
    if (newStatus !== machine.status && machine.status !== 'IDLE') {
      addEvent(`${machine.id} → ${newStatus}`, newStatus === 'CRITICAL' ? 'critical' : newStatus === 'WARN' ? 'warn' : 'ok');
      broadcaster.emit({ type:'MACHINE_STATUS_CHANGE', machineId: machine.id, from: machine.status, to: newStatus });
    }
    machine.status = newStatus;

    // 2. Threshold alerts
    checkThresholds(machine);

    // 3. SPC point (every 5 ticks ~ 5 seconds)
    if (state.tick % 5 === 0) {
      addSPCPoint(state.spcWindows, machine.id, machine);
    }
  }

  // 4. Simulator
  tickSimulator();

  // 5. Production history
  maybeUpdateProduction();

  // 6. Random events
  maybeGenerateEvent();

  // 7. Broadcast full state snapshot
  broadcaster.emit({
    type:       'TICK',
    ts:         Date.now(),
    tick:       state.tick,
    machines:   state.machines,
    alerts:     state.alerts.filter(a => a.status !== 'closed').slice(0, 20),
    metrics:    calcGlobalMetrics(),
    events:     state.events.slice(0, 15),
    simulator:  { status: state.simulator.status, results: state.simulator.results },
    production: state.productionHistory.slice(-60),
  });
}

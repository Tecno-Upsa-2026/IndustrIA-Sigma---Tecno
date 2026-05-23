// ─────────────────────────────────────────────────────────────────────────────
// Physics model: realistic parameter evolution for each machine.
// Called every tick (1 Hz) by the simulation engine.
// ─────────────────────────────────────────────────────────────────────────────

import { MACHINE_PROFILES } from '../store/state.js';

const rng = lcg(12345);
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
}

// Spring-damper model: value drifts toward target with noise
function springStep(current, target, spring, noise) {
  const force = (target - current) * spring;
  return current + force + (rng() - 0.5) * noise;
}

// Clamp to [min, max]
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Main update function ──────────────────────────────────────────────────────
export function updateMachine(machine) {
  const p = MACHINE_PROFILES[machine.id];
  if (!p) return machine;

  // Allow setpoint overrides (from AI recommendations or user actions)
  const tempTarget = machine.setpointOverride != null ? machine.setpointOverride : p.tempBase;

  // Temperature
  const tempDrift = p.tempDrift || 0;
  machine.temp = clamp(
    springStep(machine.temp, tempTarget, p.tempSpring, p.tempNoise) + tempDrift,
    p.tempMin, p.tempMax
  );

  // Vibration (correlated with load)
  const vibLoadEffect = (machine.load / 100 - 0.5) * 0.05;
  machine.vib = clamp(
    springStep(machine.vib, p.vibBase, 0.04, p.vibNoise) + vibLoadEffect,
    0, 3
  );

  // Load
  if (machine.status !== 'IDLE') {
    machine.load = clamp(
      springStep(machine.load, p.loadBase, 0.03, p.loadNoise),
      10, 100
    );
  }

  // Defect rate (inverse quality)
  const defBase = p.defectBase || 1.0 + (machine.temp - p.tempBase) * 0.04 + machine.vib * 1.5;
  machine.defect = clamp(
    springStep(machine.defect || defBase, defBase, 0.05, 0.15),
    0, 20
  );

  // RPM: only for rotating machines
  if (machine.rpm > 0) {
    machine.rpm = clamp(
      springStep(machine.rpm, machine.rpm, 0.01, machine.rpm * 0.005),
      0, 15000
    );
  }

  // Energy (kWh, correlated with load)
  machine.energy = clamp(
    p.energyBase * (machine.load / p.loadBase) + (rng() - 0.5) * 2,
    0, 200
  );

  // OEE = Availability × Performance × Quality
  const avail = machine.status === 'IDLE' ? 0
              : machine.status === 'CRITICAL' ? 0.55 + rng() * 0.08
              : 0.92 + rng() * 0.06;
  const perf  = clamp(machine.load / 100, 0, 1);
  const qual  = clamp(1 - machine.defect / 100, 0, 1);
  machine.oee = clamp(avail * perf * qual * 100, 0, 100);

  return machine;
}

// ── Determine machine status from its values ──────────────────────────────────
export function evalStatus(machine) {
  const p = MACHINE_PROFILES[machine.id];
  if (!p) return machine.status;
  if (machine.status === 'IDLE') return 'IDLE';
  if (machine.temp >= p.tempCrit || machine.vib >= p.vibCrit) return 'CRITICAL';
  if (machine.temp >= p.tempWarn || machine.vib >= p.vibWarn) return 'WARN';
  return 'RUNNING';
}

// ── SPC: add one point to the rolling window ──────────────────────────────────
export function addSPCPoint(spcWindows, machineId, machine) {
  const window = spcWindows[machineId];
  if (!window) return;
  // New measurement around a central characteristic with machine-induced variation
  const sigma = 0.1 + machine.defect * 0.01;
  const newPt = 12.5 + (rng() - 0.5) * sigma * 3;
  window.push(parseFloat(newPt.toFixed(4)));
  if (window.length > 40) window.shift();
}

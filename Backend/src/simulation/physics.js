// ─────────────────────────────────────────────────────────────────────────────
// Shared physics helpers plus a generic fallback model.
// Specific process models: bottling.js (active), furnace.js (FUTURE).
// ─────────────────────────────────────────────────────────────────────────────

import { MACHINE_PROFILES } from '../store/state.js';

export function createRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const rng = createRng(12345);

export function springStep(current, target, spring, noise) {
  const force = (target - current) * spring;
  return current + force + (rng() - 0.5) * noise;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getProfileValue(profile, names, fallback = 0) {
  for (const name of names) {
    if (profile.variables?.[name]) return profile.variables[name].value ?? profile.variables[name].base_value;
  }
  return fallback;
}

export function updateMachine(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile) return machine;

  const tempVar = profile.summaryVars?.temp || profile.primaryVar;
  const vibVar = profile.summaryVars?.vib;
  const loadVar = profile.summaryVars?.load || profile.primaryVar;
  const energyVar = profile.summaryVars?.energy;

  const tempTarget = machine.setpointOverride != null ? machine.setpointOverride : getProfileValue(profile, [tempVar], profile.tempBase);
  const tempEntry = machine.vars?.[tempVar];
  if (tempEntry) {
    tempEntry.value = clamp(springStep(tempEntry.value, tempTarget, profile.tempSpring, profile.tempNoise), profile.tempMin, profile.tempMax);
    machine.temp = tempEntry.value;
    machine[tempVar] = tempEntry.value;
  }

  const vibEntry = vibVar ? machine.vars?.[vibVar] : null;
  if (vibEntry) {
    vibEntry.value = clamp(springStep(vibEntry.value, profile.vibBase, 0.04, profile.vibNoise), 0, 3);
    machine.vib = vibEntry.value;
    machine[vibVar] = vibEntry.value;
  } else {
    machine.vib = machine.vib ?? 0;
  }

  const loadEntry = loadVar ? machine.vars?.[loadVar] : null;
  if (loadEntry) {
    loadEntry.value = clamp(springStep(loadEntry.value, profile.loadBase, 0.03, profile.loadNoise), 0, 1000);
    machine.load = loadEntry.value;
    machine[loadVar] = loadEntry.value;
  }

  const energyEntry = energyVar ? machine.vars?.[energyVar] : null;
  if (energyEntry) {
    energyEntry.value = clamp(profile.energyBase * (1 + (machine.load || 0) / Math.max(profile.loadBase, 1) * 0.2) + (rng() - 0.5) * 2, 0, 500);
    machine.energy = energyEntry.value;
    machine[energyVar] = energyEntry.value;
  }

  const defBase = profile.defectBase || 0.8 + Math.abs((machine.temp ?? profile.tempBase) - profile.tempBase) * 0.04 + (machine.vib || 0) * 1.4;
  machine.defect = clamp(springStep(machine.defect || defBase, defBase, 0.05, 0.15), 0, 20);

  const avail = machine.status === 'IDLE' ? 0 : machine.status === 'CRITICAL' ? 0.55 + rng() * 0.08 : 0.92 + rng() * 0.06;
  const perf = clamp((machine.load || profile.loadBase) / Math.max(profile.loadBase, 1), 0, 1);
  const qual = clamp(1 - machine.defect / 100, 0, 1);
  machine.oee = clamp(avail * perf * qual * 100, 0, 100);

  return machine;
}

export function evalStatus(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile) return machine.status;
  if (machine.status === 'IDLE') return 'IDLE';
  if (machine.anomalyScore != null && machine.anomalyScore > 0.7) return 'CRITICAL';
  if (machine.temp >= profile.tempCrit || machine.vib >= profile.vibCrit) return 'CRITICAL';
  if (machine.temp >= profile.tempWarn || machine.vib >= profile.vibWarn) return 'WARN';
  return 'RUNNING';
}

export function addSPCPoint(spcWindows, machineId, machine, profile = MACHINE_PROFILES[machineId]) {
  const window = spcWindows[machineId];
  if (!window) return;

  const baseVar = profile?.summaryVars?.quality || profile?.primaryVar;
  const qualityEntry = baseVar ? machine.vars?.[baseVar] : null;
  const base = qualityEntry?.value ?? qualityEntry?.base_value ?? machine.primaryValue ?? machine.temp ?? 0;
  const sigma = Math.max((qualityEntry?.noise ?? machine.defect * 0.03) || 0.02, 0.01);
  const newPoint = base + (rng() - 0.5) * sigma * 3;
  window.push(parseFloat(newPoint.toFixed(4)));
  if (window.length > 40) window.shift();
}

import { clamp, springStep } from './physics.js';

function computeDefect(machine, profile) {
  const qualityEntries = Object.entries(machine.vars).filter(([, e]) => e.type === 'quality');

  if (!qualityEntries.length) {
    const tempVar  = profile.summaryVars?.temp || profile.primaryVar;
    const tempEntry = machine.vars[tempVar];
    const pvar     = profile.variables[tempVar];
    if (!tempEntry || !pvar) return profile.defectBase;
    const dev        = Math.abs(tempEntry.value - pvar.base_value) / Math.max(pvar.base_value, 1);
    const vibPenalty = Math.max(0, (machine.vib || 0) - (profile.vibBase || 0)) * 2;
    return clamp(parseFloat((profile.defectBase + dev * 3 + vibPenalty).toFixed(2)), 0, 20);
  }

  let penalty = 0;
  for (const [name, entry] of qualityEntries) {
    const pvar   = profile.variables[name];
    const target = pvar?.quality_target ?? pvar?.base_value ?? entry.value;
    const noise  = Math.max(pvar?.noise ?? 0.001, 0.001);
    penalty += Math.abs(entry.value - target) / noise;
  }

  return clamp(
    parseFloat((profile.defectBase + (penalty / qualityEntries.length) * 0.08).toFixed(2)),
    0, 20,
  );
}

function computeOEE(machine, profile) {
  const vibVar    = profile.summaryVars?.vib;
  const vib       = (vibVar ? machine.vars[vibVar]?.value : null) ?? machine.vib ?? (profile.vibBase || 0);
  const vibPenalty = Math.max(0, vib - (profile.vibBase || 0)) * 4;
  return clamp(
    parseFloat((profile.initialOee - machine.defect * 1.5 - vibPenalty).toFixed(1)),
    0, 100,
  );
}

export function updateGenericMachine(machine, profile) {
  const correlations = profile.correlations || {};
  const tempVar      = profile.summaryVars?.temp || profile.primaryVar;

  // Snapshot deltas-from-base BEFORE this tick so coupling uses previous state
  const prevDeltas = {};
  for (const [varName, entry] of Object.entries(machine.vars)) {
    const pvar = profile.variables[varName];
    if (pvar) prevDeltas[varName] = entry.value - pvar.base_value;
  }

  for (const [varName, entry] of Object.entries(machine.vars)) {
    const pvar = profile.variables[varName];
    if (!pvar) continue;

    // Setpoint override only applies to the primary temp variable
    const target = (varName === tempVar && machine.setpointOverride != null)
      ? machine.setpointOverride
      : pvar.base_value;

    // Spring-damper step toward target with noise
    let value = springStep(entry.value, target, pvar.spring, pvar.noise);

    // Cross-variable coupling from correlation matrix (operative vars only)
    if (pvar.type !== 'quality') {
      const corrRow = correlations[varName];
      if (corrRow) {
        for (const [otherName, r] of Object.entries(corrRow)) {
          if (Math.abs(r) < 0.25) continue;
          const delta = prevDeltas[otherName];
          if (delta == null) continue;
          value += r * delta * 0.12;
        }
      }
    }

    entry.value   = clamp(value + (entry.drift || 0), pvar.min, pvar.max);
    machine[varName] = entry.value;
  }

  const vibVar    = profile.summaryVars?.vib;
  const loadVar   = profile.summaryVars?.load || profile.primaryVar;
  const energyVar = profile.summaryVars?.energy;

  machine.temp         = machine.vars[tempVar]?.value   ?? machine.temp   ?? 0;
  machine.vib          = machine.vars[vibVar]?.value    ?? machine.vib    ?? 0;
  machine.load         = machine.vars[loadVar]?.value   ?? machine.load   ?? 0;
  machine.energy       = machine.vars[energyVar]?.value ?? machine.energy ?? 0;
  machine.primaryValue = machine.vars[profile.primaryVar]?.value ?? machine.temp;

  machine.defect = computeDefect(machine, profile);
  machine.oee    = computeOEE(machine, profile);

  machine.quality = {};
  for (const [name, entry] of Object.entries(machine.vars)) {
    if (entry.type === 'quality') machine.quality[name] = entry.value;
  }

  return machine;
}

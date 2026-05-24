import { clamp, springStep } from './physics.js';

function readVar(vars, profile, name, fallback = 0) {
  if (vars && vars[name] !== undefined) return vars[name];
  return profile.variables?.[name]?.base_value ?? fallback;
}

export function predictBottlingDefect(vars, profile) {
  const tempVar = profile.summaryVars?.temp || 'temperature';
  const pressureVar = profile.variables.pressure ? 'pressure' : tempVar;
  const speedVar = profile.variables.speed ? 'speed' : null;
  const vibVar = profile.summaryVars?.vib || 'vibration';

  const temp = readVar(vars, profile, tempVar, profile.tempBase);
  const pressure = readVar(vars, profile, pressureVar, profile.variables.pressure?.base_value ?? profile.tempBase * 0.02);
  const speed = speedVar ? readVar(vars, profile, speedVar, profile.variables.speed.base_value) : profile.variables.fill_time?.base_value || 120;
  const vib = readVar(vars, profile, vibVar, profile.vibBase);

  const tempDeviation = Math.abs(temp - profile.tempBase) / Math.max(profile.tempBase, 1);
  const pressureDeviation = Math.abs(pressure - (profile.variables.pressure?.base_value ?? pressure)) / Math.max(profile.variables.pressure?.base_value ?? 1, 1);
  const speedDeviation = speedVar ? Math.abs(speed - profile.variables.speed.base_value) / Math.max(profile.variables.speed.base_value, 1) : 0;
  const vibDeviation = Math.abs(vib - (profile.vibBase || 0));

  const qualityVars = ['fill_volume', 'bottle_weight', 'fill_level', 'cap_torque', 'label_position'];
  let qualityPenalty = 0;

  for (const name of qualityVars) {
    if (!profile.variables[name]) continue;
    const current = readVar(vars, profile, name, profile.variables[name].base_value);
    qualityPenalty += Math.abs(current - profile.variables[name].base_value) / Math.max(profile.variables[name].noise, 0.01);
  }

  return parseFloat((profile.defectBase + tempDeviation * 3.4 + pressureDeviation * 1.8 + speedDeviation * 2.1 + vibDeviation * 1.5 + qualityPenalty * 0.05).toFixed(2));
}

export function predictBottlingOee(vars, profile) {
  const speed = profile.variables.speed ? readVar(vars, profile, 'speed', profile.variables.speed.base_value) : profile.variables.fill_time?.base_value || 120;
  const precision = profile.variables.precision ? readVar(vars, profile, 'precision', profile.variables.precision.base_value) : 97;
  const vib = readVar(vars, profile, profile.summaryVars?.vib || 'vibration', profile.vibBase);
  const defect = predictBottlingDefect(vars, profile);
  const speedBonus = profile.variables.speed ? Math.max(0, (speed - profile.variables.speed.base_value) / Math.max(profile.variables.speed.base_value, 1)) * 3 : 0;
  const precisionBonus = Math.max(0, (precision - 90) / 10);
  const vibPenalty = Math.max(0, vib - (profile.vibBase || 0)) * 4;
  return clamp(parseFloat((profile.initialOee - defect * 1.5 + speedBonus + precisionBonus - vibPenalty).toFixed(1)), 0, 100);
}

export function predictBottlingMetrics(vars, profile) {
  return {
    defect: predictBottlingDefect(vars, profile),
    oee: predictBottlingOee(vars, profile),
  };
}

function getValue(machine, profile, names, fallback = 0) {
  for (const name of names) {
    if (machine.vars[name]) return machine.vars[name].value;
    if (profile.variables[name]) return profile.variables[name].value;
  }
  return fallback;
}

function bump(machine, name, delta) {
  if (machine.vars[name]) {
    machine.vars[name].value = machine.vars[name].value + delta;
    machine[name] = machine.vars[name].value;
  }
}

export function updateBottlingMachine(machine, profile) {
  const tempVar = profile.summaryVars?.temp || 'temperature';
  const pressureVar = machine.vars.pressure ? 'pressure' : tempVar;
  const vibVar = profile.summaryVars?.vib || 'vibration';
  const loadVar = profile.summaryVars?.load || profile.primaryVar;

  const tempTarget = machine.setpointOverride != null ? machine.setpointOverride : getValue(machine, profile, [tempVar], profile.tempBase);
  const tempNoise = profile.variables[tempVar]?.noise ?? profile.tempNoise;
  machine.vars[tempVar] = machine.vars[tempVar] || { value: tempTarget };
  machine.vars[tempVar].value = clamp(
    springStep(machine.vars[tempVar].value, tempTarget, profile.tempSpring, tempNoise) + (machine.vars[tempVar].drift || 0),
    profile.tempMin,
    profile.tempMax,
  );
  machine[tempVar] = machine.vars[tempVar].value;

  if (machine.vars.level) {
    const levelTarget = machine.setpointOverride != null ? machine.setpointOverride : profile.variables.level.base_value;
    machine.vars.level.value = clamp(springStep(machine.vars.level.value, levelTarget, profile.variables.level.spring, profile.variables.level.noise), 0, 100);
    machine.level = machine.vars.level.value;
  }

  if (machine.vars.pressure) {
    const pressureTarget = profile.variables.pressure?.base_value ?? profile.tempBase * 0.02;
    machine.vars.pressure.value = clamp(springStep(machine.vars.pressure.value, pressureTarget, profile.variables.pressure.spring, profile.variables.pressure.noise), profile.variables.pressure.min, profile.variables.pressure.max);
    machine.pressure = machine.vars.pressure.value;
  }

  if (machine.vars.flow_rate) {
    const pressure = machine.vars.pressure?.value ?? profile.variables.pressure?.base_value ?? 0;
    const flowTarget = profile.variables.flow_rate.base_value + (pressure - profile.variables.pressure.base_value) * 2.2;
    machine.vars.flow_rate.value = clamp(springStep(machine.vars.flow_rate.value, flowTarget, profile.variables.flow_rate.spring, profile.variables.flow_rate.noise), profile.variables.flow_rate.min, profile.variables.flow_rate.max);
    machine.flow_rate = machine.vars.flow_rate.value;
  }

  if (machine.vars.vibration) {
    const speedImpact = machine.vars.speed ? (machine.vars.speed.value - profile.variables.speed.base_value) / Math.max(profile.variables.speed.base_value, 1) : 0;
    const pressureImpact = machine.vars.pressure ? (machine.vars.pressure.value - profile.variables.pressure.base_value) / Math.max(profile.variables.pressure.base_value, 1) : 0;
    const vibTarget = profile.variables.vibration.base_value + speedImpact * 0.08 + pressureImpact * 0.04;
    machine.vars.vibration.value = clamp(springStep(machine.vars.vibration.value, vibTarget, profile.variables.vibration.spring, profile.variables.vibration.noise), profile.variables.vibration.min, profile.variables.vibration.max);
    machine.vib = machine.vars.vibration.value;
  } else if (machine.vars.vib !== undefined) {
    machine.vib = machine.vars.vib.value;
  } else {
    machine.vib = 0;
  }

  if (machine.vars.energy) {
    const baseEnergy = profile.variables.energy?.base_value ?? 0;
    const flow = machine.vars.flow_rate?.value ?? profile.variables.flow_rate?.base_value ?? 0;
    const vib = machine.vib || 0;
    const energyTarget = baseEnergy + flow * 0.03 + vib * 18;
    machine.vars.energy.value = clamp(springStep(machine.vars.energy.value, energyTarget, profile.variables.energy.spring, profile.variables.energy.noise), profile.variables.energy.min, profile.variables.energy.max);
    machine.energy = machine.vars.energy.value;
  }

  if (machine.vars.fill_time) {
    const speed = machine.vars.speed?.value ?? profile.variables.speed?.base_value ?? 120;
    const fillTarget = profile.variables.fill_time.base_value + (120 - speed) * 0.018;
    machine.vars.fill_time.value = clamp(springStep(machine.vars.fill_time.value, fillTarget, profile.variables.fill_time.spring, profile.variables.fill_time.noise), profile.variables.fill_time.min, profile.variables.fill_time.max);
    machine.fill_time = machine.vars.fill_time.value;
  }

  if (machine.vars.precision) {
    const tempPenalty = Math.max(0, Math.abs((machine.vars[tempVar]?.value ?? profile.tempBase) - profile.tempBase) / Math.max(profile.tempBase, 1));
    const vibPenalty = Math.max(0, machine.vib - (profile.vibBase || 0));
    const precisionTarget = profile.variables.precision.base_value - tempPenalty * 6 - vibPenalty * 18;
    machine.vars.precision.value = clamp(springStep(machine.vars.precision.value, precisionTarget, profile.variables.precision.spring, profile.variables.precision.noise), profile.variables.precision.min, profile.variables.precision.max);
    machine.precision = machine.vars.precision.value;
  }

  if (machine.vars.speed) {
    const speedTarget = profile.variables.speed.base_value + (machine.setpointOverride != null ? 0 : 0);
    machine.vars.speed.value = clamp(springStep(machine.vars.speed.value, speedTarget, profile.variables.speed.spring, profile.variables.speed.noise), profile.variables.speed.min, profile.variables.speed.max);
    machine.speed = machine.vars.speed.value;
  }

  if (machine.vars.nozzle_state) {
    const nozzleTarget = clamp(profile.variables.nozzle_state.base_value - machine.vib * 0.03, profile.variables.nozzle_state.min, profile.variables.nozzle_state.max);
    machine.vars.nozzle_state.value = clamp(springStep(machine.vars.nozzle_state.value, nozzleTarget, profile.variables.nozzle_state.spring, profile.variables.nozzle_state.noise), profile.variables.nozzle_state.min, profile.variables.nozzle_state.max);
    machine.nozzle_state = machine.vars.nozzle_state.value;
  }

  if (machine.vars.torque) {
    const torqueTarget = profile.variables.torque.base_value + (machine.vars.speed?.value ?? 0) * 0.006 + machine.vib * 0.5;
    machine.vars.torque.value = clamp(springStep(machine.vars.torque.value, torqueTarget, profile.variables.torque.spring, profile.variables.torque.noise), profile.variables.torque.min, profile.variables.torque.max);
    machine.torque = machine.vars.torque.value;
  }

  if (machine.vars.position) {
    const positionTarget = profile.variables.position.base_value + machine.vib * 1.6;
    machine.vars.position.value = clamp(springStep(machine.vars.position.value, positionTarget, profile.variables.position.spring, profile.variables.position.noise), profile.variables.position.min, profile.variables.position.max);
    machine.position = machine.vars.position.value;
  }

  if (machine.vars.cap_torque) {
    const capTarget = profile.variables.cap_torque.base_value + (machine.vars.torque?.value ?? 0) * 0.02;
    machine.vars.cap_torque.value = clamp(springStep(machine.vars.cap_torque.value, capTarget, profile.variables.cap_torque.spring, profile.variables.cap_torque.noise), profile.variables.cap_torque.min, profile.variables.cap_torque.max);
    machine.cap_torque = machine.vars.cap_torque.value;
  }

  if (machine.vars.label_position) {
    const labelTarget = profile.variables.label_position.base_value + machine.vib * 0.6;
    machine.vars.label_position.value = clamp(springStep(machine.vars.label_position.value, labelTarget, profile.variables.label_position.spring, profile.variables.label_position.noise), profile.variables.label_position.min, profile.variables.label_position.max);
    machine.label_position = machine.vars.label_position.value;
  }

  const liveSnapshot = Object.fromEntries(Object.entries(machine.vars).map(([name, entry]) => [name, entry.value]));

  if (machine.vars.fill_volume) {
    const qualityPenalty = Math.abs((machine.vars[tempVar]?.value ?? profile.tempBase) - profile.tempBase) / Math.max(profile.tempBase, 1);
    const pressurePenalty = Math.abs((machine.vars.pressure?.value ?? profile.variables.pressure?.base_value ?? 0) - (profile.variables.pressure?.base_value ?? 0)) / Math.max(profile.variables.pressure?.base_value ?? 1, 1);
    const target = profile.variables.fill_volume.base_value - (qualityPenalty * 8) + (pressurePenalty * -3);
    machine.vars.fill_volume.value = clamp(springStep(machine.vars.fill_volume.value, target, profile.variables.fill_volume.spring, profile.variables.fill_volume.noise), profile.variables.fill_volume.min, profile.variables.fill_volume.max);
    machine.fill_volume = machine.vars.fill_volume.value;
  }

  if (machine.vars.fill_level) {
    const qualityPenalty = Math.abs((machine.vars[tempVar]?.value ?? profile.tempBase) - profile.tempBase) / Math.max(profile.tempBase, 1);
    const vibPenalty = machine.vib * 0.45;
    const target = profile.variables.fill_level.base_value - qualityPenalty * 2.5 - vibPenalty * 2;
    machine.vars.fill_level.value = clamp(springStep(machine.vars.fill_level.value, target, profile.variables.fill_level.spring, profile.variables.fill_level.noise), profile.variables.fill_level.min, profile.variables.fill_level.max);
    machine.fill_level = machine.vars.fill_level.value;
  }

  if (machine.vars.bottle_weight) {
    const target = profile.variables.bottle_weight.base_value + (machine.vars.fill_volume ? (machine.vars.fill_volume.value - profile.variables.fill_volume.base_value) * 0.35 : 0);
    machine.vars.bottle_weight.value = clamp(springStep(machine.vars.bottle_weight.value, target, profile.variables.bottle_weight.spring, profile.variables.bottle_weight.noise), profile.variables.bottle_weight.min, profile.variables.bottle_weight.max);
    machine.bottle_weight = machine.vars.bottle_weight.value;
  }

  if (machine.vars.speed) {
    machine.speed = machine.vars.speed.value;
  }
  machine.defect = predictBottlingDefect(liveSnapshot, profile);
  machine.oee = predictBottlingOee(liveSnapshot, profile);
  machine.primaryValue = machine.vars[profile.primaryVar]?.value ?? machine.primaryValue;
  machine.temp = machine.vars[tempVar]?.value ?? machine.temp;
  machine.vib = machine.vars[vibVar]?.value ?? machine.vib;
  machine.energy = machine.vars.energy?.value ?? machine.energy;
  if (machine.vars[loadVar]) machine.load = machine.vars[loadVar].value;

  return machine;
}

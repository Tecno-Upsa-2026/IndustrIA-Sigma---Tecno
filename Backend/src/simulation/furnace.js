import { clamp, springStep } from './physics.js';

function readVar(vars, profile, name, fallback = 0) {
  if (vars && vars[name] !== undefined) return vars[name];
  return profile.variables?.[name]?.base_value ?? fallback;
}

export function predictFurnaceDefect(vars, profile) {
  const tempVar = profile.summaryVars?.temp || 'temperature';
  const tempBase = profile.tempBase ?? profile.variables[tempVar]?.base_value ?? 0;
  const temp = readVar(vars, profile, tempVar, tempBase);
  const residence = readVar(vars, profile, 'residence_time', profile.variables.residence_time?.base_value ?? 0);
  const airFlow = readVar(vars, profile, 'air_flow', profile.variables.air_flow?.base_value ?? 0);
  const vibration = readVar(vars, profile, 'fan_vibration', profile.variables.fan_vibration?.base_value ?? 0);
  const stability = readVar(vars, profile, 'stability', profile.variables.stability?.base_value ?? 0);

  const tempDeviation = Math.abs(temp - tempBase) / Math.max(tempBase, 1);
  const residenceDeviation = Math.abs(residence - (profile.variables.residence_time?.base_value ?? residence)) / Math.max(profile.variables.residence_time?.base_value ?? 1, 1);
  const airflowDeviation = Math.abs(airFlow - (profile.variables.air_flow?.base_value ?? airFlow)) / Math.max(profile.variables.air_flow?.base_value ?? 1, 1);
  const vibrationDeviation = Math.abs(vibration - (profile.variables.fan_vibration?.base_value ?? vibration));
  const stabilityPenalty = Math.max(0, 1 - stability);

  const qualityNames = ['hardness', 'fragility', 'residual_humidity', 'thermal_uniformity', 'color_uniformity'];
  let qualityPenalty = 0;
  for (const name of qualityNames) {
    if (!profile.variables[name]) continue;
    const current = readVar(vars, profile, name, profile.variables[name].base_value);
    qualityPenalty += Math.abs(current - profile.variables[name].base_value) / Math.max(profile.variables[name].noise, 0.01);
  }

  return parseFloat((profile.defectBase + tempDeviation * 3.8 + residenceDeviation * 1.4 + airflowDeviation * 1.9 + vibrationDeviation * 1.2 + stabilityPenalty * 2.2 + qualityPenalty * 0.04).toFixed(2));
}

export function predictFurnaceOee(vars, profile) {
  const stability = readVar(vars, profile, 'stability', profile.variables.stability?.base_value ?? 0);
  const defect = predictFurnaceDefect(vars, profile);
  return clamp(parseFloat((profile.initialOee - defect * 1.4 + stability * 3).toFixed(1)), 0, 100);
}

export function predictFurnaceMetrics(vars, profile) {
  return {
    defect: predictFurnaceDefect(vars, profile),
    oee: predictFurnaceOee(vars, profile),
  };
}

function getValue(machine, profile, names, fallback = 0) {
  for (const name of names) {
    if (machine.vars[name]) return machine.vars[name].value;
    if (profile.variables[name]) return profile.variables[name].value;
  }
  return fallback;
}

export function updateFurnaceMachine(machine, profile) {
  const tempVar = profile.summaryVars?.temp || 'temperature';
  const energyVar = profile.summaryVars?.energy || 'energy';
  const humidityVar = machine.vars.residual_humidity ? 'residual_humidity' : null;
  const qualityVar = profile.summaryVars?.quality || 'hardness';
  const tempBase = profile.tempBase ?? getValue(machine, profile, [tempVar], 0);
  const airBase = profile.variables.air_flow?.base_value ?? 0;

  const tempTarget = machine.setpointOverride != null ? machine.setpointOverride : getValue(machine, profile, [tempVar], profile.tempBase);
  machine.vars[tempVar] = machine.vars[tempVar] || { value: tempTarget };
  machine.vars[tempVar].value = clamp(
    springStep(machine.vars[tempVar].value, tempTarget, profile.tempSpring, profile.tempNoise),
    profile.tempMin,
    profile.tempMax,
  );
  machine[tempVar] = machine.vars[tempVar].value;

  if (machine.vars.residence_time) {
    const residenceTarget = profile.variables.residence_time.base_value + Math.max(0, machine.vars[tempVar].value - tempBase) * 0.06;
    machine.vars.residence_time.value = clamp(springStep(machine.vars.residence_time.value, residenceTarget, profile.variables.residence_time.spring, profile.variables.residence_time.noise), profile.variables.residence_time.min, profile.variables.residence_time.max);
    machine.residence_time = machine.vars.residence_time.value;
  }

  if (machine.vars.energy) {
    const energyTarget = profile.variables.energy.base_value + Math.max(0, machine.vars[tempVar].value - tempBase) * 0.45 + (machine.vars.residence_time?.value ?? 0) * 0.35;
    machine.vars.energy.value = clamp(springStep(machine.vars.energy.value, energyTarget, profile.variables.energy.spring, profile.variables.energy.noise), profile.variables.energy.min, profile.variables.energy.max);
    machine.energy = machine.vars.energy.value;
  }

  if (machine.vars.air_flow) {
    const airflowTarget = profile.variables.air_flow.base_value + (tempBase - machine.vars[tempVar].value) * 0.01;
    machine.vars.air_flow.value = clamp(springStep(machine.vars.air_flow.value, airflowTarget, profile.variables.air_flow.spring, profile.variables.air_flow.noise), profile.variables.air_flow.min, profile.variables.air_flow.max);
    machine.air_flow = machine.vars.air_flow.value;
  }

  if (machine.vars.fan_vibration) {
    const flowPenalty = Math.abs((machine.vars.air_flow?.value ?? airBase) - airBase);
    const vibrationTarget = profile.variables.fan_vibration.base_value + flowPenalty * 0.04;
    machine.vars.fan_vibration.value = clamp(springStep(machine.vars.fan_vibration.value, vibrationTarget, profile.variables.fan_vibration.spring, profile.variables.fan_vibration.noise), profile.variables.fan_vibration.min, profile.variables.fan_vibration.max);
    machine.fan_vibration = machine.vars.fan_vibration.value;
  }

  if (machine.vars.fan_speed) {
    const speedTarget = profile.variables.fan_speed.base_value + (machine.vars.air_flow?.value ?? 0) * 30;
    machine.vars.fan_speed.value = clamp(springStep(machine.vars.fan_speed.value, speedTarget, profile.variables.fan_speed.spring, profile.variables.fan_speed.noise), profile.variables.fan_speed.min, profile.variables.fan_speed.max);
    machine.fan_speed = machine.vars.fan_speed.value;
  }

  if (machine.vars.precision) {
    const drift = machine.vars.drift?.value ?? profile.variables.drift?.base_value ?? 0;
    const precisionTarget = profile.variables.precision.base_value - drift * 0.7;
    machine.vars.precision.value = clamp(springStep(machine.vars.precision.value, precisionTarget, profile.variables.precision.spring, profile.variables.precision.noise), profile.variables.precision.min, profile.variables.precision.max);
    machine.precision = machine.vars.precision.value;
  }

  if (machine.vars.drift) {
    const driftTarget = profile.variables.drift.base_value + (machine.vars[tempVar].value - tempBase) * 0.002;
    machine.vars.drift.value = clamp(springStep(machine.vars.drift.value, driftTarget, profile.variables.drift.spring, profile.variables.drift.noise), profile.variables.drift.min, profile.variables.drift.max);
    machine.drift = machine.vars.drift.value;
  }

  if (machine.vars.measurement_error) {
    const precision = machine.vars.precision?.value ?? profile.variables.precision?.base_value ?? 0;
    const errorTarget = profile.variables.measurement_error.base_value + Math.max(0, 1 - precision / 100) * 6;
    machine.vars.measurement_error.value = clamp(springStep(machine.vars.measurement_error.value, errorTarget, profile.variables.measurement_error.spring, profile.variables.measurement_error.noise), profile.variables.measurement_error.min, profile.variables.measurement_error.max);
    machine.measurement_error = machine.vars.measurement_error.value;
  }

  if (machine.vars.setpoint_temp) {
    machine.vars.setpoint_temp.value = clamp(springStep(machine.vars.setpoint_temp.value, profile.variables.setpoint_temp.base_value, profile.variables.setpoint_temp.spring, profile.variables.setpoint_temp.noise), profile.variables.setpoint_temp.min, profile.variables.setpoint_temp.max);
    machine.setpoint_temp = machine.vars.setpoint_temp.value;
  }

  if (machine.vars.response_time) {
    const energyBase = profile.variables.energy?.base_value ?? profile.energyBase ?? 0;
    const stabilityPenalty = Math.abs((machine.vars[energyVar]?.value ?? energyBase) - energyBase) * 0.01;
    const responseTarget = profile.variables.response_time.base_value + stabilityPenalty;
    machine.vars.response_time.value = clamp(springStep(machine.vars.response_time.value, responseTarget, profile.variables.response_time.spring, profile.variables.response_time.noise), profile.variables.response_time.min, profile.variables.response_time.max);
    machine.response_time = machine.vars.response_time.value;
  }

  if (machine.vars.stability) {
    const stabilityTarget = profile.variables.stability.base_value - Math.abs((machine.vars[tempVar].value - tempBase) / Math.max(tempBase, 1)) * 0.08;
    machine.vars.stability.value = clamp(springStep(machine.vars.stability.value, stabilityTarget, profile.variables.stability.spring, profile.variables.stability.noise), profile.variables.stability.min, profile.variables.stability.max);
    machine.stability = machine.vars.stability.value;
  }

  const tempDeviation = Math.abs(machine.vars[tempVar].value - tempBase);
  const airDeviation = Math.abs((machine.vars.air_flow?.value ?? airBase) - airBase);
  const vibration = machine.vars.fan_vibration?.value ?? profile.vibBase ?? 0;
  const stability = machine.vars.stability?.value ?? profile.variables.stability?.base_value ?? 0;

  if (machine.vars.hardness) {
    const hardnessTarget = profile.variables.hardness.base_value - tempDeviation * 0.14 + stability * 1.5;
    machine.vars.hardness.value = clamp(springStep(machine.vars.hardness.value, hardnessTarget, profile.variables.hardness.spring, profile.variables.hardness.noise), profile.variables.hardness.min, profile.variables.hardness.max);
    machine.hardness = machine.vars.hardness.value;
  }

  if (machine.vars.fragility) {
    const fragilityTarget = profile.variables.fragility.base_value + tempDeviation * 0.03 + vibration * 0.5;
    machine.vars.fragility.value = clamp(springStep(machine.vars.fragility.value, fragilityTarget, profile.variables.fragility.spring, profile.variables.fragility.noise), profile.variables.fragility.min, profile.variables.fragility.max);
    machine.fragility = machine.vars.fragility.value;
  }

  if (machine.vars.residual_humidity) {
    const humidityTarget = profile.variables.residual_humidity.base_value - airDeviation * 0.08;
    machine.vars.residual_humidity.value = clamp(springStep(machine.vars.residual_humidity.value, humidityTarget, profile.variables.residual_humidity.spring, profile.variables.residual_humidity.noise), profile.variables.residual_humidity.min, profile.variables.residual_humidity.max);
    machine.residual_humidity = machine.vars.residual_humidity.value;
  }

  if (machine.vars.thermal_uniformity) {
    const uniformityTarget = profile.variables.thermal_uniformity.base_value - tempDeviation * 0.12 - airDeviation * 0.4;
    machine.vars.thermal_uniformity.value = clamp(springStep(machine.vars.thermal_uniformity.value, uniformityTarget, profile.variables.thermal_uniformity.spring, profile.variables.thermal_uniformity.noise), profile.variables.thermal_uniformity.min, profile.variables.thermal_uniformity.max);
    machine.thermal_uniformity = machine.vars.thermal_uniformity.value;
  }

  if (machine.vars.color_uniformity) {
    const colorTarget = profile.variables.color_uniformity.base_value - airDeviation * 0.15 - vibration * 3;
    machine.vars.color_uniformity.value = clamp(springStep(machine.vars.color_uniformity.value, colorTarget, profile.variables.color_uniformity.spring, profile.variables.color_uniformity.noise), profile.variables.color_uniformity.min, profile.variables.color_uniformity.max);
    machine.color_uniformity = machine.vars.color_uniformity.value;
  }

  machine.defect = predictFurnaceDefect(
    Object.fromEntries(Object.entries(machine.vars).map(([name, entry]) => [name, entry.value])),
    profile,
  );
  machine.oee = predictFurnaceOee(
    Object.fromEntries(Object.entries(machine.vars).map(([name, entry]) => [name, entry.value])),
    profile,
  );
  machine.temp = machine.vars[tempVar].value;
  machine.energy = machine.vars[energyVar]?.value ?? machine.energy;
  machine.primaryValue = machine.vars[profile.primaryVar]?.value ?? machine.temp;
  machine.qualityVar = qualityVar;
  machine.quality = {};

  for (const [name, entry] of Object.entries(machine.vars)) {
    if (entry.type === 'quality') machine.quality[name] = entry.value;
  }

  return machine;
}

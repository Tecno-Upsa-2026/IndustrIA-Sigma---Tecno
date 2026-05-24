// ─────────────────────────────────────────────────────────────────────────────
// Central in-memory state for the platform.
// The backend now boots from the CSV configuration when available.
// ─────────────────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import { loadCSV } from '../simulation/csv-loader.js';

let _alertSeq = 2099;
export const nextAlertId = () => `A-${++_alertSeq}`;

const CONFIG_PATH = fileURLToPath(new URL('../../../Ejemplos CSV/maquinaria_completa.csv', import.meta.url));

const PRIMARY_VAR_ORDER = {
  BOTTLING: ['temperature', 'level', 'pressure', 'flow_rate', 'fill_time', 'speed', 'torque', 'position'],
  FURNACE: ['temperature', 'setpoint_temp', 'residence_time', 'air_flow', 'fan_speed', 'precision', 'drift'],
};

const SUMMARY_VAR_ORDER = {
  temp: ['temperature', 'setpoint_temp', 'level', 'pressure', 'fill_time', 'speed', 'torque', 'position'],
  vib: ['vibration', 'fan_vibration'],
  load: ['flow_rate', 'speed', 'level', 'pressure', 'residence_time', 'torque'],
  energy: ['energy'],
  quality: ['fill_volume', 'bottle_weight', 'fill_level', 'cap_torque', 'label_position', 'hardness', 'fragility', 'residual_humidity', 'thermal_uniformity', 'color_uniformity'],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function num(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasValue(value) {
  return value !== '' && value !== null && value !== undefined;
}

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seedFromText(text) {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = Math.imul(31, seed) + text.charCodeAt(i) | 0;
  }
  return seed >>> 0;
}

function getFirstExisting(profile, names) {
  for (const name of names) {
    if (profile.variables[name]) return name;
  }
  return null;
}

function parseConfigRow(row) {
  return {
    ...row,
    base_value: num(row.base_value),
    noise: num(row.noise),
    spring: num(row.spring),
    min: num(row.min),
    max: num(row.max),
    warn: num(row.warn),
    crit: num(row.crit),
    quality_target: hasValue(row.quality_target) ? num(row.quality_target) : null,
    quality_usl: hasValue(row.quality_usl) ? num(row.quality_usl) : null,
    quality_lsl: hasValue(row.quality_lsl) ? num(row.quality_lsl) : null,
    quality_cp: hasValue(row.quality_cp) ? num(row.quality_cp) : null,
  };
}

function buildVariableEntry(row) {
  return {
    name: row.var_name,
    type: row.var_type,
    unit: row.unit,
    base_value: row.base_value,
    noise: row.noise,
    spring: row.spring,
    min: row.min,
    max: row.max,
    warn: row.warn,
    crit: row.crit,
    quality_target: row.quality_target,
    quality_usl: row.quality_usl,
    quality_lsl: row.quality_lsl,
    quality_cp: row.quality_cp,
    drift: 0,
    value: row.base_value,
    calibrated: false,
  };
}

function computeInitialDefect(profile) {
  const qualityEntries = Object.values(profile.variables).filter(entry => entry.type === 'quality');
  if (!qualityEntries.length) return 0.85;

  const normalized = qualityEntries.reduce((sum, entry) => {
    const target = entry.quality_target ?? entry.base_value;
    const upper = entry.quality_usl ?? target + Math.max(1, Math.abs(target) * 0.05);
    const lower = entry.quality_lsl ?? target - Math.max(1, Math.abs(target) * 0.05);
    const span = Math.max(Math.abs(upper - lower), 1);
    return sum + Math.abs(entry.base_value - target) / span;
  }, 0) / qualityEntries.length;

  return clamp(parseFloat((0.45 + normalized * 6).toFixed(2)), 0, 20);
}

function computeInitialOEE(profile, defect) {
  const operationalBonus = profile.process === 'FURNACE' ? 0.8 : 1.2;
  return clamp(parseFloat((96 - defect * 4 - operationalBonus).toFixed(1)), 0, 100);
}

function syncProfileAliases(profile) {
  profile.primaryVar = profile.primaryVar || getFirstExisting(profile, PRIMARY_VAR_ORDER[profile.process] || []) || Object.keys(profile.variables)[0] || null;
  profile.summaryVars = profile.summaryVars || {};
  profile.summaryVars.temp = profile.summaryVars.temp || getFirstExisting(profile, SUMMARY_VAR_ORDER.temp) || profile.primaryVar;
  profile.summaryVars.vib = profile.summaryVars.vib || getFirstExisting(profile, SUMMARY_VAR_ORDER.vib);
  profile.summaryVars.load = profile.summaryVars.load || getFirstExisting(profile, SUMMARY_VAR_ORDER.load) || profile.primaryVar;
  profile.summaryVars.energy = profile.summaryVars.energy || getFirstExisting(profile, SUMMARY_VAR_ORDER.energy);
  profile.summaryVars.quality = profile.summaryVars.quality || getFirstExisting(profile, SUMMARY_VAR_ORDER.quality);

  const tempVar = profile.variables[profile.summaryVars.temp] || profile.variables[profile.primaryVar] || null;
  const vibVar = profile.summaryVars.vib ? profile.variables[profile.summaryVars.vib] : null;
  const loadVar = profile.variables[profile.summaryVars.load] || tempVar;
  const energyVar = profile.summaryVars.energy ? profile.variables[profile.summaryVars.energy] : null;

  profile.tempBase = tempVar?.base_value ?? 0;
  profile.tempNoise = tempVar?.noise ?? 0;
  profile.tempSpring = tempVar?.spring ?? 0.04;
  profile.tempMin = tempVar?.min ?? 0;
  profile.tempMax = tempVar?.max ?? 100;
  profile.tempWarn = tempVar?.warn ?? profile.tempBase * 1.05;
  profile.tempCrit = tempVar?.crit ?? profile.tempBase * 1.1;

  profile.vibBase = vibVar?.base_value ?? 0;
  profile.vibNoise = vibVar?.noise ?? 0.01;
  profile.vibWarn = vibVar?.warn ?? 0.7;
  profile.vibCrit = vibVar?.crit ?? 0.9;

  profile.loadBase = loadVar?.base_value ?? profile.tempBase;
  profile.loadNoise = loadVar?.noise ?? 1;
  profile.energyBase = energyVar?.base_value ?? 0;
  profile.defectBase = computeInitialDefect(profile);
  profile.defectNoise = 0.18;
  profile.initialOee = computeInitialOEE(profile, profile.defectBase);
}

function syncMachineValuesFromProfile(machine, profile) {
  for (const [name, entry] of Object.entries(machine.vars)) {
    machine[name] = entry.value;
  }

  const tempVar = profile.summaryVars?.temp || profile.primaryVar;
  const vibVar = profile.summaryVars?.vib;
  const loadVar = profile.summaryVars?.load || profile.primaryVar;
  const energyVar = profile.summaryVars?.energy;
  const primaryQualityVar = profile.summaryVars?.quality;

  machine.temp = machine.vars[tempVar]?.value ?? machine.temp ?? 0;
  machine.vib = machine.vars[vibVar]?.value ?? machine.vib ?? 0;
  machine.load = machine.vars[loadVar]?.value ?? machine.load ?? 0;
  machine.energy = machine.vars[energyVar]?.value ?? machine.energy ?? 0;
  machine.primaryVar = profile.primaryVar;
  machine.primaryValue = machine.vars[profile.primaryVar]?.value ?? machine.temp;
  machine.qualityVar = primaryQualityVar || null;
  machine.defect = profile.defectBase;
  machine.oee = profile.initialOee;
  machine.anomalyScore = 0;
  machine.failureProb = 0;
  machine.rpm = machine.vars.rpm?.value ?? machine.rpm ?? 0;

  machine.quality = {};
  for (const [name, entry] of Object.entries(machine.vars)) {
    if (entry.type === 'quality') machine.quality[name] = entry.value;
  }
}

function buildMachineFromProfile(profile) {
  const machine = {
    id: profile.machineId,
    name: profile.machineName,
    line: profile.line,
    process: profile.process,
    status: 'RUNNING',
    setpointOverride: null,
    vars: {},
    quality: {},
    temp: 0,
    vib: 0,
    load: 0,
    defect: 0,
    oee: 0,
    energy: 0,
    rpm: 0,
    anomalyScore: 0,
    failureProb: 0,
    primaryVar: null,
    primaryValue: null,
    qualityVar: null,
  };

  for (const [varName, entry] of Object.entries(profile.variables)) {
    machine.vars[varName] = { ...entry };
    machine[varName] = entry.value;
    if (entry.type === 'quality') machine.quality[varName] = entry.value;
  }

  syncMachineValuesFromProfile(machine, profile);
  return machine;
}

function buildSPCWindow(profile) {
  const baseVar = profile.summaryVars?.quality || profile.primaryVar;
  const entry = baseVar ? profile.variables[baseVar] : null;
  const base = entry?.quality_target ?? entry?.base_value ?? profile.defectBase ?? 0;
  const noise = Math.max(entry?.noise ?? Math.max(Math.abs(base) * 0.005, 0.01), 0.01);
  const rng = mulberry32(seedFromText(profile.machineId));
  const window = [];

  for (let i = 0; i < 40; i++) {
    const value = base + (rng() - 0.5) * noise * 3;
    window.push(parseFloat(value.toFixed(4)));
  }

  if (profile.machineId === 'BTL-03') {
    window[28] += noise * 2.1;
    window[33] += noise * 1.5;
  }

  if (profile.machineId === 'FUR-01') {
    window[24] += noise * 1.8;
  }

  return window;
}

function buildProfileFromRows(rows) {
  const first = rows[0];
  const profile = {
    process: first.process,
    machineId: first.machine_id,
    machineName: first.machine_name,
    line: first.line,
    variables: {},
    operativeVars: [],
    qualityVars: [],
    primaryVar: null,
    summaryVars: {},
  };

  for (const rawRow of rows) {
    const row = parseConfigRow(rawRow);
    const entry = buildVariableEntry(row);
    profile.variables[row.var_name] = entry;
    if (row.var_type === 'quality') profile.qualityVars.push(row.var_name);
    else profile.operativeVars.push(row.var_name);
  }

  syncProfileAliases(profile);
  return profile;
}

function buildStateFromProfiles(profiles) {
  const machines = {};
  const spcWindows = {};

  for (const profile of Object.values(profiles)) {
    machines[profile.machineId] = buildMachineFromProfile(profile);
    spcWindows[profile.machineId] = buildSPCWindow(profile);
  }

  return { machines, spcWindows };
}

export function buildFromCSV(configRows = []) {
  if (!Array.isArray(configRows) || !configRows.length) {
    return buildFallbackState();
  }

  const grouped = new Map();
  const order = [];

  for (const rawRow of configRows) {
    if (!rawRow?.machine_id) continue;
    const row = parseConfigRow(rawRow);
    if (!grouped.has(row.machine_id)) {
      grouped.set(row.machine_id, []);
      order.push(row.machine_id);
    }
    grouped.get(row.machine_id).push(row);
  }

  const profiles = {};
  for (const machineId of order) {
    profiles[machineId] = buildProfileFromRows(grouped.get(machineId));
  }

  const { machines, spcWindows } = buildStateFromProfiles(profiles);
  return { machines, profiles, spcWindows };
}

function buildFallbackState() {
  const fallbackRows = [
    { process: 'BOTTLING', machine_id: 'BTL-01', machine_name: 'Tanque de almacenamiento', line: 'Línea 1', var_name: 'level', var_type: 'operative', unit: '%', base_value: 85, noise: 2, spring: 0.03, min: 0, max: 100, warn: 92, crit: 95, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-01', machine_name: 'Tanque de almacenamiento', line: 'Línea 1', var_name: 'temperature', var_type: 'operative', unit: '°C', base_value: 82, noise: 1, spring: 0.04, min: 15, max: 100, warn: 90, crit: 95, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-01', machine_name: 'Tanque de almacenamiento', line: 'Línea 1', var_name: 'pressure', var_type: 'operative', unit: 'bar', base_value: 1.2, noise: 0.1, spring: 0.05, min: 0, max: 3, warn: 2.5, crit: 2.8, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-03', machine_name: 'Llenadora automática', line: 'Línea 1', var_name: 'fill_time', var_type: 'operative', unit: 's', base_value: 2.5, noise: 0.15, spring: 0.04, min: 1, max: 5, warn: 3.5, crit: 4.2, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-03', machine_name: 'Llenadora automática', line: 'Línea 1', var_name: 'precision', var_type: 'operative', unit: '%', base_value: 98.5, noise: 0.5, spring: 0.05, min: 80, max: 100, warn: 95, crit: 90, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-03', machine_name: 'Llenadora automática', line: 'Línea 1', var_name: 'speed', var_type: 'operative', unit: 'botellas/min', base_value: 120, noise: 8, spring: 0.03, min: 40, max: 200, warn: 160, crit: 180, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-03', machine_name: 'Llenadora automática', line: 'Línea 1', var_name: 'nozzle_state', var_type: 'operative', unit: '', base_value: 0.95, noise: 0.02, spring: 0.02, min: 0, max: 1, warn: 0.7, crit: 0.5, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-05', machine_name: 'Tapadora', line: 'Línea 1', var_name: 'torque', var_type: 'operative', unit: 'Nm', base_value: 2.5, noise: 0.15, spring: 0.04, min: 0, max: 5, warn: 3.8, crit: 4.5, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-05', machine_name: 'Tapadora', line: 'Línea 1', var_name: 'precision', var_type: 'operative', unit: '%', base_value: 97, noise: 1.0, spring: 0.05, min: 80, max: 100, warn: 94, crit: 90, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'BOTTLING', machine_id: 'BTL-05', machine_name: 'Tapadora', line: 'Línea 1', var_name: 'speed', var_type: 'operative', unit: 'tapas/min', base_value: 80, noise: 6, spring: 0.03, min: 30, max: 140, warn: 110, crit: 125, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-01', machine_name: 'Horno industrial', line: 'Línea 2', var_name: 'temperature', var_type: 'operative', unit: '°C', base_value: 220, noise: 1.5, spring: 0.02, min: 180, max: 260, warn: 242, crit: 248, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-01', machine_name: 'Horno industrial', line: 'Línea 2', var_name: 'residence_time', var_type: 'operative', unit: 'min', base_value: 45, noise: 2, spring: 0.03, min: 20, max: 90, warn: 70, crit: 80, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-02', machine_name: 'Sistema de ventilación', line: 'Línea 2', var_name: 'air_flow', var_type: 'operative', unit: 'm³/s', base_value: 8.5, noise: 0.5, spring: 0.04, min: 2, max: 15, warn: 12, crit: 14, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-02', machine_name: 'Sistema de ventilación', line: 'Línea 2', var_name: 'fan_vibration', var_type: 'operative', unit: 'g', base_value: 0.35, noise: 0.04, spring: 0.05, min: 0, max: 2, warn: 0.85, crit: 1.1, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-04', machine_name: 'Controladores PID', line: 'Línea 2', var_name: 'setpoint_temp', var_type: 'operative', unit: '°C', base_value: 218, noise: 0.5, spring: 0.06, min: 180, max: 260, warn: 242, crit: 248, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-04', machine_name: 'Controladores PID', line: 'Línea 2', var_name: 'response_time', var_type: 'operative', unit: 's', base_value: 2.8, noise: 0.3, spring: 0.04, min: 0.5, max: 10, warn: 6, crit: 8, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
    { process: 'FURNACE', machine_id: 'FUR-04', machine_name: 'Controladores PID', line: 'Línea 2', var_name: 'stability', var_type: 'operative', unit: '', base_value: 0.92, noise: 0.03, spring: 0.03, min: 0, max: 1, warn: 0.7, crit: 0.5, quality_target: null, quality_usl: null, quality_lsl: null, quality_cp: null },
  ];
  return buildFromCSV(fallbackRows);
}

// ── Compatibility profiles ───────────────────────────────────────────────────

export const MACHINE_PROFILES = {};

// ── Bootstrap from CSV if available; otherwise fallback ----------------------

const INITIAL_STATE = (() => {
  try {
    const csv = loadCSV(CONFIG_PATH);
    if (csv.configRows.length) {
      return buildFromCSV(csv.configRows);
    }
    return buildFallbackState();
  } catch {
    return buildFallbackState();
  }
})();

Object.assign(MACHINE_PROFILES, INITIAL_STATE.profiles);

function buildProductionHistory() {
  const rng = mulberry32(99);
  const history = [];
  const now = Date.now();
  for (let i = 59; i >= 0; i--) {
    history.push({ ts: now - i * 60000, value: Math.round(1180 + rng() * 260) });
  }
  return history;
}

function buildInitialAlerts() {
  const now = Date.now();
  return [
    { id: 'A-2098', sev: 'CRITICAL', machine: 'FUR-01', title: 'Temperatura del horno en vigilancia', detail: 'La temperatura base requiere seguimiento por estabilidad térmica.', time: '14:02:11', ai: 'Verificar setpoint, ventilación y tiempo de residencia.', status: 'active', ts: now - 1200000 },
    { id: 'A-2097', sev: 'HIGH', machine: 'BTL-03', title: 'Variabilidad de llenado elevada', detail: 'La llenadora automática es la variable crítica del proceso de embotellado.', time: '13:58:42', ai: 'Revisar boquillas, presión y velocidad de la línea.', status: 'active', ts: now - 1440000 },
    { id: 'A-2096', sev: 'HIGH', machine: 'BTL-02', title: 'Vibración de bomba fuera de tendencia', detail: 'La bomba industrial debe mantener una vibración estable para sostener el caudal.', time: '13:51:08', ai: 'Inspeccionar acople, rodamientos y presión de impulsión.', status: 'active', ts: now - 1720000 },
    { id: 'A-2095', sev: 'MEDIUM', machine: 'FUR-03', title: 'Drift de sensor térmico', detail: 'El sensor térmico muestra deriva leve sobre la base calibrada.', time: '13:44:27', ai: 'Recalibrar sonda y verificar ruido de medición.', status: 'active', ts: now - 2120000 },
    { id: 'A-2094', sev: 'MEDIUM', machine: 'BTL-05', title: 'Torque de tapa variable', detail: 'La tapadora requiere ajuste fino para sostener el cierre.', time: '13:30:00', ai: 'Ajustar torque y revisar desgaste mecánico.', status: 'active', ts: now - 2880000 },
    { id: 'A-2093', sev: 'LOW', machine: 'BTL-06', title: 'Alineación de etiqueta pendiente', detail: 'La etiquetadora mantiene precisión correcta pero con margen de mejora.', time: '13:21:55', ai: 'Ajustar posición y revisar guías.', status: 'acknowledged', ts: now - 3240000 },
  ];
}

function buildInitialEvents() {
  const now = Date.now();
  return [
    { id: 'E-1', ts: now - 1200000, label: 'Observación térmica FUR-01', kind: 'critical' },
    { id: 'E-2', ts: now - 1440000, label: 'Llenado BTL-03 monitoreado', kind: 'critical' },
    { id: 'E-3', ts: now - 1720000, label: 'Vibración BTL-02 en revisión', kind: 'warn' },
    { id: 'E-4', ts: now - 2880000, label: 'Turno de producción iniciado', kind: 'info' },
    { id: 'E-5', ts: now - 3480000, label: 'Setpoint actualizado FUR-01', kind: 'info' },
    { id: 'E-6', ts: now - 4200000, label: 'Lote #44871 cerrado · 99.1% yield', kind: 'ok' },
    { id: 'E-7', ts: now - 5040000, label: 'Modelo IA reentrenado v2.41', kind: 'ai' },
  ];
}

export const state = {
  tick: 0,
  startTime: Date.now(),

  machines: INITIAL_STATE.machines,
  alerts: buildInitialAlerts(),
  events: buildInitialEvents(),
  spcWindows: INITIAL_STATE.spcWindows,
  productionHistory: buildProductionHistory(),

  simulator: {
    status: 'idle',
    params: { temp: 220, speed: 100, pressure: 150, vibration: 0.5, torque: 214 },
    results: { defect: 3.2, cp: 1.18, cpk: 1.09, yield: 96.8, dpmo: 1420, sigma: 4.42, energy: 438, production: 1720 },
    history: [],
    scenarios: [
      { id: 's1', name: 'Eco mode', desc: 'Reduce speed 10%, ahorra 6.4% kWh', type: 'Energía', params: { temp: 215, speed: 90, pressure: 145, vibration: 0.45, torque: 200 } },
      { id: 's2', name: 'Quality boost', desc: 'Optimiza Cp a 1.55 sacrificando 4% velocidad', type: 'Calidad', params: { temp: 218, speed: 96, pressure: 152, vibration: 0.48, torque: 210 } },
      { id: 's3', name: 'Heat stress test', desc: 'Sube temperatura +15°C y observa falla', type: 'Stress', params: { temp: 235, speed: 100, pressure: 150, vibration: 0.55, torque: 214 } },
      { id: 's4', name: 'Demand spike', desc: 'Producción +25% durante 6h', type: 'Producción', params: { temp: 225, speed: 125, pressure: 158, vibration: 0.60, torque: 224 } },
    ],
    intervalId: null,
  },

  config: {
    wecoRules: { r1: true, r2: true, r3: true, r4: false, r5: true, r6: false, r7: false, r8: false },
    spcLimits: [
      { id: 'sl1', char: 'Diámetro inyector', target: 12.50, usl: 12.65, lsl: 12.35, ucl: 12.62, lcl: 12.38, cp: 1.33 },
      { id: 'sl2', char: 'Espesor pared', target: 2.40, usl: 2.48, lsl: 2.32, ucl: 2.47, lcl: 2.33, cp: 1.33 },
      { id: 'sl3', char: 'Peso pieza', target: 48.0, usl: 48.6, lsl: 47.4, ucl: 48.5, lcl: 47.5, cp: 1.50 },
      { id: 'sl4', char: 'Temperatura curado', target: 214, usl: 220, lsl: 208, ucl: 219, lcl: 209, cp: 1.33 },
      { id: 'sl5', char: 'Densidad', target: 1.18, usl: 1.22, lsl: 1.14, ucl: 1.21, lcl: 1.15, cp: 1.50 },
    ],
  },

  users: [],

  currentUser: {
    id: 'u1', name: 'Luis Mendoza', firstName: 'Luis', lastName: 'Mendoza',
    role: 'Plant Engineer', department: 'Operaciones', plant: 'Querétaro · MX-01',
    shift: 'B (14:00 – 22:00)', email: 'l.mendoza@industria.io', phone: '+52 442 ••• 4231',
    avatar: 'LM', language: 'Español (MX)', timezone: 'America/Mexico_City',
    prefs: { pushNotif: true, smsAlerts: true, dailySummary: true, sounds: false, focusMode: false, aiProactive: true },
    clearance: 'Ω-2',
  },

  reports: [
    { id: 'r1', tipo: 'DMAIC', nombre: 'Reducción defectos BTL-03', autor: 'L. Mendoza', fecha: '21 May 2026', estado: 'Listo', size: '4.2 MB' },
    { id: 'r2', tipo: 'SPC', nombre: 'Capability mensual FUR-01', autor: 'A. Rivera', fecha: '20 May 2026', estado: 'Listo', size: '2.1 MB' },
    { id: 'r3', tipo: 'IA', nombre: 'Predicción fallas Q2', autor: 'NEXUS-AI', fecha: '19 May 2026', estado: 'Listo', size: '1.8 MB' },
    { id: 'r4', tipo: 'Energía', nombre: 'Consumo turno B', autor: 'L. Mendoza', fecha: '18 May 2026', estado: 'Borrador', size: '—' },
    { id: 'r5', tipo: 'Pareto', nombre: 'Causas defecto BTL-02', autor: 'A. Rivera', fecha: '17 May 2026', estado: 'Listo', size: '880 KB' },
    { id: 'r6', tipo: 'DMAIC', nombre: 'Mejora OEE línea 1', autor: 'C. Núñez', fecha: '15 May 2026', estado: 'Revisión', size: '3.0 MB' },
  ],

  conversations: [],
};

export function getMachinesArray() {
  return Object.values(state.machines);
}

export function getActiveAlerts() {
  return state.alerts.filter(alert => alert.status !== 'closed');
}

export function addEvent(label, kind) {
  const now = Date.now();
  const pad = value => String(value).padStart(2, '0');
  const date = new Date(now);
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  state.events.unshift({ id: `E-${now}`, ts: now, label, kind, time: timeStr });
  if (state.events.length > 100) state.events.pop();
}

export function replaceMachineProfiles(nextProfiles) {
  for (const key of Object.keys(MACHINE_PROFILES)) delete MACHINE_PROFILES[key];
  Object.assign(MACHINE_PROFILES, nextProfiles);
}

export function replaceSimulationState(nextState) {
  if (nextState.machines) state.machines = nextState.machines;
  if (nextState.spcWindows) state.spcWindows = nextState.spcWindows;
}

export function syncMachineFromProfile(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile) return machine;
  syncProfileAliases(profile);
  syncMachineValuesFromProfile(machine, profile);
  return machine;
}

export function loadSimulationFromCSV(filePath = CONFIG_PATH) {
  const csv = loadCSV(filePath);
  const built = buildFromCSV(csv.configRows);
  replaceMachineProfiles(built.profiles);
  replaceSimulationState({ machines: built.machines, spcWindows: built.spcWindows });
  return { ...built, dataRows: csv.dataRows };
}

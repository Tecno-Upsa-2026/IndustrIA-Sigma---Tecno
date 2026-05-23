// ─────────────────────────────────────────────────────────────────────────────
// Central in-memory state for the platform.
// All simulation, routes and WS broadcaster read/write here.
// ─────────────────────────────────────────────────────────────────────────────

let _alertSeq = 2099;
export const nextAlertId = () => `A-${++_alertSeq}`;

// ── Machine initial config ────────────────────────────────────────────────────
const INIT_MACHINES = [
  { id:'CNC-04', name:'CNC Mill A4',    line:'Línea 1', status:'RUNNING',  temp:68.2,  vib:0.42, rpm:8200, load:78, defect:1.4, oee:91.4, energy:42 },
  { id:'PRS-12', name:'Hyd Press 12',   line:'Línea 1', status:'RUNNING',  temp:72.6,  vib:0.55, rpm:0,    load:62, defect:2.1, oee:86.0, energy:38 },
  { id:'INJ-07', name:'Injection 07',   line:'Línea 2', status:'WARN',     temp:214.8, vib:0.71, rpm:140,  load:88, defect:4.8, oee:74.3, energy:61 },
  { id:'WLD-02', name:'Robot Weld R2',  line:'Línea 2', status:'RUNNING',  temp:55.0,  vib:0.31, rpm:0,    load:54, defect:0.6, oee:93.2, energy:28 },
  { id:'OVN-09', name:'Curing Oven 9',  line:'Línea 3', status:'CRITICAL', temp:248.5, vib:0.92, rpm:0,    load:97, defect:7.9, oee:58.7, energy:88 },
  { id:'PCK-03', name:'Packing Bot 3',  line:'Línea 3', status:'RUNNING',  temp:34.1,  vib:0.28, rpm:1200, load:67, defect:1.0, oee:88.9, energy:22 },
  { id:'CNV-11', name:'Conveyor 11',    line:'Línea 4', status:'IDLE',     temp:24.4,  vib:0.05, rpm:0,    load:0,  defect:0,   oee:0,    energy:4  },
  { id:'CNC-21', name:'CNC Lathe 21',   line:'Línea 4', status:'RUNNING',  temp:64.0,  vib:0.48, rpm:6400, load:71, defect:1.7, oee:84.1, energy:39 },
];

// Physics profiles per machine: spring constants, noise, thresholds, base targets
export const MACHINE_PROFILES = {
  'CNC-04': { tempBase:68,  tempNoise:0.8,  tempSpring:0.05, tempMin:20,  tempMax:100, tempWarn:80,  tempCrit:92,
               vibBase:0.42, vibNoise:0.02,  vibWarn:0.65, vibCrit:0.85,
               loadBase:78,  loadNoise:2,    energyBase:42 },
  'PRS-12': { tempBase:72,  tempNoise:1.0,  tempSpring:0.04, tempMin:20,  tempMax:110, tempWarn:85,  tempCrit:98,
               vibBase:0.55, vibNoise:0.025, vibWarn:0.72, vibCrit:0.95,
               loadBase:62,  loadNoise:3,    energyBase:38 },
  'INJ-07': { tempBase:218, tempNoise:1.5,  tempSpring:0.03, tempMin:180, tempMax:260, tempWarn:220, tempCrit:240,
               vibBase:0.70, vibNoise:0.03,  vibWarn:0.80, vibCrit:1.0,
               loadBase:88,  loadNoise:2,    energyBase:61,
               defectBase:4.8, defectNoise:0.3 },
  'WLD-02': { tempBase:55,  tempNoise:0.6,  tempSpring:0.06, tempMin:20,  tempMax:90,  tempWarn:70,  tempCrit:82,
               vibBase:0.31, vibNoise:0.015, vibWarn:0.55, vibCrit:0.72,
               loadBase:54,  loadNoise:2,    energyBase:28 },
  'OVN-09': { tempBase:250, tempNoise:1.2,  tempSpring:0.01, tempMin:200, tempMax:290, tempWarn:242, tempCrit:248,
               vibBase:0.92, vibNoise:0.04,  vibWarn:0.95, vibCrit:1.1,
               loadBase:97,  loadNoise:1.5,  energyBase:88,
               tempDrift:0.06 },  // slowly drifts upward
  'PCK-03': { tempBase:34,  tempNoise:0.4,  tempSpring:0.08, tempMin:15,  tempMax:60,  tempWarn:45,  tempCrit:55,
               vibBase:0.28, vibNoise:0.012, vibWarn:0.45, vibCrit:0.60,
               loadBase:67,  loadNoise:3,    energyBase:22 },
  'CNV-11': { tempBase:24,  tempNoise:0.2,  tempSpring:0.1,  tempMin:15,  tempMax:40,  tempWarn:35,  tempCrit:38,
               vibBase:0.05, vibNoise:0.005, vibWarn:0.20, vibCrit:0.30,
               loadBase:0,   loadNoise:0,    energyBase:4  },
  'CNC-21': { tempBase:64,  tempNoise:0.9,  tempSpring:0.05, tempMin:20,  tempMax:100, tempWarn:78,  tempCrit:90,
               vibBase:0.48, vibNoise:0.02,  vibWarn:0.68, vibCrit:0.88,
               loadBase:71,  loadNoise:2.5,  energyBase:39 },
};

// Build initial machines map
function buildMachinesMap() {
  const map = {};
  for (const m of INIT_MACHINES) {
    map[m.id] = { ...m, setpointOverride: null };
  }
  return map;
}

// SPC: 40-point ring buffer per machine
function buildSPCWindows() {
  const map = {};
  const rng = mulberry32(42);
  for (const m of INIT_MACHINES) {
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push(12.5 + (rng() - 0.5) * 0.55);
    // inject OOC for INJ-07
    if (m.id === 'INJ-07') { pts[28] += 1.8; pts[33] += 1.4; }
    map[m.id] = pts;
  }
  return map;
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Production history: last 1440 ticks (1/min = 24h), prefill 60 points
function buildProductionHistory() {
  const rng = mulberry32(99);
  const hist = [];
  const now = Date.now();
  for (let i = 59; i >= 0; i--) {
    hist.push({ ts: now - i * 60000, value: Math.round(1200 + rng() * 200) });
  }
  return hist;
}

// ── Global mutable state ──────────────────────────────────────────────────────
export const state = {
  tick: 0,
  startTime: Date.now(),

  machines: buildMachinesMap(),

  alerts: [
    { id:'A-2098', sev:'CRITICAL', machine:'OVN-09', title:'Sobrecalentamiento detectado',   detail:'Temperatura 248.5°C supera límite 240°C.', time:'14:02:11', ai:'Reducir setpoint a 230°C y verificar ventiladores 3 y 4.', status:'active', ts: Date.now()-1200000 },
    { id:'A-2097', sev:'CRITICAL', machine:'INJ-07', title:'Cp cayó por debajo de 1.0',      detail:'Capability index = 0.89 en última hora.',  time:'13:58:42', ai:'Inspeccionar boquilla y temperatura de cilindro.',        status:'active', ts: Date.now()-1440000 },
    { id:'A-2096', sev:'HIGH',     machine:'PRS-12', title:'Vibración fuera de rango',       detail:'Vib RMS 0.55g, baseline 0.30g.',           time:'13:51:08', ai:'Posible desbalance. Programar mantenimiento.',            status:'active', ts: Date.now()-1720000 },
    { id:'A-2095', sev:'HIGH',     machine:'INJ-07', title:'Drift en presión hidráulica',    detail:'7 puntos consecutivos sobre la media.',    time:'13:44:27', ai:'Regla WECO 2. Verificar bomba.',                          status:'active', ts: Date.now()-2120000 },
    { id:'A-2094', sev:'MEDIUM',   machine:'CNC-04', title:'Consumo energético elevado',     detail:'+18% vs. baseline turno.',                 time:'13:30:00', ai:'Revisar ciclo de carga.',                                 status:'active', ts: Date.now()-2880000 },
    { id:'A-2093', sev:'MEDIUM',   machine:'WLD-02', title:'Tiempo de ciclo +6%',            detail:'Cycle time 12.4s vs target 11.7s.',        time:'13:21:55', ai:'Optimizar trayectoria robot.',                           status:'acknowledged', ts: Date.now()-3240000 },
    { id:'A-2092', sev:'LOW',      machine:'PCK-03', title:'Calibración pendiente',          detail:'Última calibración hace 72h.',             time:'12:50:10', ai:'Agendar PM tier-1.',                                      status:'active', ts: Date.now()-4200000 },
  ],

  events: [
    { id:'E-1', ts: Date.now()-1200000, label:'Sobrecalentamiento OVN-09',         kind:'critical' },
    { id:'E-2', ts: Date.now()-1440000, label:'Cp INJ-07 < 1.0',                   kind:'critical' },
    { id:'E-3', ts: Date.now()-1720000, label:'Vibración PRS-12 fuera de rango',   kind:'warn'     },
    { id:'E-4', ts: Date.now()-2880000, label:'Turno B inicia',                     kind:'info'     },
    { id:'E-5', ts: Date.now()-3480000, label:'Setpoint actualizado CNC-04',        kind:'info'     },
    { id:'E-6', ts: Date.now()-4200000, label:'Lote #44871 cerrado · 99.1% yield', kind:'ok'       },
    { id:'E-7', ts: Date.now()-5040000, label:'Modelo IA reentrenado v2.41',        kind:'ai'       },
  ],

  spcWindows: buildSPCWindows(),
  productionHistory: buildProductionHistory(),

  simulator: {
    status: 'idle',
    params: { temp: 220, speed: 100, pressure: 150, vibration: 0.5, torque: 214 },
    results: { defect: 3.2, cp: 1.18, cpk: 1.09, yield: 96.8, dpmo: 1420, sigma: 4.42, energy: 438, production: 1720 },
    history: [],
    scenarios: [
      { id:'s1', name:'Eco mode',          desc:'Reduce speed 10%, ahorra 6.4% kWh',              type:'Energía',    params:{ temp:215, speed:90,  pressure:145, vibration:0.45, torque:200 } },
      { id:'s2', name:'Quality boost',     desc:'Optimiza Cp a 1.55 sacrificando 4% velocidad',   type:'Calidad',    params:{ temp:218, speed:96,  pressure:152, vibration:0.48, torque:210 } },
      { id:'s3', name:'Heat stress test',  desc:'Sube temperatura +15°C y observa falla',          type:'Stress',     params:{ temp:235, speed:100, pressure:150, vibration:0.55, torque:214 } },
      { id:'s4', name:'Demand spike',      desc:'Producción +25% durante 6h',                     type:'Producción', params:{ temp:225, speed:125, pressure:158, vibration:0.60, torque:224 } },
    ],
    intervalId: null,
  },

  config: {
    wecoRules: { r1:true, r2:true, r3:true, r4:false, r5:true, r6:false, r7:false, r8:false },
    spcLimits: [
      { id:'sl1', char:'Diámetro inyector', target:12.50, usl:12.65, lsl:12.35, ucl:12.62, lcl:12.38, cp:1.33 },
      { id:'sl2', char:'Espesor pared',     target:2.40,  usl:2.48,  lsl:2.32,  ucl:2.47,  lcl:2.33,  cp:1.33 },
      { id:'sl3', char:'Peso pieza',        target:48.0,  usl:48.6,  lsl:47.4,  ucl:48.5,  lcl:47.5,  cp:1.50 },
      { id:'sl4', char:'Temperatura curado',target:214,   usl:220,   lsl:208,   ucl:219,   lcl:209,   cp:1.33 },
      { id:'sl5', char:'Densidad',          target:1.18,  usl:1.22,  lsl:1.14,  ucl:1.21,  lcl:1.15,  cp:1.50 },
    ],
  },

  users: [
    { id:'u1', name:'Luis Mendoza', role:'Plant Engineer', email:'l.mendoza@industria.io', access:'Total',     fa:true,  lastLogin:'hace 4m',  avatar:'LM' },
    { id:'u2', name:'Ana Rivera',   role:'Quality Lead',   email:'a.rivera@industria.io',  access:'Quality',   fa:true,  lastLogin:'hace 1h',  avatar:'AR' },
    { id:'u3', name:'Carlos Núñez', role:'Maintenance',    email:'c.nunez@industria.io',   access:'Mantto',    fa:false, lastLogin:'hace 6h',  avatar:'CN' },
    { id:'u4', name:'Sofia Pérez',  role:'Operator B',     email:'s.perez@industria.io',   access:'Operación', fa:true,  lastLogin:'hace 12m', avatar:'SP' },
  ],

  currentUser: {
    id:'u1', name:'Luis Mendoza', firstName:'Luis', lastName:'Mendoza',
    role:'Plant Engineer', department:'Operaciones', plant:'Querétaro · MX-01',
    shift:'B (14:00 – 22:00)', email:'l.mendoza@industria.io', phone:'+52 442 ••• 4231',
    avatar:'LM', language:'Español (MX)', timezone:'America/Mexico_City',
    prefs: { pushNotif:true, smsAlerts:true, dailySummary:true, sounds:false, focusMode:false, aiProactive:true },
    clearance:'Ω-2',
  },

  reports: [
    { id:'r1', tipo:'DMAIC',   nombre:'Reducción defectos INJ-07', autor:'L. Mendoza', fecha:'21 May 2026', estado:'Listo',    size:'4.2 MB' },
    { id:'r2', tipo:'SPC',     nombre:'Capability mensual CNC',    autor:'A. Rivera',  fecha:'20 May 2026', estado:'Listo',    size:'2.1 MB' },
    { id:'r3', tipo:'IA',      nombre:'Predicción fallas Q2',      autor:'NEXUS-AI',   fecha:'19 May 2026', estado:'Listo',    size:'1.8 MB' },
    { id:'r4', tipo:'Energía', nombre:'Consumo turno B',           autor:'L. Mendoza', fecha:'18 May 2026', estado:'Borrador', size:'—'      },
    { id:'r5', tipo:'Pareto',  nombre:'Causas defecto OVN-09',     autor:'A. Rivera',  fecha:'17 May 2026', estado:'Listo',    size:'880 KB' },
    { id:'r6', tipo:'DMAIC',   nombre:'Mejora OEE línea 1',        autor:'C. Núñez',   fecha:'15 May 2026', estado:'Revisión', size:'3.0 MB' },
  ],

  conversations: [],  // [{ id, messages:[] }]
};

// ── Convenience helpers ───────────────────────────────────────────────────────
export function getMachinesArray() {
  return Object.values(state.machines);
}
export function getActiveAlerts() {
  return state.alerts.filter(a => a.status !== 'closed');
}
export function addEvent(label, kind) {
  const now = Date.now();
  const pad = n => String(n).padStart(2,'0');
  const d = new Date(now);
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  state.events.unshift({ id:`E-${now}`, ts: now, label, kind, time: timeStr });
  if (state.events.length > 100) state.events.pop();
}

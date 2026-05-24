import { I } from './icons'

export const NAV = [
  { id:'dashboard',   label:'Dashboard',              icon: I.grid,     group:'OVERVIEW' },
  { id:'monitor_sim', label:'Monitoreo y Simulación', icon: I.pulse,    group:'OVERVIEW' },
  { id:'lss',         label:'Lean Six Sigma',         icon: I.beaker,   group:'ANÁLISIS' },
  { id:'ai_alerts',   label:'IA + Alertas',           icon: I.brain,    group:'INTELIGENCIA', badge:'7' },
  { id:'reports',     label:'Reportes',               icon: I.doc,      group:'ADMIN' },
  { id:'config',      label:'Configuración',          icon: I.settings, group:'ADMIN' },
  { id:'profile',     label:'Perfil',                 icon: I.user,     group:'ADMIN' },
];

export const MACHINES = [
  { id:'CNC-04', name:'CNC Mill A4',   line:'Línea 1', status:'RUNNING',  oee:91.4, temp:68.2,  vib:0.42, rpm:8200, load:78, defect:1.4 },
  { id:'PRS-12', name:'Hyd Press 12',  line:'Línea 1', status:'RUNNING',  oee:86.0, temp:72.6,  vib:0.55, rpm:0,    load:62, defect:2.1 },
  { id:'INJ-07', name:'Injection 07',  line:'Línea 2', status:'WARN',     oee:74.3, temp:214.8, vib:0.71, rpm:140,  load:88, defect:4.8 },
  { id:'WLD-02', name:'Robot Weld R2', line:'Línea 2', status:'RUNNING',  oee:93.2, temp:55.0,  vib:0.31, rpm:0,    load:54, defect:0.6 },
  { id:'OVN-09', name:'Curing Oven 9', line:'Línea 3', status:'CRITICAL', oee:58.7, temp:248.5, vib:0.92, rpm:0,    load:97, defect:7.9 },
  { id:'PCK-03', name:'Packing Bot 3', line:'Línea 3', status:'RUNNING',  oee:88.9, temp:34.1,  vib:0.28, rpm:1200, load:67, defect:1.0 },
  { id:'CNV-11', name:'Conveyor 11',   line:'Línea 4', status:'IDLE',     oee:0.0,  temp:24.4,  vib:0.05, rpm:0,    load:0,  defect:0   },
  { id:'CNC-21', name:'CNC Lathe 21',  line:'Línea 4', status:'RUNNING',  oee:84.1, temp:64.0,  vib:0.48, rpm:6400, load:71, defect:1.7 },
];

export const ALERTS = [
  { id:'A-2098', sev:'CRITICAL', machine:'OVN-09', title:'Sobrecalentamiento detectado',   detail:'Temperatura 248.5°C supera límite 240°C por 4 min.', time:'14:02:11', ai:'Reducir setpoint a 230°C y verificar ventiladores 3 y 4.' },
  { id:'A-2097', sev:'CRITICAL', machine:'INJ-07', title:'Cp cayó por debajo de 1.0',      detail:'Capability index = 0.89 en última hora.',           time:'13:58:42', ai:'Inspeccionar boquilla y temperatura de cilindro.' },
  { id:'A-2096', sev:'HIGH',     machine:'PRS-12', title:'Vibración fuera de rango',       detail:'Vib RMS 0.55g, baseline 0.30g.',                    time:'13:51:08', ai:'Posible desbalance. Programar mantenimiento.' },
  { id:'A-2095', sev:'HIGH',     machine:'INJ-07', title:'Drift en presión hidráulica',    detail:'7 puntos consecutivos sobre la media.',             time:'13:44:27', ai:'Regla WECO 2. Verificar bomba.' },
  { id:'A-2094', sev:'MEDIUM',   machine:'CNC-04', title:'Consumo energético elevado',     detail:'+18% vs. baseline turno.',                          time:'13:30:00', ai:'Revisar ciclo de carga.' },
  { id:'A-2093', sev:'MEDIUM',   machine:'WLD-02', title:'Tiempo de ciclo +6%',            detail:'Cycle time 12.4s vs target 11.7s.',                 time:'13:21:55', ai:'Optimizar trayectoria robot.' },
  { id:'A-2092', sev:'LOW',      machine:'PCK-03', title:'Calibración pendiente',          detail:'Última calibración hace 72h.',                      time:'12:50:10', ai:'Agendar PM tier-1.' },
];

export const EVENTS = [
  { t:'14:02', label:'Sobrecalentamiento OVN-09',    kind:'critical' },
  { t:'13:58', label:'Cp INJ-07 < 1.0',              kind:'critical' },
  { t:'13:51', label:'Vibración PRS-12',             kind:'warn' },
  { t:'13:30', label:'Turno B inicia',               kind:'info' },
  { t:'13:18', label:'Setpoint actualizado CNC-04',  kind:'info' },
  { t:'13:02', label:'Lote #44871 cerrado · 99.1% yield', kind:'ok' },
  { t:'12:40', label:'Modelo IA reentrenado v2.41',  kind:'ai' },
];

// Seeded RNG for stable charts
export function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

export function makeSeries(n, base, amp, drift=0){
  const out=[]; let v = base;
  for(let i=0;i<n;i++){ v += (rng()-0.5)*amp + (drift||0); out.push(v); }
  return out;
}

export const SPC_DATA = (() => {
  const points = makeSeries(40, 50.00, 0.55);
  points[28] += 1.8;
  points[33] += 1.4;
  const mean = points.reduce((a,b)=>a+b,0)/points.length;
  const sd   = Math.sqrt(points.reduce((a,b)=>a+(b-mean)**2,0)/points.length);
  return { points, mean, ucl: mean+3*sd, lcl: mean-3*sd, usl: mean+2.5*sd+0.2, lsl: mean-2.5*sd-0.2, sd };
})();

export const PARETO = [
  { cause:'Temperatura', count:148 },
  { cause:'Vibración',   count:97  },
  { cause:'Presión',     count:64  },
  { cause:'Material',    count:42  },
  { cause:'Operario',    count:28  },
  { cause:'Calibración', count:18  },
  { cause:'Otros',       count:10  },
];

export const ISHIKAWA = {
  problem:'Defectos en lote inyección',
  branches: [
    { name:'Máquina',    causes:['Boquilla desgastada','Calibración fuera','Sensor presión derivado'] },
    { name:'Método',     causes:['Setpoint inadecuado','Receta v1.2 obsoleta'] },
    { name:'Material',   causes:['Humedad pellet 0.18%','Lote MP-441 fuera spec'] },
    { name:'Medición',   causes:['Drift caliper','Frecuencia muestreo baja'] },
    { name:'Mano obra',  causes:['Turno B sin entrenar','Cambio operador'] },
    { name:'Medio amb.', causes:['Temp. ambiente 31°C','HR 68%'] },
  ]
};

export const PROD_TREND = makeSeries(24, 1200, 90, 2.5).map((v,i)=>({ h:i, value:Math.max(900,Math.round(v)) }));

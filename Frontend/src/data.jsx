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
  { id:'BTL-01', name:'Tanque de almacenamiento', line:'Línea 1', status:'RUNNING',  oee:96.8, temp:82.0,  vib:0.00, rpm:0,    load:85, defect:0.8 },
  { id:'BTL-02', name:'Bomba industrial',        line:'Línea 1', status:'RUNNING',  oee:94.1, temp:84.3,  vib:0.26, rpm:0,    load:120, defect:1.2 },
  { id:'BTL-03', name:'Llenadora automática',    line:'Línea 1', status:'WARN',     oee:89.7, temp:80.6,  vib:0.18, rpm:0,    load:120, defect:1.9 },
  { id:'BTL-04', name:'Banda transportadora',    line:'Línea 1', status:'RUNNING',  oee:92.4, temp:24.1,  vib:0.12, rpm:0,    load:45,  defect:0.7 },
  { id:'BTL-05', name:'Tapadora',                line:'Línea 1', status:'RUNNING',  oee:95.2, temp:25.2,  vib:0.10, rpm:0,    load:80,  defect:0.9 },
  { id:'BTL-06', name:'Etiquetadora',            line:'Línea 1', status:'RUNNING',  oee:93.6, temp:24.8,  vib:0.09, rpm:0,    load:90,  defect:1.0 },
  { id:'FUR-01', name:'Horno industrial',        line:'Línea 2', status:'WARN',     oee:88.4, temp:221.0, vib:0.05, rpm:0,    load:45,  defect:1.6 },
  { id:'FUR-02', name:'Sistema de ventilación',  line:'Línea 2', status:'RUNNING',  oee:90.8, temp:35.0,  vib:0.34, rpm:1450, load:8,   defect:1.1 },
  { id:'FUR-03', name:'Sensores térmicos',       line:'Línea 2', status:'RUNNING',  oee:92.0, temp:0.5,   vib:0.00, rpm:0,    load:0,   defect:0.4 },
  { id:'FUR-04', name:'Controladores PID',       line:'Línea 2', status:'RUNNING',  oee:97.3, temp:218.0, vib:0.00, rpm:0,    load:0,   defect:0.2 },
];

export const ALERTS = [
  { id:'A-2098', sev:'CRITICAL', machine:'FUR-01', title:'Temperatura del horno en vigilancia', detail:'Temperatura 248.0°C supera el límite crítico.', time:'14:02:11', ai:'Reducir setpoint y revisar ventilación.' },
  { id:'A-2097', sev:'HIGH',     machine:'BTL-03', title:'Variabilidad de llenado elevada',      detail:'El volumen de llenado presenta dispersión alta.', time:'13:58:42', ai:'Revisar boquillas y presión de impulsión.' },
  { id:'A-2096', sev:'HIGH',     machine:'BTL-02', title:'Vibración de bomba fuera de rango',    detail:'La bomba industrial elevó su vibración sobre base.', time:'13:51:08', ai:'Inspeccionar rodamientos y acople.' },
  { id:'A-2095', sev:'MEDIUM',   machine:'FUR-03', title:'Deriva de sensor térmico',            detail:'El sensor térmico muestra drift leve.', time:'13:44:27', ai:'Recalibrar sonda y verificar ruido.' },
  { id:'A-2094', sev:'MEDIUM',   machine:'BTL-05', title:'Torque de tapa variable',              detail:'La tapadora requiere ajuste fino.', time:'13:30:00', ai:'Ajustar torque y validar cierre.' },
  { id:'A-2093', sev:'LOW',      machine:'BTL-06', title:'Alineación de etiqueta pendiente',     detail:'La etiquetadora mantiene margen de mejora.', time:'13:21:55', ai:'Ajustar guía lateral.' },
  { id:'A-2092', sev:'LOW',      machine:'BTL-04', title:'Velocidad de banda monitoreada',      detail:'La banda transportadora mantiene operación estable.', time:'12:50:10', ai:'Mantener vigilancia del ciclo.' },
];

export const EVENTS = [
  { t:'14:02', label:'Temperatura FUR-01 en vigilancia', kind:'critical' },
  { t:'13:58', label:'Variabilidad BTL-03 elevada',       kind:'critical' },
  { t:'13:51', label:'Vibración BTL-02 fuera de rango',   kind:'warn' },
  { t:'13:30', label:'Turno B inicia',                    kind:'info' },
  { t:'13:18', label:'Setpoint actualizado BTL-05',       kind:'info' },
  { t:'13:02', label:'Lote #44871 cerrado · 99.1% yield', kind:'ok' },
  { t:'12:40', label:'Modelo IA reentrenado v2.41',       kind:'ai' },
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

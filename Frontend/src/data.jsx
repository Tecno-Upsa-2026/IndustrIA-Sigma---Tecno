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

// Seeded RNG — used for deterministic demo sparklines when backend is offline
export function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function makeSeries(n, base, amp, drift = 0) {
  const rng = mulberry32(42);
  const out = []; let v = base;
  for (let i = 0; i < n; i++) { v += (rng() - 0.5) * amp + (drift || 0); out.push(v); }
  return out;
}

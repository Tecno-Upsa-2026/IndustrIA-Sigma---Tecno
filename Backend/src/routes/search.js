import { Router } from 'express';
import { state, getMachinesArray, getActiveAlerts } from '../store/state.js';

const router = Router();

// GET /api/search?q=...
router.get('/', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ machines:[], alerts:[], screens:[], kpis:[] });

  // Machines
  const machines = getMachinesArray()
    .filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.line.toLowerCase().includes(q))
    .slice(0, 5)
    .map(m => ({ type:'machine', id:m.id, name:m.name, sub:m.line, status:m.status }));

  // Alerts
  const alerts = getActiveAlerts()
    .filter(a => a.title.toLowerCase().includes(q) || a.machine.toLowerCase().includes(q))
    .slice(0, 5)
    .map(a => ({ type:'alert', id:a.id, name:a.title, sub:a.machine, sev:a.sev }));

  // Screens
  const SCREENS = [
    { id:'dashboard',  name:'Dashboard',          sub:'Overview' },
    { id:'monitor',    name:'Monitoreo Real-Time', sub:'SCADA' },
    { id:'simulator',  name:'Simulador',           sub:'Digital Twin' },
    { id:'lss',        name:'Lean Six Sigma',      sub:'Analytics' },
    { id:'spc',        name:'SPC',                 sub:'Control Estadístico' },
    { id:'ai',         name:'IA Industrial',        sub:'Copiloto' },
    { id:'alerts',     name:'Alertas',             sub:'Centro de alertas' },
    { id:'reports',    name:'Reportes',            sub:'Admin' },
    { id:'config',     name:'Configuración',       sub:'Admin' },
    { id:'profile',    name:'Perfil',              sub:'Admin' },
  ];
  const screens = SCREENS
    .filter(s => s.name.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q))
    .map(s => ({ type:'screen', ...s }));

  res.json({ machines, alerts, screens, total: machines.length + alerts.length + screens.length });
});

export default router;

import { Router } from 'express';
import { state, getMachinesArray } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';

const router = Router();

// GET /api/reports
router.get('/', (_req, res) => res.json(state.reports));

// GET /api/reports/:id
router.get('/:id', (req, res) => {
  const r = state.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json(r);
});

// POST /api/reports — generate new report
router.post('/', (req, res) => {
  const { tipo, nombre } = req.body;
  if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre son requeridos' });

  const id   = `r${Date.now()}`;
  const now  = new Date();
  const fecha = `${now.getDate()} ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][now.getMonth()]} ${now.getFullYear()}`;
  const report = {
    id, tipo, nombre,
    autor:  state.currentUser.name,
    fecha,
    estado: 'Generando',
    size:   '—',
  };
  state.reports.unshift(report);

  // Simulate generation delay
  setTimeout(() => {
    report.estado = 'Listo';
    report.size   = `${(Math.random() * 3 + 0.5).toFixed(1)} MB`;
  }, 2500);

  res.status(201).json(report);
});

// GET /api/reports/:id/export — export report as JSON (PDF would require jsPDF/puppeteer)
router.get('/:id/export', (req, res) => {
  const r = state.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });

  const metrics  = calcGlobalMetrics();
  const machines = getMachinesArray();

  const payload = {
    meta:     { ...r, exportedAt: new Date().toISOString() },
    metrics,
    machines: machines.map(m => ({ id:m.id, name:m.name, oee:m.oee, status:m.status })),
    summary:  'Generado por IndustrIA Σ — Plataforma Industrial de Simulación y Optimización',
  };

  res.setHeader('Content-Disposition', `attachment; filename="${r.id}.json"`);
  res.json(payload);
});

// DELETE /api/reports/:id
router.delete('/:id', (req, res) => {
  const idx = state.reports.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Reporte no encontrado' });
  state.reports.splice(idx, 1);
  res.json({ ok:true });
});

export default router;

import { Router } from 'express';
import { state } from '../store/state.js';

const router = Router();

// GET /api/profile
router.get('/', (_req, res) => res.json(state.currentUser));

// PATCH /api/profile — update profile fields
router.patch('/', (req, res) => {
  const allowed = ['firstName','lastName','email','phone','role','department','plant','shift','language','timezone','prefs'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === 'prefs' && typeof req.body[k] === 'object') {
        Object.assign(state.currentUser.prefs, req.body[k]);
      } else {
        state.currentUser[k] = req.body[k];
      }
    }
  }
  // Rebuild full name
  if (req.body.firstName || req.body.lastName) {
    state.currentUser.name = `${state.currentUser.firstName} ${state.currentUser.lastName}`;
    state.currentUser.avatar = (state.currentUser.firstName[0] + state.currentUser.lastName[0]).toUpperCase();
  }
  res.json(state.currentUser);
});

// GET /api/profile/sessions — active sessions
router.get('/sessions', (_req, res) => {
  res.json([
    { id:'sess1', device:'MacBook Pro · Safari',   loc:'Querétaro, MX',  time:'Activa ahora', current:true },
    { id:'sess2', device:'iPhone 15 · App',         loc:'Querétaro, MX',  time:'hace 2h' },
    { id:'sess3', device:'Tablet Planta · Chrome',  loc:'MX-01 floor',    time:'hace 6h' },
  ]);
});

// DELETE /api/profile/sessions/:id — close session
router.delete('/sessions/:id', (req, res) => {
  if (req.params.id === 'sess1') return res.status(403).json({ error: 'No puedes cerrar tu sesión actual desde aquí. Usa Cerrar Sesión.' });
  res.json({ ok:true, message:'Sesión cerrada correctamente' });
});

// GET /api/profile/api-tokens
router.get('/api-tokens', (_req, res) => {
  res.json([
    { id:'tk1', name:'CI Pipeline',     created:'15 Abr 2026', lastUsed:'hace 2h',  scopes:['read'] },
    { id:'tk2', name:'Grafana Export',  created:'02 Mar 2026', lastUsed:'hace 1d',  scopes:['read','export'] },
  ]);
});

// POST /api/profile/api-tokens — create token
router.post('/api-tokens', (req, res) => {
  const { name, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  const token = Buffer.from(`${name}-${Date.now()}`).toString('base64').slice(0, 32);
  res.json({ id:`tk${Date.now()}`, name, scopes: scopes||['read'], token, created: new Date().toLocaleDateString() });
});

// DELETE /api/profile/api-tokens/:id
router.delete('/api-tokens/:id', (req, res) => {
  res.json({ ok:true });
});

export default router;

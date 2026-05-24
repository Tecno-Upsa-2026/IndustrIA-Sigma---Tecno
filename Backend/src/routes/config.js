import { Router } from 'express';
import { state, getMachinesArray, addEvent } from '../store/state.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/config
router.get('/', (_req, res) => {
  res.json({
    wecoRules: state.config.wecoRules,
    spcLimits: state.config.spcLimits,
    users:     state.users,
  });
});

// ── WECO rules ────────────────────────────────────────────────────────────────
// PATCH /api/config/weco/:rule — toggle rule on/off
router.patch('/weco/:rule', (req, res) => {
  const rule = req.params.rule;
  if (!(rule in state.config.wecoRules)) return res.status(404).json({ error: 'Regla no encontrada' });
  const { on } = req.body;
  state.config.wecoRules[rule] = Boolean(on);
  addEvent(`Regla WECO ${rule.toUpperCase()} ${on ? 'activada' : 'desactivada'}`, 'info');
  res.json({ rule, on: state.config.wecoRules[rule] });
});

// GET /api/config/weco
router.get('/weco', (_req, res) => res.json(state.config.wecoRules));

// ── SPC Limits ────────────────────────────────────────────────────────────────
// GET /api/config/spc-limits
router.get('/spc-limits', (_req, res) => res.json(state.config.spcLimits));

// POST /api/config/spc-limits
router.post('/spc-limits', (req, res) => {
  const { char, target, usl, lsl, ucl, lcl, cp } = req.body;
  if (!char) return res.status(400).json({ error: 'char requerido' });
  const limit = { id:`sl${Date.now()}`, char, target, usl, lsl, ucl, lcl, cp };
  state.config.spcLimits.push(limit);
  res.status(201).json(limit);
});

// PATCH /api/config/spc-limits/:id
router.patch('/spc-limits/:id', (req, res) => {
  const lim = state.config.spcLimits.find(l => l.id === req.params.id);
  if (!lim) return res.status(404).json({ error: 'Límite no encontrado' });
  Object.assign(lim, req.body);
  addEvent(`Límites SPC actualizados: ${lim.char}`, 'info');
  res.json(lim);
});

// DELETE /api/config/spc-limits/:id
router.delete('/spc-limits/:id', (req, res) => {
  const idx = state.config.spcLimits.findIndex(l => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Límite no encontrado' });
  state.config.spcLimits.splice(idx, 1);
  res.json({ ok:true });
});

// ── Users ─────────────────────────────────────────────────────────────────────
// GET /api/config/users
router.get('/users', (_req, res) => res.json(state.users));

// POST /api/config/users — invite user (sends real email via Supabase)
router.post('/users', async (req, res) => {
  const { name, role, email, access } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name y email requeridos' });

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data:       { name, role: role || 'Operator', access: access || 'Operación' },
      redirectTo: process.env.APP_URL || 'http://localhost:5174',
    });
    if (error) return res.status(400).json({ error: error.message });
  }

  const user = {
    id:        `u${Date.now()}`,
    name, role: role || 'Operator', email, access: access || 'Operación',
    fa:        false,
    lastLogin: 'Invitación enviada',
    avatar:    name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2),
    invited:   true,
  };
  state.users.push(user);
  addEvent(`Usuario ${name} (${email}) invitado al sistema`, 'info');
  res.status(201).json(user);
});

// PATCH /api/config/users/:id
router.patch('/users/:id', (req, res) => {
  const u = state.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const allowed = ['name','role','access','fa'];
  for (const k of allowed) if (req.body[k] !== undefined) u[k] = req.body[k];
  res.json(u);
});

// DELETE /api/config/users/:id
router.delete('/users/:id', (req, res) => {
  const idx = state.users.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (state.users[idx].id === 'u1') return res.status(403).json({ error: 'No puedes eliminar tu propio usuario' });
  state.users.splice(idx, 1);
  res.json({ ok:true });
});

export default router;

import { Router } from 'express';
import { state } from '../store/state.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  // Demo: accept any credentials (real auth would verify against Supabase/DB)
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const user = state.users.find(u => u.email === email) || state.currentUser;
  const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

  res.json({
    token,
    user: {
      id:    state.currentUser.id,
      name:  state.currentUser.name,
      role:  state.currentUser.role,
      email: state.currentUser.email,
      avatar:state.currentUser.avatar,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

// PATCH /api/auth/password
router.patch('/password', (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Campos requeridos' });
  if (next.length < 8)   return res.status(400).json({ error: 'Mínimo 8 caracteres' });
  // In a real system, verify current password and hash new one
  res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
});

export default router;

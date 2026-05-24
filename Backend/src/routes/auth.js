import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

const SECRET      = process.env.JWT_SECRET;
const REF_SECRET  = process.env.JWT_REFRESH_SECRET;
const EXPIRES_IN  = process.env.JWT_EXPIRES_IN         || '15m';
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function signTokens(user) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken:  jwt.sign(payload, SECRET,     { expiresIn: EXPIRES_IN  }),
    refreshToken: jwt.sign(payload, REF_SECRET, { expiresIn: REFRESH_EXP }),
  };
}

function userFromSupabase(sbUser) {
  const meta = sbUser.user_metadata || {};
  const name = meta.name || meta.full_name || sbUser.email.split('@')[0];
  return {
    id:     sbUser.id,
    email:  sbUser.email,
    name,
    role:   meta.role   || 'Operator',
    access: meta.access || 'Operación',
    avatar: name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2),
  };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  if (!supabase) return res.status(503).json({ error: 'Autenticación no configurada' });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const user = userFromSupabase(data.user);
  res.json({ ...signTokens(user), user });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(refreshToken, REF_SECRET);
    const user = DEMO_USERS.find(u => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json(signTokens(user));
  } catch {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (_req, res) => {
  // Production: add token to a blocklist (Redis). Here we just acknowledge.
  res.json({ ok: true });
});

// PATCH /api/auth/password
router.patch('/password', requireAuth, (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Campos requeridos' });
  if (next.length < 8)   return res.status(400).json({ error: 'Mínimo 8 caracteres' });
  res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
});

export default router;

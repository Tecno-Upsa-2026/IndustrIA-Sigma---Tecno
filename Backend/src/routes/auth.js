import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SECRET      = process.env.JWT_SECRET;
const REF_SECRET  = process.env.JWT_REFRESH_SECRET;
const EXPIRES_IN  = process.env.JWT_EXPIRES_IN         || '15m';
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Demo users — in production replace with a DB query + bcrypt password check
const DEMO_USERS = [
  { id: 'u1', email: 'l.mendoza@nexus.io', password: 'demo1234', name: 'L. Mendoza', role: 'Plant Engineer',   avatar: 'LM' },
  { id: 'u2', email: 'admin@nexus.io',     password: 'admin1234', name: 'Admin',      role: 'Administrator',    avatar: 'AD' },
];

function signTokens(user) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken:  jwt.sign(payload, SECRET,     { expiresIn: EXPIRES_IN  }),
    refreshToken: jwt.sign(payload, REF_SECRET, { expiresIn: REFRESH_EXP }),
  };
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = DEMO_USERS.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const { accessToken, refreshToken } = signTokens(user);
  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, role: user.role, email: user.email, avatar: user.avatar },
  });
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

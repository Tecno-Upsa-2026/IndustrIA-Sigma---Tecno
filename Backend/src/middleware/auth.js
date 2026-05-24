import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];

  // No token present — allow through (demo / unauthenticated mode)
  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  // Token present — must be valid
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

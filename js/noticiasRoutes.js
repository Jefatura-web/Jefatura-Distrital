/**
 * Rutas de API - Noticias
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const noticiasController = require('./noticiasController');

// Middleware de autenticación para rutas administrativas
function timingSafeEqual(a, b) {
  const sa = Buffer.from(String(a || ''));
  const sb = Buffer.from(String(b || ''));
  if (sa.length !== sb.length) return false;
  return crypto.timingSafeEqual(sa, sb);
}

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const normalizedToken = String(token || '').replace(/^Bearer\s+/i, '').trim();

  if (!normalizedToken) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  if (!timingSafeEqual(normalizedToken, process.env.ADMIN_TOKEN || '')) {
    return res.status(403).json({ error: 'Token de autenticación inválido' });
  }

  next();
};

// Rutas públicas (lectura)
router.get('/', noticiasController.getAll);
router.get('/slug/:slug', noticiasController.getBySlug);
router.get('/stats', noticiasController.getStats);
router.get('/:id', noticiasController.getById);

// Verificación rápida del token de administración para el acceso protegido
router.post('/admin/verify-token', (req, res) => {
  const rawToken = req.body?.token || '';
  const token = String(rawToken).replace(/^Bearer\s+/i, '').trim();
  console.log('[verify-token] request body=', req.body, 'normalized token=', token);

  if (!token) {
    return res.status(400).json({ ok: false, error: 'Debes ingresar un token de seguridad.' });
  }

  if (!timingSafeEqual(token, process.env.ADMIN_TOKEN || '')) {
    return res.status(403).json({ ok: false, error: 'Token de seguridad inválido.' });
  }

  return res.json({ ok: true, message: 'Token válido.' });
});

// Rutas administrativas (requieren autenticación)
router.get('/admin', requireAuth, noticiasController.getAllAdmin);
router.get('/admin/:id', requireAuth, noticiasController.getByIdAdmin);
router.post('/', requireAuth, noticiasController.create);
router.put('/:id', requireAuth, noticiasController.update);
router.delete('/:id', requireAuth, noticiasController.remove);

module.exports = router;

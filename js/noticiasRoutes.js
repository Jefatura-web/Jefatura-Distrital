/**
 * Rutas de API - Noticias
 */

const express = require('express');
const router = express.Router();
const noticiasController = require('./noticiasController');
const { requireAuth, timingSafeEqual } = noticiasController;
const {
  createAdminSession,
  clearAdminSession,
  isAdminSession,
  createLoginAttemptLimiter
} = require('./adminAuth');
const loginLimiter = createLoginAttemptLimiter();

// Rutas públicas (lectura)
router.get('/', noticiasController.getAll);
router.get('/categorias', noticiasController.getCategorias);
router.get('/calendario', noticiasController.getCalendar);
router.get('/slug/:slug', noticiasController.getBySlug);
router.get('/stats', noticiasController.getStats);

// Verificación rápida del token de administración para el acceso protegido
router.post('/admin/verify-token', loginLimiter.check, (req, res) => {
  const rawToken = req.body?.token || '';
  const token = String(rawToken).replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(400).json({ ok: false, error: 'Debes ingresar un token de seguridad.' });
  }

  if (!process.env.ADMIN_TOKEN) {
    console.error('[verify-token] ADMIN_TOKEN no está configurado en las variables de entorno.');
    return res.status(500).json({ ok: false, error: 'Autenticación no configurada en el servidor.' });
  }

  if (!timingSafeEqual(token, process.env.ADMIN_TOKEN)) {
    loginLimiter.recordFailure(req);
    return res.status(403).json({ ok: false, error: 'Token de seguridad inválido.' });
  }

  loginLimiter.clear(req);
  createAdminSession(res);
  return res.json({ ok: true, message: 'Token válido.' });
});

router.get('/admin/session', (req, res) => {
  if (!isAdminSession(req)) {
    return res.status(401).json({ ok: false, error: 'No hay una sesión administrativa activa.' });
  }
  return res.json({ ok: true });
});

router.delete('/admin/session', (req, res) => {
  clearAdminSession(req, res);
  return res.json({ ok: true });
});

// Rutas administrativas (requieren autenticación)
router.get('/admin/deleted', requireAuth, noticiasController.getDeletedAdmin);
router.post('/admin/:id/restore', requireAuth, noticiasController.restore);
router.get('/admin', requireAuth, noticiasController.getAllAdmin);
router.get('/admin/:id', requireAuth, noticiasController.getByIdAdmin);
router.post('/', requireAuth, noticiasController.create);
router.put('/:id', requireAuth, noticiasController.update);
router.delete('/:id', requireAuth, noticiasController.remove);

// Mantener la ruta dinámica al final: de otro modo "/admin" se interpreta como
// un ID de noticia y las rutas administrativas nunca llegan a ejecutarse.
router.get('/:id', noticiasController.getById);

module.exports = router;

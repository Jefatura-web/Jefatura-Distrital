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
  createLoginAttemptLimiter,
  requireCsrf
} = require('./adminAuth');
const loginLimiter = createLoginAttemptLimiter();

// Rutas públicas (lectura)
router.get('/', noticiasController.getAll);
router.get('/categorias', noticiasController.getCategorias);
router.get('/calendario', noticiasController.getCalendar);
router.get('/slug/:slug', noticiasController.getBySlug);
router.get('/stats', noticiasController.getStats);

// Verificación rápida del token de administración para el acceso protegido
router.post('/admin/verify-token', requireCsrf, loginLimiter.check, async (req, res) => {
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
  try {
    await createAdminSession(res);
    return res.json({ ok: true, message: 'Token válido.' });
  } catch (error) {
    console.error('[verify-token] No se pudo iniciar sesión:', error.code || error.name);
    return res.status(503).json({ ok: false, error: 'No se pudo iniciar la sesión administrativa. Intentá nuevamente.' });
  }
});

router.get('/admin/session', async (req, res) => {
  try {
    if (!await isAdminSession(req)) {
      return res.status(401).json({ ok: false, error: 'No hay una sesión administrativa activa.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('[admin-session] No se pudo consultar sesión:', error.code || error.name);
    return res.status(503).json({ ok: false, error: 'No se pudo validar la sesión. Intentá nuevamente.' });
  }
});

router.delete('/admin/session', requireCsrf, async (req, res) => {
  try {
    await clearAdminSession(req, res);
  } catch (error) {
    console.error('[admin-session] No se pudo cerrar sesión:', error.code || error.name);
    return res.status(503).json({ ok: false, error: 'No se pudo cerrar la sesión. Intentá nuevamente.' });
  }
  return res.json({ ok: true });
});

// Rutas administrativas (requieren autenticación)
router.get('/admin/deleted', requireAuth, noticiasController.getDeletedAdmin);
router.post('/admin/:id/restore', requireAuth, requireCsrf, noticiasController.restore);
router.get('/admin', requireAuth, noticiasController.getAllAdmin);
router.get('/admin/:id', requireAuth, noticiasController.getByIdAdmin);
router.post('/', requireAuth, requireCsrf, noticiasController.create);
router.put('/:id', requireAuth, requireCsrf, noticiasController.update);
router.delete('/:id', requireAuth, requireCsrf, noticiasController.remove);

// Mantener la ruta dinámica al final: de otro modo "/admin" se interpreta como
// un ID de noticia y las rutas administrativas nunca llegan a ejecutarse.
router.get('/:id', noticiasController.getById);

module.exports = router;

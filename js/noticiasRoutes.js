/**
 * Rutas de API - Noticias
 */

const express = require('express');
const router = express.Router();
const noticiasController = require('./noticiasController');
const { requireAuth, timingSafeEqual } = noticiasController;

// Rutas públicas (lectura)
router.get('/', noticiasController.getAll);
router.get('/slug/:slug', noticiasController.getBySlug);
router.get('/stats', noticiasController.getStats);
router.get('/:id', noticiasController.getById);

// Verificación rápida del token de administración para el acceso protegido
router.post('/admin/verify-token', (req, res) => {
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
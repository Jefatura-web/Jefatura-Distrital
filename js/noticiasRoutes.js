/**
 * Rutas de API - Noticias
 */

const express = require('express');
const router = express.Router();
const noticiasController = require('./noticiasController');

// Middleware de autenticación para rutas administrativas
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Token de autenticación inválido' });
  }

  next();
};

// Rutas públicas (lectura)
router.get('/', noticiasController.getAll);
router.get('/slug/:slug', noticiasController.getBySlug);
router.get('/stats', noticiasController.getStats);
router.get('/:id', noticiasController.getById);

// Rutas administrativas (requieren autenticación)
router.post('/', requireAuth, noticiasController.create);
router.put('/:id', requireAuth, noticiasController.update);
router.delete('/:id', requireAuth, noticiasController.remove);

module.exports = router;

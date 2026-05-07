/**
 * Rutas de API - Noticias
 */

const express = require('express');
const router = express.Router();
const noticiasController = require('../noticiasController');

router.get('/', noticiasController.getAll);
router.post('/', noticiasController.create);

module.exports = router;

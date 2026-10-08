/**
 * Upload de imágenes — multer (memoryStorage) + Cloudinary
 * POST /upload  →  { ok: true, url: "https://res.cloudinary.com/..." }
 *
 * Variables de entorno requeridas (agregar en Render → Environment):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const crypto     = require('crypto');

const router = express.Router();

// ── Auth local (mismo patrón que actividadesController) ───────────────────────
function timingSafeEqual(a, b) {
  const sa = Buffer.from(String(a || ''));
  const sb = Buffer.from(String(b || ''));
  if (sa.length !== sb.length) return false;
  return crypto.timingSafeEqual(sa, sb);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = String(header.startsWith('Bearer ') ? header.substring(7) : '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!token)                                        return res.status(401).json({ ok: false, error: 'Token requerido' });
  if (!process.env.ADMIN_TOKEN)                      return res.status(500).json({ ok: false, error: 'Auth no configurada en el servidor' });
  if (!timingSafeEqual(token, process.env.ADMIN_TOKEN)) return res.status(403).json({ ok: false, error: 'Token inválido' });
  next();
}

// ── Multer: memoria (no disco — Render borra el filesystem en cada deploy) ────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB máximo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif…)'));
  }
});

// ── Cloudinary ────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true
});

function subirACloudinary(buffer, nombreOriginal) {
  return new Promise((resolve, reject) => {
    const publicId = `jefatura/${Date.now()}-${String(nombreOriginal).replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const stream   = cloudinary.uploader.upload_stream(
      { public_id: publicId, transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
      (err, result) => { if (err) reject(err); else resolve(result); }
    );
    stream.end(buffer);
  });
}

// ── Verificar configuración de Cloudinary ────────────────────────────────────
function cloudinaryConfigurado() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY    &&
            process.env.CLOUDINARY_API_SECRET);
}

// ── Ruta POST /upload ─────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
  }

  if (!cloudinaryConfigurado()) {
    return res.status(500).json({
      ok:    false,
      error: 'Cloudinary no configurado. Agregá CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en las variables de entorno de Render.'
    });
  }

  try {
    const result = await subirACloudinary(req.file.buffer, req.file.originalname);
    res.json({ ok: true, url: result.secure_url });
  } catch (err) {
    console.error('[upload] Error Cloudinary:', err.message || err);
    res.status(500).json({ ok: false, error: 'Error al subir la imagen a Cloudinary.' });
  }
});

// Error handler de multer (archivo demasiado grande / tipo inválido)
router.use((err, _req, res, _next) => {
  console.error('[upload] Multer error:', err.message);
  res.status(400).json({ ok: false, error: err.message });
});

module.exports = router;

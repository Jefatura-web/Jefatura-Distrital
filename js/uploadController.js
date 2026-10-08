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
const { requireAuth } = require('./adminAuth');

const router = express.Router();
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'image/gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buffer.toString('ascii', 8, Math.min(buffer.length, 64));
    if (/\b(?:avif|avis)\b/.test(brands)) return 'image/avif';
    if (/\b(?:heic|heix|hevc|hevx|mif1|msf1)\b/.test(brands)) return 'image/heic';
    if (/\b(?:heif|heim|heis|hevm|hevs)\b/.test(brands)) return 'image/heif';
  }
  return null;
}

function imageMimeMatches(declaredMime, detectedMime) {
  if (declaredMime === 'image/heif' && detectedMime === 'image/heic') return true;
  if (declaredMime === 'image/heic' && detectedMime === 'image/heif') return true;
  return declaredMime === detectedMime;
}

// ── Multer: memoria (no disco — Render borra el filesystem en cada deploy) ────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB máximo
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG, WebP, GIF, AVIF, HEIC o HEIF.'));
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
      {
        public_id: publicId,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
      },
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

function mensajeErrorCloudinary(err) {
  const status = Number(err?.http_code);
  if (status === 401 || status === 403) {
    return 'Cloudinary rechazó las credenciales. Revisá CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Render.';
  }
  if (status === 400) {
    return 'Cloudinary rechazó el archivo. Probá convertir la foto a JPG, PNG o WebP y volver a subirla.';
  }
  if (status === 420 || status === 429) {
    return 'Cloudinary alcanzó temporalmente el límite de cargas. Esperá unos minutos y volvé a intentarlo.';
  }
  if (status >= 500) {
    return 'Cloudinary está teniendo un problema temporal. Volvé a intentarlo más tarde.';
  }
  return 'Cloudinary no pudo completar la carga. Revisá los registros del servidor para ver la causa.';
}

// ── Ruta POST /upload ─────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
  }

  const detectedMime = detectImageMime(req.file.buffer);
  if (!detectedMime || !imageMimeMatches(req.file.mimetype, detectedMime)) {
    return res.status(400).json({ ok: false, error: 'El contenido del archivo no coincide con una imagen válida del formato declarado.' });
  }

  if (!cloudinaryConfigurado()) {
    return res.status(500).json({
      ok:    false,
      error: 'Cloudinary no configurado. Agregá CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en las variables de entorno de Render.'
    });
  }

  try {
    const result = await subirACloudinary(req.file.buffer, req.file.originalname);
    if (!result?.secure_url) throw new Error('Cloudinary no devolvió una URL segura para la imagen.');
    res.json({ ok: true, url: result.secure_url });
  } catch (err) {
    console.error('[upload] Error Cloudinary:', {
      httpCode: err?.http_code || null,
      name: err?.name || null,
      message: err?.message || String(err)
    });
    res.status(502).json({ ok: false, error: mensajeErrorCloudinary(err) });
  }
});

// Error handler de multer (archivo demasiado grande / tipo inválido)
router.use((err, _req, res, _next) => {
  console.error('[upload] Multer error:', err.message);
  res.status(400).json({ ok: false, error: err.message });
});

module.exports = router;
module.exports.detectImageMime = detectImageMime;
module.exports.imageMimeMatches = imageMimeMatches;

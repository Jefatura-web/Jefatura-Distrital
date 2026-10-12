const cloudinary = require('cloudinary').v2;

const USAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const CLEANUP_GRACE_DAYS = 30;
const CLEANUP_BATCH_SIZE = 100;
let database = null;
let usageCache = null;
let usageCachedAt = 0;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

function setDatabase(db) {
  database = db;
}

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    database.query(sql, values, (error, result) => error ? reject(error) : resolve(result));
  });
}

function upload(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

async function registerUploadedAsset(publicId, secureUrl) {
  if (!database) throw new Error('Almacenamiento de imágenes no disponible.');
  try {
    await query(
      'INSERT INTO cloudinary_assets (public_id, secure_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE secure_url = VALUES(secure_url)',
      [publicId, secureUrl]
    );
  } catch (error) {
    try {
      await destroy(publicId);
    } catch (cleanupError) {
      console.error('[cloudinary] No se pudo revertir una carga sin registrar:', cleanupError.http_code || cleanupError.code || cleanupError.name);
    }
    throw error;
  }
}

function usageMetric(report, key, label) {
  const metric = report?.[key];
  if (!metric || typeof metric !== 'object') return null;
  const used = Number(metric.usage);
  const limit = Number(metric.limit);
  const percentage = metric.used_percent !== null && metric.used_percent !== undefined &&
    metric.used_percent !== '' && Number.isFinite(Number(metric.used_percent))
    ? Number(metric.used_percent)
    : Number.isFinite(used) && Number.isFinite(limit) && limit > 0
      ? used / limit * 100
      : null;
  if (!Number.isFinite(percentage)) return null;
  return { key, label, percentage: Math.max(0, percentage), used, limit };
}

function usageLevel(percentage) {
  if (percentage >= 95) return 'critical';
  if (percentage >= 85) return 'high';
  if (percentage >= 70) return 'warning';
  return 'ok';
}

async function getUsage() {
  if (usageCache && Date.now() - usageCachedAt < USAGE_CACHE_MS) return usageCache;
  const report = await cloudinary.api.usage();
  const metrics = [
    usageMetric(report, 'storage', 'Almacenamiento'),
    usageMetric(report, 'bandwidth', 'Transferencia de datos'),
    usageMetric(report, 'transformations', 'Transformaciones'),
    usageMetric(report, 'credits', 'Créditos')
  ].filter(Boolean);
  usageCache = {
    plan: report.plan || null,
    updatedAt: report.last_updated || null,
    checkedAt: new Date().toISOString(),
    metrics: metrics.map(metric => ({
      ...metric,
      level: usageLevel(metric.percentage)
    }))
  };
  usageCachedAt = Date.now();
  return usageCache;
}

async function destroy(publicId) {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true
  });
  if (!['ok', 'not found'].includes(result?.result)) {
    throw new Error(`Cloudinary no confirmó la eliminación (${result?.result || 'sin resultado'}).`);
  }
}

async function cleanupOrphanedAssets() {
  if (!database) throw new Error('Almacenamiento de imágenes no disponible.');
  await query(
    `UPDATE cloudinary_assets AS asset
     SET orphaned_at = CASE
       WHEN NOT EXISTS (SELECT 1 FROM noticias AS news WHERE news.imagen_public_id = asset.public_id)
         AND NOT EXISTS (SELECT 1 FROM noticias_imagenes AS image WHERE image.public_id = asset.public_id)
         AND NOT EXISTS (SELECT 1 FROM actividades_imagenes AS image WHERE image.public_id = asset.public_id)
       THEN COALESCE(asset.orphaned_at, CURRENT_TIMESTAMP)
       ELSE NULL
     END`
  );
  const assets = await query(
    `SELECT asset.public_id
     FROM cloudinary_assets AS asset
     WHERE asset.orphaned_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CLEANUP_GRACE_DAYS} DAY)
       AND NOT EXISTS (SELECT 1 FROM noticias AS news WHERE news.imagen_public_id = asset.public_id)
       AND NOT EXISTS (SELECT 1 FROM noticias_imagenes AS image WHERE image.public_id = asset.public_id)
       AND NOT EXISTS (SELECT 1 FROM actividades_imagenes AS image WHERE image.public_id = asset.public_id)
     ORDER BY asset.created_at
     LIMIT ${CLEANUP_BATCH_SIZE}`
  );

  let deleted = 0;
  for (const asset of assets) {
    try {
      await destroy(asset.public_id);
      const result = await query(
        `DELETE FROM cloudinary_assets
         WHERE public_id = ?
           AND orphaned_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CLEANUP_GRACE_DAYS} DAY)
           AND NOT EXISTS (SELECT 1 FROM noticias AS news WHERE news.imagen_public_id = ?)
           AND NOT EXISTS (SELECT 1 FROM noticias_imagenes AS image WHERE image.public_id = ?)
           AND NOT EXISTS (SELECT 1 FROM actividades_imagenes AS image WHERE image.public_id = ?)`,
        [asset.public_id, asset.public_id, asset.public_id, asset.public_id]
      );
      if (!result.affectedRows) {
        console.error('[cloudinary-cleanup] El recurso fue eliminado, pero su registro no pudo purgarse:', asset.public_id);
        continue;
      }
      deleted += 1;
    } catch (error) {
      console.error('[cloudinary-cleanup] Se reintentará eliminar el recurso:', {
        publicId: asset.public_id,
        code: error.http_code || error.code || error.name
      });
    }
  }
  return deleted;
}

module.exports = {
  setDatabase,
  upload,
  registerUploadedAsset,
  usageMetric,
  usageLevel,
  getUsage,
  cleanupOrphanedAssets,
  CLEANUP_GRACE_DAYS
};

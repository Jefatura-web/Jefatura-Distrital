/**
 * Configuración centralizada del servidor
 * TiDB Serverless: SSL obligatorio en producción, port 4000
 */

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = String(process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

module.exports = {
  port: process.env.PORT || 3000,
  env:  process.env.NODE_ENV || 'development',
  siteUrl: String(process.env.SITE_URL || '').trim().replace(/\/+$/, ''),

  database: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || (isProd ? '4000' : '3306'), 10),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'jefatura_db',

    // SSL requerido por TiDB Serverless; desactivado en desarrollo local
    ssl: isProd ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : false,

    // Opciones de pool
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  cors: {
    // CORS_ORIGIN admite una o más URLs separadas por comas. No usamos
    // credenciales porque la API se autentica con Authorization: Bearer;
    // "credentials: true" junto con "*" es rechazado por los navegadores.
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: false
  }
};

/**
 * Configuración centralizada del servidor
 * TiDB Serverless: SSL obligatorio en producción, port 4000
 */

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const configuredCorsOrigins = String(process.env.CORS_ORIGIN || (isProd ? '' : '*'))
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => Boolean(origin) && (!isProd || origin !== '*'));

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
    // La API se sirve desde el mismo origen. En producción, el CORS cross-origin
    // queda deshabilitado salvo que se declaren orígenes explícitos.
    origin: configuredCorsOrigins.length === 0
      ? false
      : configuredCorsOrigins.length === 1
        ? configuredCorsOrigins[0]
        : configuredCorsOrigins,
    credentials: false
  }
};

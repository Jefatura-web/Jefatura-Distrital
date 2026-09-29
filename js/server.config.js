/**
 * Configuración centralizada del servidor
 * TiDB Serverless: SSL obligatorio en producción, port 4000
 */

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  port: process.env.PORT || 3000,
  env:  process.env.NODE_ENV || 'development',

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
    origin:      process.env.CORS_ORIGIN || '*',
    credentials: true
  }
};
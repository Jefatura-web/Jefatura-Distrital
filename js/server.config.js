/**
 * Configuración centralizada del servidor
 */

require('dotenv').config();

module.exports = {
  // Puerto
  port: process.env.PORT || 3000,

  // Base de datos
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jefatura_db'
  },

  // Entorno
  env: process.env.NODE_ENV || 'development',

  // CORS (para producción, especificar dominios)
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }
};

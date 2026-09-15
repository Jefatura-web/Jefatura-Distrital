/**
 * Servidor Express - Jefatura Distrital Quilmes
 * Punto de entrada del servidor
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

// Importar configuración y controladores
const config = require('./server.config');
const noticiasController = require('./noticiasController');
const actividadesController = require('./actividadesController');

// ===============================
// INICIALIZAR APLICACIÓN
// ===============================
const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors(config.cors));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ===============================
// CONEXIÓN A BASE DE DATOS
// ===============================
const db = mysql.createPool({
  host:     config.database.host,
  port:     config.database.port,   // 4000 en TiDB, 3306 local
  user:     config.database.user,
  password: config.database.password,
  database: config.database.database,
  ssl:      config.database.ssl,    // TLSv1.2 en producción, false en dev
  waitForConnections: config.database.waitForConnections,
  connectionLimit:    config.database.connectionLimit,
  queueLimit:         config.database.queueLimit
});

let server = null;

const startServer = () => {
  // ===============================
  // RUTAS ESTÁTICAS
  // ===============================
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });

  // ===============================
  // RUTAS API
  // ===============================
  const noticiasRoutes = require('./noticiasRoutes');
  app.use('/noticias', noticiasRoutes);

  const actividadesRoutes = require('./actividadesController'); // el mismo archivo expone el router
  app.use('/actividades', actividadesRoutes);

  // ===============================
  // MANEJO DE ERRORES
  // ===============================
  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  app.use((err, req, res, next) => {
    console.error('❌ Error del servidor:', err);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: config.env === 'development' ? err.message : undefined
    });
  });

  // ===============================
  // INICIAR SERVIDOR
  // ===============================
  server = app.listen(config.port, () => {
    console.log(`\n🚀 Servidor iniciado en http://localhost:${config.port}`);
    console.log(`📋 Entorno: ${config.env}`);
    console.log(`🗄️  Base de datos: ${config.database.database}`);
    console.log(`\n📚 Endpoints disponibles:`);
    console.log(`  GET  http://localhost:${config.port}/ - Página principal`);
    console.log(`  GET  http://localhost:${config.port}/admin.html - Panel administrativo`);
    console.log(`  GET  http://localhost:${config.port}/noticias - Obtener noticias`);
    console.log(`  POST http://localhost:${config.port}/noticias - Crear noticia\n`);
  });
};

db.getConnection((err, connection) => {
  if (err) {
    console.warn('⚠️ No se pudo conectar a MySQL/TiDB:', err.message || err);
    console.warn('  Host:', config.database.host, '| Port:', config.database.port);
    console.warn('Continuando sin BD — /noticias fallará; verify-token seguirá funcionando.');
    startServer();
    return;
  }

  console.log('✅ Conectado a MySQL/TiDB:', `${config.database.host}:${config.database.port}/${config.database.database}`);
  connection.release();
  noticiasController.setDatabase(db);
  actividadesController.setDatabase(db);
  startServer();
});

// ===============================
// MANEJO DE CIERRE GRACEFUL
// ===============================
function gracefulShutdown(signal) {
  console.log(`\n⛔ ${signal} recibido, cerrando servidor...`);
  if (server) {
    server.close(() => {
      console.log('✅ Servidor cerrado');
      db.end(err => {
        if (err) console.warn('⚠️ Error al cerrar pool BD:', err.message);
        else console.log('✅ Pool BD cerrado');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
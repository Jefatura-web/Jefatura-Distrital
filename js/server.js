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
const db = mysql.createConnection({
  host: config.database.host,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database
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

db.connect(err => {
  if (err) {
    console.warn('⚠️ No se pudo conectar a MySQL:', err.message || err);
    console.warn('Continuando sin conexión a la base de datos — algunas rutas pueden no funcionar.');
    // No hacemos process.exit; arrancamos el servidor para poder probar endpoints que no dependen de la BD (por ejemplo verificación de token).
    startServer();
    return;
  }

  console.log('✅ Conectado a MySQL:', `${config.database.host}/${config.database.database}`);
  // Pasar conexión al controlador
  noticiasController.setDatabase(db);
  startServer();
});

// ===============================
// MANEJO DE CIERRE GRACEFUL
// ===============================
process.on('SIGTERM', () => {
  console.log('\n⛔ SIGTERM recibido, cerrando servidor...');
  if (server) {
    server.close(() => {
      console.log('✅ Servidor cerrado');
      db.end(() => {
        console.log('✅ Conexión a BD cerrada');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('\n⛔ SIGINT recibido, cerrando servidor...');
  if (server) {
    server.close(() => {
      console.log('✅ Servidor cerrado');
      db.end(() => {
        console.log('✅ Conexión a BD cerrada');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
});

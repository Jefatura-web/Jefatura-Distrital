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

db.connect(err => {
  if (err) {
    console.error('❌ Error de conexión MySQL:', err.message || err);
    console.error('Asegúrate de que MySQL esté instalado, que el servicio esté activo y que las credenciales en .env sean correctas.');
    process.exit(1);
  }

  console.log('✅ Conectado a MySQL:', `${config.database.host}/${config.database.database}`);

  // Pasar conexión al controlador
  noticiasController.setDatabase(db);

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
  const server = app.listen(config.port, () => {
    console.log(`\n🚀 Servidor iniciado en http://localhost:${config.port}`);
    console.log(`📋 Entorno: ${config.env}`);
    console.log(`🗄️  Base de datos: ${config.database.database}`);
    console.log(`\n📚 Endpoints disponibles:`);
    console.log(`  GET  http://localhost:${config.port}/ - Página principal`);
    console.log(`  GET  http://localhost:${config.port}/admin.html - Panel administrativo`);
    console.log(`  GET  http://localhost:${config.port}/noticias - Obtener noticias`);
    console.log(`  POST http://localhost:${config.port}/noticias - Crear noticia\n`);
  });

  // ===============================
  // MANEJO DE CIERRE GRACEFUL
  // ===============================
  process.on('SIGTERM', () => {
    console.log('\n⛔ SIGTERM recibido, cerrando servidor...');
    server.close(() => {
      console.log('✅ Servidor cerrado');
      db.end(() => {
        console.log('✅ Conexión a BD cerrada');
        process.exit(0);
      });
    });
  });

  process.on('SIGINT', () => {
    console.log('\n⛔ SIGINT recibido, cerrando servidor...');
    server.close(() => {
      console.log('✅ Servidor cerrado');
      db.end(() => {
        console.log('✅ Conexión a BD cerrada');
        process.exit(0);
      });
    });
  });
});

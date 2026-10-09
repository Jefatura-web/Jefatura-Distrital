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
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors(config.cors));
app.use(express.json({ limit: '1mb' }));
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
  const getPublicSiteUrl = req => {
    const candidate = config.siteUrl || `${req.protocol}://${req.get('host')}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo de sitio no válido');
      return url.origin;
    } catch (error) {
      console.error('[SEO] SITE_URL inválida:', error.message);
      return null;
    }
  };

  app.get('/noticia/:slug', (req, res) => {
    if (!config.siteUrl && !req.get('host')) {
      return res.status(500).send('No se pudo determinar la URL pública del sitio.');
    }
    const siteUrl = getPublicSiteUrl(req);
    if (!siteUrl) return res.status(500).send('La URL pública del sitio no es válida.');

    db.query(
      `SELECT n.id, n.titulo, n.slug, n.descripcion, n.texto, n.fecha,
              n.imagen_url AS imagen, n.updated_at, c.nombre AS categoria
       FROM noticias n
       LEFT JOIN categorias c ON n.categoria_id = c.id
       WHERE n.slug = ? AND n.deleted_at IS NULL AND n.publicada = 1
       LIMIT 1`,
      [req.params.slug],
      (err, rows) => {
        if (err) {
          console.error('[SEO] Error al cargar noticia:', err);
          return res.status(500).send('No se pudo cargar la noticia.');
        }
        if (!rows?.length) return res.status(404).send('Noticia no encontrada.');

        const noticia = rows[0];
        db.query(
          'SELECT imagen_url FROM noticias_imagenes WHERE noticia_id = ? ORDER BY orden ASC, id ASC',
          [noticia.id],
          (imageErr, imageRows) => {
            if (imageErr) {
              console.error('[SEO] Error al cargar galería:', imageErr);
              return res.status(500).send('No se pudo cargar la galería de la noticia.');
            }
            const images = (imageRows || []).map(row => row.imagen_url);
            if (!images.length && noticia.imagen) images.push(noticia.imagen);
            const canonicalUrl = `${siteUrl}/noticia/${encodeURIComponent(noticia.slug)}`;
            res.type('html').send(noticiasController.renderArticlePage(noticia, images, canonicalUrl));
          }
        );
      }
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const siteUrl = getPublicSiteUrl(req);
    if (!siteUrl) return res.status(500).type('text').send('La URL pública del sitio no es válida.');
    db.query(
      'SELECT slug FROM noticias WHERE deleted_at IS NULL AND publicada = 1 ORDER BY fecha DESC',
      (err, rows) => {
        if (err) {
          console.error('[SEO] Error al generar sitemap:', err);
          return res.status(500).type('text').send('No se pudo generar el sitemap.');
        }
        res.type('application/xml').send(noticiasController.renderSitemap(rows || [], siteUrl));
      }
    );
  });

  app.get('/robots.txt', (req, res) => {
    const siteUrl = getPublicSiteUrl(req);
    if (!siteUrl) return res.status(500).type('text').send('La URL pública del sitio no es válida.');
    res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  });

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

  const actividadesRoutes = require('./actividadesController');
  app.use('/actividades', actividadesRoutes);

  const uploadRoutes = require('./uploadController.js');
  app.use('/upload', uploadRoutes);

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
  const purgeDeletedContent = () => {
    noticiasController.purgeExpiredDeleted(err => {
      if (err) console.error('[maintenance] No se pudieron purgar noticias vencidas.');
    });
    actividadesController.purgeExpiredDeleted(err => {
      if (err) console.error('[maintenance] No se pudieron purgar actividades vencidas.');
    });
  };
  purgeDeletedContent();
  const purgeTimer = setInterval(purgeDeletedContent, 15 * 60 * 1000);
  purgeTimer.unref();
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

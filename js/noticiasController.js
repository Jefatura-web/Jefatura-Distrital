/**
 * Controlador de Noticias
 * Maneja lógica de negocio para noticias
 */

const mysql = require('mysql2');

let db = null;

function setDatabase(database) {
  db = database;
}

/**
 * Obtiene todas las noticias ordenadas por fecha descendente
 * ✅ FIX: JOIN con categorias para devolver nombre, no id
 */
function getAll(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  db.query(
    `SELECT 
      n.id,
      n.titulo,
      n.texto,
      n.fecha,
      n.imagen_url AS imagen,
      n.destacada,
      n.created_at,
      c.nombre AS categoria
    FROM noticias n
    LEFT JOIN categorias c ON n.categoria_id = c.id
    ORDER BY n.fecha DESC, n.created_at DESC`,
    (err, results) => {
      if (err) {
        console.error('[DB Error] getAll:', err);
        return res.status(500).json({ 
          error: 'Error al obtener noticias',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      res.json(results || []);
    }
  );
}

/**
 * Crea una nueva noticia
 * ✅ FIX: usa categoria_id (FK) e imagen_url (nombre correcto de columna)
 */
function create(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { titulo, texto, categoria_id, fecha, imagen_url, destacada } = req.body;

  if (!titulo || !texto || !categoria_id || !fecha) {
    return res.status(400).json({ 
      error: 'Faltan campos requeridos: titulo, texto, categoria_id, fecha' 
    });
  }

  const sanitizedData = {
    titulo: String(titulo).trim().substring(0, 255),
    texto: String(texto).trim(),
    categoria_id: parseInt(categoria_id, 10),
    fecha: String(fecha),
    imagen_url: imagen_url ? String(imagen_url).trim().substring(0, 500) : null,
    destacada: destacada ? 1 : 0
  };

  if (isNaN(sanitizedData.categoria_id)) {
    return res.status(400).json({ error: 'categoria_id debe ser un número entero' });
  }

  db.query(
    'INSERT INTO noticias (titulo, texto, categoria_id, fecha, imagen_url, destacada) VALUES (?, ?, ?, ?, ?, ?)',
    [
      sanitizedData.titulo,
      sanitizedData.texto,
      sanitizedData.categoria_id,
      sanitizedData.fecha,
      sanitizedData.imagen_url,
      sanitizedData.destacada
    ],
    (err, result) => {
      if (err) {
        console.error('[DB Error] create:', err);
        return res.status(500).json({ 
          error: 'Error al crear noticia',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      res.status(201).json({ 
        ok: true,
        id: result.insertId,
        message: 'Noticia creada exitosamente'
      });
    }
  );
}

module.exports = {
  setDatabase,
  getAll,
  create
};
/**
 * Controlador de Noticias
 * Maneja lógica de negocio para noticias
 */

const mysql = require('mysql2');

let db = null;
let categoriasCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

function setDatabase(database) {
  db = database;
}

// Middleware de autenticación básica
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = process.env.ADMIN_TOKEN || 'admin123'; // Token simple por defecto

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const providedToken = authHeader.substring(7); // Remover 'Bearer '
  if (providedToken !== token) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  next();
}

// Caché de categorías
async function getCategoriasCache() {
  const now = Date.now();
  if (!categoriasCache || (now - cacheTimestamp) > CACHE_DURATION) {
    try {
      const [rows] = await db.promise().query('SELECT id, nombre, icono, color FROM categorias ORDER BY nombre');
      categoriasCache = rows;
      cacheTimestamp = now;
    } catch (error) {
      console.error('[DB Error] getCategoriasCache:', error);
      return [];
    }
  }
  return categoriasCache;
}

function generateSlug(titulo) {
  return titulo
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validación mejorada
function validateNoticiaData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate || data.titulo !== undefined) {
    if (!data.titulo || typeof data.titulo !== 'string' || data.titulo.trim().length < 3) {
      errors.push('Título requerido (mínimo 3 caracteres)');
    }
  }

  if (!isUpdate || data.texto !== undefined) {
    if (!data.texto || typeof data.texto !== 'string' || data.texto.trim().length < 10) {
      errors.push('Texto requerido (mínimo 10 caracteres)');
    }
  }

  if (!isUpdate || data.categoria_id !== undefined) {
    if (data.categoria_id === undefined || data.categoria_id === null) {
      errors.push('Categoría requerida');
    } else {
      const catId = parseInt(data.categoria_id, 10);
      if (isNaN(catId) || catId < 1) {
        errors.push('ID de categoría inválido');
      }
    }
  }

  if (!isUpdate || data.fecha !== undefined) {
    if (!data.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) {
      errors.push('Fecha requerida en formato YYYY-MM-DD');
    } else {
      const fecha = new Date(data.fecha);
      if (isNaN(fecha.getTime())) {
        errors.push('Fecha inválida');
      }
    }
  }

  if (data.descripcion && typeof data.descripcion === 'string' && data.descripcion.length > 500) {
    errors.push('Descripción demasiado larga (máximo 500 caracteres)');
  }

  if (data.imagen_url && typeof data.imagen_url === 'string' && data.imagen_url.length > 500) {
    errors.push('URL de imagen demasiado larga (máximo 500 caracteres)');
  }

  return errors;
}

/**
 * Obtiene todas las noticias ordenadas por fecha descendente
 * ✅ FIX: JOIN con categorias para devolver nombre, no id
 * ✅ Mejora: Filtros avanzados y paginación
 */
function getAll(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const {
    fecha,
    destacada,
    categoria,
    publicada,
    search,
    page = 1,
    limit = 50
  } = req.query;

  const conditions = [];
  const params = [];

  if (fecha) {
    conditions.push('n.fecha = ?');
    params.push(String(fecha));
  }

  if (typeof destacada !== 'undefined') {
    const value = ['1', 'true', 'yes'].includes(String(destacada).toLowerCase()) ? 1 : 0;
    conditions.push('n.destacada = ?');
    params.push(value);
  }

  if (categoria) {
    conditions.push('c.nombre LIKE ?');
    params.push(`%${categoria}%`);
  }

  if (typeof publicada !== 'undefined') {
    const value = ['1', 'true', 'yes'].includes(String(publicada).toLowerCase()) ? 1 : 0;
    conditions.push('n.publicada = ?');
    params.push(value);
  }

  if (search) {
    conditions.push('MATCH(n.titulo, n.texto) AGAINST(? IN NATURAL LANGUAGE MODE)');
    params.push(search);
  }

  // Solo noticias no eliminadas (soft delete)
  conditions.push('n.deleted_at IS NULL');

  let sql = `SELECT
      n.id,
      n.titulo,
      n.slug,
      n.descripcion,
      n.texto,
      n.fecha,
      n.imagen_url AS imagen,
      n.destacada,
      n.publicada,
      n.created_at,
      n.updated_at,
      c.nombre AS categoria,
      c.icono AS categoria_icono
    FROM noticias n
    LEFT JOIN categorias c ON n.categoria_id = c.id`;

  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY n.fecha DESC, n.created_at DESC';

  // Paginación
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  sql += ` LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('[DB Error] getAll:', err);
      return res.status(500).json({
        error: 'Error al obtener noticias',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    res.json(results || []);
  });
}

function getById(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID de noticia inválido' });
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
    WHERE n.id = ?
    LIMIT 1`,
    [id],
    (err, results) => {
      if (err) {
        console.error('[DB Error] getById:', err);
        return res.status(500).json({ 
          error: 'Error al obtener la noticia',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Noticia no encontrada' });
      }
      res.json(results[0]);
    }
  );
}

function getBySlug(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { slug } = req.params;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  db.query(
    `SELECT
      n.id,
      n.titulo,
      n.slug,
      n.descripcion,
      n.texto,
      n.fecha,
      n.imagen_url AS imagen,
      n.destacada,
      n.publicada,
      n.created_at,
      n.updated_at,
      c.nombre AS categoria,
      c.icono AS categoria_icono
    FROM noticias n
    LEFT JOIN categorias c ON n.categoria_id = c.id
    WHERE n.slug = ? AND n.deleted_at IS NULL AND n.publicada = 1
    LIMIT 1`,
    [slug],
    (err, results) => {
      if (err) {
        console.error('[DB Error] getBySlug:', err);
        return res.status(500).json({
          error: 'Error al obtener la noticia',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Noticia no encontrada' });
      }
      res.json(results[0]);
    }
  );
}

/**
 * Estadísticas de noticias
 */
function getStats(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const queries = [
    // Total de noticias
    'SELECT COUNT(*) as total FROM noticias WHERE deleted_at IS NULL',

    // Noticias por mes (últimos 12 meses)
    `SELECT
      DATE_FORMAT(fecha, '%Y-%m') as mes,
      COUNT(*) as cantidad
    FROM noticias
    WHERE deleted_at IS NULL AND fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(fecha, '%Y-%m')
    ORDER BY mes DESC`,

    // Noticias por categoría
    `SELECT
      c.nombre as categoria,
      c.icono,
      COUNT(n.id) as cantidad
    FROM categorias c
    LEFT JOIN noticias n ON c.id = n.categoria_id AND n.deleted_at IS NULL
    GROUP BY c.id, c.nombre, c.icono
    ORDER BY cantidad DESC`,

    // Estado de publicación
    `SELECT
      CASE
        WHEN publicada = 1 THEN 'publicadas'
        WHEN publicada = 0 THEN 'borradores'
        ELSE 'eliminadas'
      END as estado,
      COUNT(*) as cantidad
    FROM noticias
    WHERE deleted_at IS NULL
    GROUP BY publicada`
  ];

  Promise.all(queries.map(query => {
    return new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }))
  .then(([total, porMes, porCategoria, porEstado]) => {
    res.json({
      total: total[0].total,
      por_mes: porMes,
      por_categoria: porCategoria,
      por_estado: porEstado
    });
  })
  .catch(err => {
    console.error('[DB Error] getStats:', err);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}

/**
 * Crea una nueva noticia
 * ✅ Genera slug automáticamente, valida campos, devuelve noticia creada
 */
function create(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { titulo, descripcion, texto, categoria_id, fecha, imagen_url, destacada, publicada } = req.body;

  if (!titulo || !texto || !categoria_id || !fecha) {
    return res.status(400).json({ 
      error: 'Faltan campos requeridos: titulo, texto, categoria_id, fecha' 
    });
  }

  const slug = generateSlug(titulo);
  const sanitizedData = {
    titulo: String(titulo).trim().substring(0, 255),
    slug: slug.substring(0, 300),
    descripcion: descripcion ? String(descripcion).trim().substring(0, 500) : null,
    texto: String(texto).trim(),
    categoria_id: parseInt(categoria_id, 10),
    fecha: String(fecha),
    imagen_url: imagen_url ? String(imagen_url).trim().substring(0, 500) : null,
    destacada: destacada ? 1 : 0,
    publicada: publicada !== false ? 1 : 0
  };

  if (isNaN(sanitizedData.categoria_id)) {
    return res.status(400).json({ error: 'categoria_id debe ser un número entero' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sanitizedData.fecha)) {
    return res.status(400).json({ error: 'fecha debe estar en formato YYYY-MM-DD' });
  }

  db.query(
    `INSERT INTO noticias (titulo, slug, descripcion, texto, categoria_id, fecha, imagen_url, destacada, publicada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sanitizedData.titulo,
      sanitizedData.slug,
      sanitizedData.descripcion,
      sanitizedData.texto,
      sanitizedData.categoria_id,
      sanitizedData.fecha,
      sanitizedData.imagen_url,
      sanitizedData.destacada,
      sanitizedData.publicada
    ],
    (err, result) => {
      if (err) {
        console.error('[DB Error] create:', err);
        return res.status(500).json({ 
          error: 'Error al crear noticia',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }

      // Devolver la noticia creada con los datos completos
      db.query(
        `SELECT 
          n.id,
          n.titulo,
          n.slug,
          n.descripcion,
          n.texto,
          n.fecha,
          n.imagen_url AS imagen,
          n.destacada,
          n.publicada,
          n.created_at,
          c.nombre AS categoria
        FROM noticias n
        LEFT JOIN categorias c ON n.categoria_id = c.id
        WHERE n.id = ?
        LIMIT 1`,
        [result.insertId],
        (err, rows) => {
          if (err) {
            return res.status(201).json({ 
              ok: true,
              id: result.insertId,
              message: 'Noticia creada exitosamente'
            });
          }
          res.status(201).json({ 
            ok: true,
            data: rows[0],
            message: 'Noticia creada exitosamente'
          });
        }
      );
    }
  );
}

/**
 * Actualiza una noticia existente
 */
function update(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { id } = req.params;
  const noticiaId = parseInt(id, 10);
  if (isNaN(noticiaId)) {
    return res.status(400).json({ error: 'ID de noticia inválido' });
  }

  // Validación mejorada
  const validationErrors = validateNoticiaData(req.body, true);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: validationErrors
    });
  }

  const { titulo, descripcion, texto, categoria_id, fecha, imagen_url, destacada, publicada } = req.body;

  // Construir query dinámico
  const updates = [];
  const params = [];

  if (titulo !== undefined) {
    updates.push('titulo = ?');
    params.push(String(titulo).trim().substring(0, 255));
    // Regenerar slug si cambió el título
    updates.push('slug = ?');
    params.push(generateSlug(titulo).substring(0, 300));
  }

  if (descripcion !== undefined) {
    updates.push('descripcion = ?');
    params.push(descripcion ? String(descripcion).trim().substring(0, 500) : null);
  }

  if (texto !== undefined) {
    updates.push('texto = ?');
    params.push(String(texto).trim());
  }

  if (categoria_id !== undefined) {
    updates.push('categoria_id = ?');
    params.push(parseInt(categoria_id, 10));
  }

  if (fecha !== undefined) {
    updates.push('fecha = ?');
    params.push(String(fecha));
  }

  if (imagen_url !== undefined) {
    updates.push('imagen_url = ?');
    params.push(imagen_url ? String(imagen_url).trim().substring(0, 500) : null);
  }

  if (destacada !== undefined) {
    updates.push('destacada = ?');
    params.push(destacada ? 1 : 0);
  }

  if (publicada !== undefined) {
    updates.push('publicada = ?');
    params.push(publicada ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `UPDATE noticias SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`;

  db.query(sql, [...params, noticiaId], (err, result) => {
    if (err) {
      console.error('[DB Error] update:', err);
      return res.status(500).json({
        error: 'Error al actualizar noticia',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada o ya eliminada' });
    }

    // Devolver noticia actualizada
    db.query(
      `SELECT
        n.id,
        n.titulo,
        n.slug,
        n.descripcion,
        n.texto,
        n.fecha,
        n.imagen_url AS imagen,
        n.destacada,
        n.publicada,
        n.created_at,
        n.updated_at,
        c.nombre AS categoria,
        c.icono AS categoria_icono
      FROM noticias n
      LEFT JOIN categorias c ON n.categoria_id = c.id
      WHERE n.id = ? AND n.deleted_at IS NULL
      LIMIT 1`,
      [noticiaId],
      (err, rows) => {
        if (err) {
          return res.status(200).json({ ok: true, message: 'Noticia actualizada exitosamente' });
        }
        res.json({
          ok: true,
          data: rows[0],
          message: 'Noticia actualizada exitosamente'
        });
      }
    );
  });
}

/**
 * Soft delete de una noticia
 */
function remove(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { id } = req.params;
  const noticiaId = parseInt(id, 10);
  if (isNaN(noticiaId)) {
    return res.status(400).json({ error: 'ID de noticia inválido' });
  }

  db.query(
    'UPDATE noticias SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
    [noticiaId],
    (err, result) => {
      if (err) {
        console.error('[DB Error] remove:', err);
        return res.status(500).json({
          error: 'Error al eliminar noticia',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Noticia no encontrada o ya eliminada' });
      }

      res.json({
        ok: true,
        message: 'Noticia eliminada exitosamente'
      });
    }
  );
}

module.exports = {
  setDatabase,
  getAll,
  getById,
  getBySlug,
  getStats,
  create,
  update,
  remove
};
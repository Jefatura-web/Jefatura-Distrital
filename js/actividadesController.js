/**
 * Actividades de Inspectores — controller + rutas en un solo archivo.
 * Nivel / grado / mes, con galería de imágenes (tabla actividades_imagenes).
 * Reusa requireAuth de noticiasController.js (mismo token, misma lógica).
 */

const express = require('express');
const { requireAuth } = require('./noticiasController');

let db = null;

const NIVELES_VALIDOS = [
  'inicial', 'primaria', 'secundaria', 'tecnica', 'agraria',
  'superior', 'especial', 'pcyps', 'dejayam', 'ed-fisica', 'ed-artistica'
];
const MAX_PAGE_SIZE = 100;

function setDatabase(database) {
  db = database;
}

function isValidNivel(nivel) {
  return NIVELES_VALIDOS.includes(String(nivel || '').toLowerCase().trim());
}

function isValidMes(mes) {
  // Se acepta YYYY-MM o YYYY-MM-DD. Además del formato, se verifica que la
  // fecha exista realmente (por ejemplo, se rechaza 2026-99 o 2026-02-31).
  const match = String(mes || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getPagination(query) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 100000)
    : 1;
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_PAGE_SIZE)
    : 50;

  return { page, limit, offset: (page - 1) * limit };
}

function normalizeMesToFirstDay(mes) {
  const str = String(mes || '');
  const match = str.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function validateActividadData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate || data.nivel !== undefined) {
    if (!isValidNivel(data.nivel)) {
      errors.push(`nivel inválido. Valores permitidos: ${NIVELES_VALIDOS.join(', ')}`);
    }
  }

  if (!isUpdate || data.grado !== undefined) {
    if (!data.grado || typeof data.grado !== 'string' || data.grado.trim().length < 1) {
      errors.push('grado requerido');
    }
  }

  if (data.escuela !== undefined && (typeof data.escuela !== 'string' || data.escuela.length > 255)) {
    errors.push('escuela debe ser texto de hasta 255 caracteres');
  }

  if (!isUpdate || data.mes !== undefined) {
    if (!isValidMes(data.mes)) {
      errors.push('mes requerido en formato YYYY-MM o YYYY-MM-DD');
    }
  }

  if (!isUpdate || data.titulo !== undefined) {
    if (!data.titulo || typeof data.titulo !== 'string' || data.titulo.trim().length < 3) {
      errors.push('título requerido (mínimo 3 caracteres)');
    }
  }

  if (data.imagenes !== undefined && !Array.isArray(data.imagenes)) {
    errors.push('imagenes debe ser un array de URLs');
  }

  return errors;
}

/**
 * Adjunta la galería de imágenes a una lista de actividades ya obtenida.
 * Hace una única query con WHERE actividad_id IN (...) para no golpear la BD N veces.
 */
function attachImagenes(actividades, callback) {
  if (!actividades || actividades.length === 0) return callback(null, actividades);

  const ids = actividades.map(a => a.id);
  db.query(
    'SELECT actividad_id, imagen_url, orden FROM actividades_imagenes WHERE actividad_id IN (?) ORDER BY actividad_id, orden ASC, id ASC',
    [ids],
    (err, rows) => {
      if (err) return callback(err);

      const porActividad = {};
      (rows || []).forEach(row => {
        if (!porActividad[row.actividad_id]) porActividad[row.actividad_id] = [];
        porActividad[row.actividad_id].push(row.imagen_url);
      });

      const conImagenes = actividades.map(a => ({
        ...a,
        imagenes: porActividad[a.id] || []
      }));

      callback(null, conImagenes);
    }
  );
}

/**
 * Listado público de actividades, filtrable por nivel (requerido) y mes (opcional, YYYY-MM).
 */
function getAll(req, res, { paginated = false } = {}) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { nivel, mes, grado, anio, inspector, search } = req.query;

  if (nivel && !isValidNivel(nivel)) {
    return res.status(400).json({ error: `Parámetro 'nivel' inválido. Valores permitidos: ${NIVELES_VALIDOS.join(', ')}` });
  }

  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (nivel) {
    conditions.push('nivel = ?');
    params.push(String(nivel).toLowerCase().trim());
  }

  if (anio !== undefined) {
    if (!/^\d{4}$/.test(String(anio)) || Number(anio) < 1900 || Number(anio) > 9999) {
      return res.status(400).json({ error: "Parámetro 'anio' inválido. Formato esperado: YYYY" });
    }
    conditions.push('YEAR(mes) = ?');
    params.push(Number(anio));
  }

  if (mes) {
    if (!isValidMes(mes)) {
      return res.status(400).json({ error: "Parámetro 'mes' inválido. Formato esperado: YYYY-MM" });
    }
    conditions.push('DATE_FORMAT(mes, "%Y-%m") = DATE_FORMAT(?, "%Y-%m")');
    params.push(normalizeMesToFirstDay(mes));
  }

  if (grado) {
    conditions.push('grado = ?');
    params.push(String(grado));
  }

  if (inspector) {
    conditions.push('inspector_nombre = ?');
    params.push(String(inspector).trim().substring(0, 150));
  }

  if (search) {
    conditions.push('(titulo LIKE ? OR descripcion LIKE ? OR inspector_nombre LIKE ? OR grado LIKE ? OR escuela LIKE ?)');
    const searchTerm = `%${String(search).trim().substring(0, 200)}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const whereSql = conditions.join(' AND ');
  const pagination = paginated ? getPagination(req.query) : null;
  const sql = `SELECT id, nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, created_at, updated_at
               FROM actividades_inspectores
               WHERE ${whereSql}
               ORDER BY mes DESC, grado ASC, id DESC${
                 pagination ? ` LIMIT ${pagination.limit} OFFSET ${pagination.offset}` : ''
               }`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('[DB Error] actividades.getAll:', err);
      return res.status(500).json({
        error: 'Error al obtener actividades',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }

    const respondWithActivities = (rows, total) => attachImagenes(rows || [], (imgErr, conImagenes) => {
      if (imgErr) {
        console.error('[DB Error] actividades.getAll.attachImagenes:', imgErr);
        return res.status(500).json({ error: 'Error al obtener imágenes de actividades' });
      }
      if (!pagination) return res.json(conImagenes);
      const totalPages = Math.ceil(total / pagination.limit);
      res.json({
        data: conImagenes,
        pagination: {
          page: Math.min(pagination.page, Math.max(totalPages, 1)),
          limit: pagination.limit,
          total,
          totalPages,
          hasNext: pagination.page < totalPages
        }
      });
    });

    if (!pagination) return respondWithActivities(results, 0);
    db.query(
      `SELECT COUNT(*) AS total FROM actividades_inspectores WHERE ${whereSql}`,
      params,
      (countErr, countRows) => {
        if (countErr) {
          console.error('[DB Error] actividades.getAll.count:', countErr);
          return res.status(500).json({ error: 'Error al contar actividades' });
        }
        const total = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.ceil(total / pagination.limit);
        const effectivePage = Math.min(pagination.page, Math.max(totalPages, 1));
        if (effectivePage === pagination.page) return respondWithActivities(results, total);

        const correctedSql = sql.replace(
          /LIMIT \d+ OFFSET \d+$/,
          `LIMIT ${pagination.limit} OFFSET ${(effectivePage - 1) * pagination.limit}`
        );
        db.query(correctedSql, params, (pageErr, pageResults) => {
          if (pageErr) {
            console.error('[DB Error] actividades.getAll.correctedPage:', pageErr);
            return res.status(500).json({ error: 'Error al cargar la página de actividades' });
          }
          respondWithActivities(pageResults || [], total);
        });
      }
    );
  });
}

function getFilterOptions(req, res) {
  if (!db) return res.status(500).json({ error: 'Conexión a BD no disponible' });
  const { nivel } = req.query;
  if (nivel && !isValidNivel(nivel)) {
    return res.status(400).json({ error: `nivel inválido. Valores permitidos: ${NIVELES_VALIDOS.join(', ')}` });
  }

  const anio = req.query.anio;
  if (anio !== undefined && (!/^\d{4}$/.test(String(anio)) || Number(anio) < 1900)) {
    return res.status(400).json({ error: "Parámetro 'anio' inválido. Formato esperado: YYYY" });
  }
  const levelCondition = nivel ? 'AND nivel = ?' : '';
  const levelParams = nivel ? [String(nivel).toLowerCase().trim()] : [];
  db.query(
    `SELECT DISTINCT YEAR(mes) AS anio, inspector_nombre
     FROM actividades_inspectores
     WHERE deleted_at IS NULL ${levelCondition}
     ORDER BY anio DESC, inspector_nombre ASC`,
    levelParams,
    (err, rows) => {
      if (err) {
        console.error('[DB Error] actividades.getFilterOptions:', err);
        return res.status(500).json({ error: 'No se pudieron cargar las opciones de filtro' });
      }
      const monthParams = [...levelParams];
      let yearCondition = '';
      if (anio !== undefined) {
        yearCondition = 'AND YEAR(mes) = ?';
        monthParams.push(Number(anio));
      }
      db.query(
        `SELECT DATE_FORMAT(mes, '%Y-%m') AS mes, COUNT(*) AS total
         FROM actividades_inspectores
         WHERE deleted_at IS NULL ${levelCondition} ${yearCondition}
         GROUP BY mes
         ORDER BY mes DESC`,
        monthParams,
        (monthErr, monthRows) => {
          if (monthErr) {
            console.error('[DB Error] actividades.getFilterOptions.months:', monthErr);
            return res.status(500).json({ error: 'No se pudieron cargar los meses disponibles' });
          }
          res.json({
            years: [...new Set((rows || []).map(row => String(row.anio)))],
            inspectors: [...new Set((rows || []).map(row => String(row.inspector_nombre || '').trim()).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, 'es')),
            months: (monthRows || []).map(row => ({ month: row.mes, total: Number(row.total) }))
          });
        }
      );
    }
  );
}

function getRecent(req, res) {
  if (!db) return res.status(500).json({ error: 'Conexión a BD no disponible' });
  db.query(
    `SELECT id, nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, created_at
     FROM actividades_inspectores
     WHERE deleted_at IS NULL
     ORDER BY mes DESC, created_at DESC, id DESC
     LIMIT 6`,
    (err, rows) => {
      if (err) {
        console.error('[DB Error] actividades.getRecent:', err);
        return res.status(500).json({ error: 'No se pudieron cargar las actividades recientes' });
      }
      attachImagenes(rows || [], (imageErr, activities) => {
        if (imageErr) {
          console.error('[DB Error] actividades.getRecent.attachImagenes:', imageErr);
          return res.status(500).json({ error: 'No se pudieron cargar las fotos de actividades recientes' });
        }
        res.json(activities || []);
      });
    }
  );
}

function getById(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID de actividad inválido' });
  }

  db.query(
    `SELECT id, nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, created_at, updated_at
     FROM actividades_inspectores WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id],
    (err, results) => {
      if (err) {
        console.error('[DB Error] actividades.getById:', err);
        return res.status(500).json({ error: 'Error al obtener la actividad' });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'Actividad no encontrada' });
      }
      attachImagenes(results, (imgErr, conImagenes) => {
        if (imgErr) {
          console.error('[DB Error] actividades.getById.attachImagenes:', imgErr);
          return res.status(500).json({ error: 'Error al obtener imágenes de la actividad' });
        }
        res.json(conImagenes[0]);
      });
    }
  );
}

/**
 * Listado admin: no filtra por nivel obligatoriamente, para ver todo desde el panel.
 */
function getAllAdmin(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const { nivel, mes, search, page = 1, limit = 50 } = req.query;
  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (nivel) {
    if (!isValidNivel(nivel)) {
      return res.status(400).json({ error: `nivel inválido. Valores permitidos: ${NIVELES_VALIDOS.join(', ')}` });
    }
    conditions.push('nivel = ?');
    params.push(String(nivel).toLowerCase().trim());
  }

  if (mes) {
    if (!isValidMes(mes) || !/^\d{4}-\d{2}$/.test(String(mes))) {
      return res.status(400).json({ error: "Parámetro 'mes' inválido. Formato esperado: YYYY-MM" });
    }
    conditions.push('DATE_FORMAT(mes, "%Y-%m") = ?');
    params.push(String(mes));
  }

  if (search) {
    conditions.push('(titulo LIKE ? OR descripcion LIKE ? OR inspector_nombre LIKE ? OR grado LIKE ? OR escuela LIKE ? OR nivel LIKE ?)');
    const searchTerm = `%${String(search).trim().substring(0, 200)}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const pagination = getPagination({ page, limit });
  const sql = `SELECT id, nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, created_at, updated_at
               FROM actividades_inspectores
               WHERE ${conditions.join(' AND ')}
               ORDER BY created_at DESC
               LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('[DB Error] actividades.getAllAdmin:', err);
      return res.status(500).json({ error: 'Error al obtener actividades' });
    }

    attachImagenes(results || [], (imgErr, conImagenes) => {
      if (imgErr) {
        console.error('[DB Error] actividades.getAllAdmin.attachImagenes:', imgErr);
        return res.status(500).json({ error: 'Error al obtener imágenes de actividades' });
      }
      res.json(conImagenes);
    });
  });
}

function getDeletedAdmin(req, res) {
  if (!db) return res.status(500).json({ error: 'Conexión a BD no disponible' });
  const pagination = getPagination(req.query);
  db.query(
    `SELECT id, nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, deleted_at, created_at, updated_at
     FROM actividades_inspectores
     WHERE deleted_at IS NOT NULL
       AND deleted_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 48 HOUR)
     ORDER BY deleted_at DESC
     LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    (err, results) => {
      if (err) {
        console.error('[DB Error] actividades.getDeletedAdmin:', err);
        return res.status(500).json({ error: 'Error al obtener actividades eliminadas' });
      }
      attachImagenes(results || [], (imgErr, activities) => {
        if (imgErr) {
          console.error('[DB Error] actividades.getDeletedAdmin.attachImagenes:', imgErr);
          return res.status(500).json({ error: 'Error al obtener fotos de actividades eliminadas' });
        }
        res.json(activities);
      });
    }
  );
}

function restore(req, res) {
  if (!db) return res.status(500).json({ error: 'Conexión a BD no disponible' });
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'ID de actividad inválido' });
  }
  db.query(
    `UPDATE actividades_inspectores SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NOT NULL
       AND deleted_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 48 HOUR)`,
    [id],
    (err, result) => {
      if (err) {
        console.error('[DB Error] actividades.restore:', err);
        return res.status(500).json({ error: 'Error al restaurar la actividad' });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ error: 'La actividad no está en la papelera o ya venció el plazo de recuperación' });
      }
      res.json({ ok: true, message: 'Actividad restaurada' });
    }
  );
}

function purgeExpiredDeleted(callback = () => {}) {
  if (!db) return callback(new Error('Conexión a BD no disponible'));
  db.query(
    'DELETE FROM actividades_inspectores WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 48 HOUR)',
    err => {
      if (err) console.error('[DB Error] actividades.purgeExpiredDeleted:', err);
      callback(err || null);
    }
  );
}

/**
 * Crea una actividad + sus imágenes de galería.
 */
function create(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const errors = validateActividadData(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors });
  }

  const { nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, imagenes } = req.body;

  const sanitizedData = {
    nivel: String(nivel).toLowerCase().trim(),
    grado: String(grado).trim().substring(0, 150),
    escuela: escuela ? String(escuela).trim().substring(0, 255) : null,
    mes: normalizeMesToFirstDay(mes),
    titulo: String(titulo).trim().substring(0, 255),
    descripcion: descripcion ? String(descripcion).trim() : null,
    inspector_nombre: inspector_nombre ? String(inspector_nombre).trim().substring(0, 150) : null
  };

  const imagenesLimpias = Array.isArray(imagenes)
    ? imagenes.map(u => String(u || '').trim()).filter(u => u.length > 0).slice(0, 30)
    : [];

  db.query(
    `INSERT INTO actividades_inspectores (nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sanitizedData.nivel, sanitizedData.grado, sanitizedData.escuela, sanitizedData.mes, sanitizedData.titulo, sanitizedData.descripcion, sanitizedData.inspector_nombre],
    (err, result) => {
      if (err) {
        console.error('[DB Error] actividades.create:', err);
        return res.status(500).json({
          error: 'Error al crear la actividad',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }

      const actividadId = result.insertId;

      if (imagenesLimpias.length === 0) {
        return res.status(201).json({ ok: true, id: actividadId, message: 'Actividad creada exitosamente' });
      }

      const values = imagenesLimpias.map((url, idx) => [actividadId, url.substring(0, 500), idx]);
      db.query(
        'INSERT INTO actividades_imagenes (actividad_id, imagen_url, orden) VALUES ?',
        [values],
        (imgErr) => {
          if (imgErr) {
            console.error('[DB Error] actividades.create.imagenes:', imgErr);
            // La actividad ya se creó; devolvemos éxito parcial en vez de dejar todo en un estado ambiguo.
            return res.status(201).json({
              ok: true,
              id: actividadId,
              message: 'Actividad creada, pero hubo un error al guardar las imágenes',
              warning: true
            });
          }
          res.status(201).json({ ok: true, id: actividadId, message: 'Actividad creada exitosamente' });
        }
      );
    }
  );
}

/**
 * Actualiza una actividad. Si se envía 'imagenes', reemplaza la galería completa
 * (borra las anteriores e inserta las nuevas) para mantener el orden simple y predecible.
 */
function update(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID de actividad inválido' });
  }

  const errors = validateActividadData(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors });
  }

  const { nivel, grado, escuela, mes, titulo, descripcion, inspector_nombre, imagenes } = req.body;
  const updates = [];
  const params = [];

  if (nivel !== undefined) { updates.push('nivel = ?'); params.push(String(nivel).toLowerCase().trim()); }
  if (grado !== undefined) { updates.push('grado = ?'); params.push(String(grado).trim().substring(0, 150)); }
  if (escuela !== undefined) { updates.push('escuela = ?'); params.push(escuela ? String(escuela).trim().substring(0, 255) : null); }
  if (mes !== undefined) { updates.push('mes = ?'); params.push(normalizeMesToFirstDay(mes)); }
  if (titulo !== undefined) { updates.push('titulo = ?'); params.push(String(titulo).trim().substring(0, 255)); }
  if (descripcion !== undefined) { updates.push('descripcion = ?'); params.push(descripcion ? String(descripcion).trim() : null); }
  if (inspector_nombre !== undefined) { updates.push('inspector_nombre = ?'); params.push(inspector_nombre ? String(inspector_nombre).trim().substring(0, 150) : null); }

  if (updates.length === 0 && imagenes === undefined) {
    return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
  }

  const runUpdateImagenes = (cb) => {
    if (imagenes === undefined) return cb(null);

    const imagenesLimpias = Array.isArray(imagenes)
      ? imagenes.map(u => String(u || '').trim()).filter(u => u.length > 0).slice(0, 30)
      : [];

    db.query('DELETE FROM actividades_imagenes WHERE actividad_id = ?', [id], (delErr) => {
      if (delErr) return cb(delErr);
      if (imagenesLimpias.length === 0) return cb(null);

      const values = imagenesLimpias.map((url, idx) => [id, url.substring(0, 500), idx]);
      db.query('INSERT INTO actividades_imagenes (actividad_id, imagen_url, orden) VALUES ?', [values], cb);
    });
  };

  const applyFieldUpdates = (cb) => {
    if (updates.length === 0) return cb(null, { affectedRows: 1 }); // nada que actualizar en la tabla principal, solo imágenes

    updates.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE actividades_inspectores SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`;
    db.query(sql, [...params, id], cb);
  };

  applyFieldUpdates((err, result) => {
    if (err) {
      console.error('[DB Error] actividades.update:', err);
      return res.status(500).json({ error: 'Error al actualizar la actividad' });
    }
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada o ya eliminada' });
    }

    runUpdateImagenes((imgErr) => {
      if (imgErr) {
        console.error('[DB Error] actividades.update.imagenes:', imgErr);
        return res.status(200).json({ ok: true, message: 'Actividad actualizada, pero hubo un error al guardar las imágenes', warning: true });
      }
      res.json({ ok: true, message: 'Actividad actualizada exitosamente' });
    });
  });
}

/**
 * Soft delete de una actividad (las imágenes quedan en la tabla; solo se ocultan
 * al filtrar por deleted_at IS NULL en la actividad padre).
 */
function remove(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Conexión a BD no disponible' });
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID de actividad inválido' });
  }

  db.query(
    'UPDATE actividades_inspectores SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
    [id],
    (err, result) => {
      if (err) {
        console.error('[DB Error] actividades.remove:', err);
        return res.status(500).json({ error: 'Error al eliminar la actividad' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Actividad no encontrada o ya eliminada' });
      }
      res.json({ ok: true, message: 'Actividad eliminada exitosamente' });
    }
  );
}

// ── Rutas (antes vivían en actividadesRoutes.js, ahora acá para no duplicar archivos) ──
const router = express.Router();

router.get('/recientes', getRecent);
router.get('/filtros', getFilterOptions);
router.get('/pagina', (req, res) => getAll(req, res, { paginated: true }));
router.get('/', getAll);                                    // ?nivel=inicial&anio=2026&mes=2026-04
router.get('/admin/deleted', requireAuth, getDeletedAdmin);
router.get('/admin/list', requireAuth, getAllAdmin);         // /admin/list, no /admin (ver nota sobre shadowing en noticiasRoutes.js)
router.post('/admin/:id/restore', requireAuth, restore);
router.post('/', requireAuth, create);
router.put('/:id', requireAuth, update);
router.delete('/:id', requireAuth, remove);
// La ruta dinámica debe ir después de /admin/list para evitar que "admin" se
// trate como un ID de actividad.
router.get('/:id', getById);

module.exports = router;
module.exports.setDatabase = setDatabase;
module.exports.NIVELES_VALIDOS = NIVELES_VALIDOS;
module.exports.purgeExpiredDeleted = purgeExpiredDeleted;

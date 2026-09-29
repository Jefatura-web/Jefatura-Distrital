/**
 * Actividades de Inspectores — controller + rutas en un solo archivo.
 * requireAuth definido localmente (sin importar de noticiasController).
 */

const express = require('express');
const crypto  = require('crypto');

let db = null;

const NIVELES_VALIDOS = [
  'inicial','primaria','secundaria','tecnica','agraria',
  'superior','especial','pcyps','dejayam','ed-fisica','ed-artistica'
];

function setDatabase(database) { db = database; }

// ── Auth local ────────────────────────────────────────────────────────────────
function timingSafeEqual(a, b) {
  const sa = Buffer.from(String(a || ''));
  const sb = Buffer.from(String(b || ''));
  if (sa.length !== sb.length) return false;
  return crypto.timingSafeEqual(sa, sb);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = String(header.startsWith('Bearer ') ? header.substring(7) : '')
    .replace(/^Bearer\s+/i, '').trim();

  if (!token) return res.status(401).json({ error: 'Token requerido' });
  if (!process.env.ADMIN_TOKEN) {
    console.error('[requireAuth] ADMIN_TOKEN no configurado');
    return res.status(500).json({ error: 'Auth no configurada en el servidor' });
  }
  if (!timingSafeEqual(token, process.env.ADMIN_TOKEN))
    return res.status(403).json({ error: 'Token inválido' });
  next();
}

// ── Validación ────────────────────────────────────────────────────────────────
function isValidNivel(n) { return NIVELES_VALIDOS.includes(String(n || '').toLowerCase().trim()); }
function isValidMes(m)   { return /^\d{4}-\d{2}(-\d{2})?$/.test(String(m || '')); }
function normalizeMes(m) {
  const match = String(m || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

// ── Adjuntar imágenes en lote ─────────────────────────────────────────────────
function attachImagenes(actividades, cb) {
  if (!actividades || actividades.length === 0) return cb(null, actividades);
  const ids = actividades.map(a => a.id);
  db.query(
    'SELECT actividad_id, imagen_url, orden FROM actividades_imagenes WHERE actividad_id IN (?) ORDER BY actividad_id, orden, id',
    [ids],
    (err, rows) => {
      if (err) return cb(err);
      const map = {};
      (rows || []).forEach(r => {
        if (!map[r.actividad_id]) map[r.actividad_id] = [];
        map[r.actividad_id].push(r.imagen_url);
      });
      cb(null, actividades.map(a => ({ ...a, imagenes: map[a.id] || [] })));
    }
  );
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function getAll(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });

  const { nivel, mes, grado } = req.query;
  if (!nivel || !isValidNivel(nivel))
    return res.status(400).json({ error: `nivel requerido. Válidos: ${NIVELES_VALIDOS.join(', ')}` });

  const cond   = ['nivel = ?', 'deleted_at IS NULL'];
  const params = [String(nivel).toLowerCase().trim()];

  if (mes) {
    if (!isValidMes(mes)) return res.status(400).json({ error: 'mes inválido (YYYY-MM)' });
    cond.push('DATE_FORMAT(mes,"%Y-%m") = DATE_FORMAT(?,"%Y-%m")');
    params.push(normalizeMes(mes));
  }
  if (grado) { cond.push('grado = ?'); params.push(String(grado)); }

  db.query(
    `SELECT id,nivel,grado,mes,titulo,descripcion,inspector_nombre,created_at,updated_at
     FROM actividades_inspectores WHERE ${cond.join(' AND ')} ORDER BY mes DESC, grado ASC, id DESC`,
    params,
    (err, rows) => {
      if (err) { console.error('[actividades.getAll]', err); return res.status(500).json({ error: 'Error al obtener actividades' }); }
      attachImagenes(rows || [], (e, data) => {
        if (e) return res.status(500).json({ error: 'Error al obtener imágenes' });
        res.json(data);
      });
    }
  );
}

function getById(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  db.query(
    'SELECT id,nivel,grado,mes,titulo,descripcion,inspector_nombre,created_at,updated_at FROM actividades_inspectores WHERE id=? AND deleted_at IS NULL LIMIT 1',
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener actividad' });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
      attachImagenes(rows, (e, data) => {
        if (e) return res.status(500).json({ error: 'Error al obtener imágenes' });
        res.json(data[0]);
      });
    }
  );
}

function getAllAdmin(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });
  const { nivel, page = 1, limit = 50 } = req.query;
  const cond = ['deleted_at IS NULL'], params = [];

  if (nivel) {
    if (!isValidNivel(nivel)) return res.status(400).json({ error: 'nivel inválido' });
    cond.push('nivel = ?'); params.push(String(nivel).toLowerCase().trim());
  }

  const offset = (Math.max(parseInt(page, 10), 1) - 1) * parseInt(limit, 10);
  db.query(
    `SELECT id,nivel,grado,mes,titulo,descripcion,inspector_nombre,created_at,updated_at
     FROM actividades_inspectores WHERE ${cond.join(' AND ')} ORDER BY created_at DESC LIMIT ${parseInt(limit,10)} OFFSET ${offset}`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener actividades' });
      attachImagenes(rows || [], (e, data) => {
        if (e) return res.status(500).json({ error: 'Error al obtener imágenes' });
        res.json(data);
      });
    }
  );
}

function create(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });
  const { nivel, grado, mes, titulo, descripcion, inspector_nombre, imagenes } = req.body;

  if (!isValidNivel(nivel)) return res.status(400).json({ error: 'nivel inválido' });
  if (!grado || !mes || !titulo) return res.status(400).json({ error: 'grado, mes y título son requeridos' });
  if (!isValidMes(mes)) return res.status(400).json({ error: 'mes inválido (YYYY-MM)' });

  const imgs = Array.isArray(imagenes) ? imagenes.map(u => String(u).trim()).filter(u => u).slice(0, 30) : [];

  db.query(
    'INSERT INTO actividades_inspectores (nivel,grado,mes,titulo,descripcion,inspector_nombre) VALUES (?,?,?,?,?,?)',
    [String(nivel).toLowerCase().trim(), String(grado).trim().substring(0,150),
     normalizeMes(mes), String(titulo).trim().substring(0,255),
     descripcion ? String(descripcion).trim() : null,
     inspector_nombre ? String(inspector_nombre).trim().substring(0,150) : null],
    (err, result) => {
      if (err) { console.error('[actividades.create]', err); return res.status(500).json({ error: 'Error al crear' }); }
      const actId = result.insertId;
      if (imgs.length === 0) return res.status(201).json({ ok: true, id: actId });

      db.query(
        'INSERT INTO actividades_imagenes (actividad_id, imagen_url, orden) VALUES ?',
        [imgs.map((u, i) => [actId, u.substring(0,500), i])],
        imgErr => {
          if (imgErr) console.error('[actividades.create.imgs]', imgErr);
          res.status(201).json({ ok: true, id: actId, warning: !!imgErr });
        }
      );
    }
  );
}

function update(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const { nivel, grado, mes, titulo, descripcion, inspector_nombre, imagenes } = req.body;
  const sets = [], params = [];

  if (nivel !== undefined) {
    if (!isValidNivel(nivel)) return res.status(400).json({ error: 'nivel inválido' });
    sets.push('nivel=?'); params.push(String(nivel).toLowerCase().trim());
  }
  if (grado !== undefined)            { sets.push('grado=?'); params.push(String(grado).trim().substring(0,150)); }
  if (mes !== undefined) {
    if (!isValidMes(mes)) return res.status(400).json({ error: 'mes inválido' });
    sets.push('mes=?'); params.push(normalizeMes(mes));
  }
  if (titulo !== undefined)           { sets.push('titulo=?'); params.push(String(titulo).trim().substring(0,255)); }
  if (descripcion !== undefined)      { sets.push('descripcion=?'); params.push(descripcion ? String(descripcion).trim() : null); }
  if (inspector_nombre !== undefined) { sets.push('inspector_nombre=?'); params.push(inspector_nombre ? String(inspector_nombre).trim().substring(0,150) : null); }

  const updateImgs = (cb) => {
    if (imagenes === undefined) return cb(null);
    const imgs = Array.isArray(imagenes) ? imagenes.map(u => String(u).trim()).filter(u => u).slice(0,30) : [];
    db.query('DELETE FROM actividades_imagenes WHERE actividad_id=?', [id], delErr => {
      if (delErr) return cb(delErr);
      if (imgs.length === 0) return cb(null);
      db.query('INSERT INTO actividades_imagenes (actividad_id,imagen_url,orden) VALUES ?',
        [imgs.map((u,i) => [id, u.substring(0,500), i])], cb);
    });
  };

  const doUpdate = (cb) => {
    if (sets.length === 0) return cb(null, { affectedRows: 1 });
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.query(`UPDATE actividades_inspectores SET ${sets.join(',')} WHERE id=? AND deleted_at IS NULL`,
      [...params, id], cb);
  };

  doUpdate((err, result) => {
    if (err) { console.error('[actividades.update]', err); return res.status(500).json({ error: 'Error al actualizar' }); }
    if (!result || result.affectedRows === 0) return res.status(404).json({ error: 'No encontrada' });
    updateImgs(imgErr => {
      if (imgErr) console.error('[actividades.update.imgs]', imgErr);
      res.json({ ok: true, warning: !!imgErr });
    });
  });
}

function remove(req, res) {
  if (!db) return res.status(500).json({ error: 'BD no disponible' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  db.query(
    'UPDATE actividades_inspectores SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL',
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Error al eliminar' });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'No encontrada' });
      res.json({ ok: true });
    }
  );
}

// ── Router (integrado para no necesitar actividadesRoutes.js) ─────────────────
const router = express.Router();
router.get('/',            getAll);
router.get('/admin/list',  requireAuth, getAllAdmin);
router.get('/:id',         getById);
router.post('/',           requireAuth, create);
router.put('/:id',         requireAuth, update);
router.delete('/:id',      requireAuth, remove);

module.exports = router;
module.exports.setDatabase     = setDatabase;
module.exports.NIVELES_VALIDOS = NIVELES_VALIDOS;
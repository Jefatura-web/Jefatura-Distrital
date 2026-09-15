/**
 * Panel administrativo — Jefatura Distrital Quilmes
 * Módulo unificado: preview en vivo + listado admin + formulario CRUD
 * (Fusiona los ex-archivos admin.js, adminActions.js y noticiasForm.js)
 */

import { apiFetch, getElement, sanitize, handleError } from './utils.js';
import { cargarNoticias, renderNoticiasList, showAppAlert } from './news.js';
import { renderCalendar } from './calendar.js';

const TOKEN_KEY = 'jefatura_admin_token';

// ── Helpers de token ──────────────────────────────────────────────────────────
const getToken = () =>
  String(sessionStorage.getItem(TOKEN_KEY) || '').replace(/^Bearer\s+/i, '');

// ── Preview en vivo ───────────────────────────────────────────────────────────
function initLivePreview() {
  const form        = getElement('#form-crear-noticia');
  const previewCard = getElement('#preview-card');
  if (!form || !previewCard) return;

  const CATEGORIAS = {
    1: { nombre: 'Comunicado',      color: 'azul'    },
    2: { nombre: 'Infraestructura', color: 'dorado'  },
    3: { nombre: 'Recursos Humanos',color: 'verde'   },
    4: { nombre: 'Pedagógico',      color: 'violeta' },
    5: { nombre: 'Institucional',   color: 'azul'    },
    6: { nombre: 'Cultura',         color: 'dorado'  }
  };

  const escHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  const fmtDate = (val) => {
    if (!val) return '';
    try { return new Date(val).toLocaleDateString('es-AR'); } catch { return val; }
  };

  const update = () => {
    const titulo      = form.querySelector('#noticia-titulo')?.value.trim()    || 'Tu título aparecerá aquí';
    const descripcion = form.querySelector('#noticia-descripcion')?.value.trim() || '';
    const texto       = form.querySelector('#noticia-texto')?.value.trim()     || '';
    const fecha       = form.querySelector('#noticia-fecha')?.value            || '';
    const catId       = parseInt(form.querySelector('#noticia-categoria')?.value || '1', 10);
    const destacada   = !!form.querySelector('#noticia-destacada')?.checked;
    const publicada   = !!form.querySelector('#noticia-publicada')?.checked;
    const imagenUrl   = form.querySelector('#noticia-imagen')?.value.trim()    || '';

    const cat       = CATEGORIAS[catId] || { nombre: 'Sin categoría', color: 'azul' };
    const estado    = !publicada ? 'Borrador' : (destacada ? '📌 Destacada' : '✅ Publicada');
    const estStyle  = !publicada
      ? 'background:#fef3c7;color:#92400e'
      : (destacada ? 'background:#dcfce7;color:#166534' : 'background:#e0f2fe;color:#0c4a6e');
    const preview   = texto.length > 150 ? texto.substring(0, 150) + '…' : (texto || 'El contenido se mostrará aquí.');
    const imagenHtml = imagenUrl
      ? `<img src="${escHtml(imagenUrl)}" alt="Vista previa" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
      : '<div class="pn-imagen-placeholder">🖼️</div>';

    previewCard.innerHTML = `
      <div class="pn-imagen ${cat.color}">${imagenHtml}</div>
      <div class="pn-body">
        <div class="pn-categoria">${escHtml(cat.nombre)}</div>
        <h3 class="pn-titulo">${escHtml(titulo)}</h3>
        ${descripcion ? `<p class="pn-descripcion">${escHtml(descripcion)}</p>` : '<p class="pn-descripcion">La descripción breve también...</p>'}
        <p class="pn-texto-preview">${escHtml(preview)}</p>
        <div class="pn-meta">
          <span class="pn-fecha">📅 ${fecha ? fmtDate(fecha) : 'Sin fecha'}</span>
          <span class="pn-estado" style="${estStyle}">${estado}</span>
        </div>
      </div>`;
  };

  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input',  update);
    el.addEventListener('change', update);
  });
  update();
}

// ── Formulario CRUD ───────────────────────────────────────────────────────────
function initNoticiasForm(onSuccess) {
  const form = getElement('#form-crear-noticia');
  if (!form) return;

  // Fecha de hoy por defecto
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];

  form.addEventListener('submit', (e) => handleFormSubmit(e, onSuccess));
}

function resetForm(clearToken = true) {
  const form = getElement('#form-crear-noticia');
  if (!form) return;
  form.reset();
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
  if (clearToken) {
    const tokenInput = getElement('#admin-token');
    if (tokenInput) tokenInput.value = getToken();
  }
}

async function handleFormSubmit(event, onSuccess) {
  event.preventDefault();

  const form        = getElement('#form-crear-noticia');
  const tokenInput  = getElement('#admin-token');
  const btnSubmit   = getElement('#form-submit-button');
  if (!form) return;

  const formData  = new FormData(form);
  const noticiaId = String(formData.get('id') || '').trim();
  const isUpdate  = noticiaId.length > 0;

  const tokenRaw = String(tokenInput?.value || '').trim();
  const token    = tokenRaw.replace(/^Bearer\s+/i, '');

  if (!token) {
    showAppAlert('Debés ingresar el token de administración.', 'error');
    return;
  }

  const data = {
    titulo:      formData.get('titulo'),
    descripcion: formData.get('descripcion'),
    texto:       formData.get('texto'),
    categoria_id: parseInt(formData.get('categoria_id'), 10),
    fecha:       formData.get('fecha'),
    imagen_url:  formData.get('imagen_url'),
    destacada:   formData.get('destacada') === 'on',
    publicada:   formData.get('publicada') === 'on'
  };

  if (!data.titulo || !data.texto || !data.categoria_id || !data.fecha) {
    showAppAlert('Completá todos los campos requeridos.', 'error');
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled    = true;
    btnSubmit.textContent = isUpdate ? 'Actualizando…' : 'Creando…';
  }

  try {
    const endpoint = isUpdate ? `/noticias/${encodeURIComponent(noticiaId)}` : '/noticias';
    const result   = await apiFetch(endpoint, {
      method:  isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify(data)
    });

    if (result?.ok) {
      resetForm(false);
      const title = getElement('#noticia-form-title');
      if (title) title.textContent = 'Crear nueva noticia';
      showAppAlert(isUpdate ? '✅ Noticia actualizada.' : '✅ Noticia creada.', 'success');

      if (typeof onSuccess === 'function') {
        await onSuccess();
      } else {
        setTimeout(async () => {
          await cargarNoticias();
          if (typeof renderCalendar === 'function') renderCalendar();
        }, 500);
      }
    } else {
      showAppAlert(result?.error || 'Error al guardar la noticia.', 'error');
    }
  } catch (error) {
    handleError(error, 'handleFormSubmit');
    showAppAlert('No se pudo guardar la noticia. Verificá la conexión y el token.', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled    = false;
      btnSubmit.textContent = isUpdate ? 'Actualizar noticia' : 'Crear noticia';
    }
  }
}

// ── Listado admin ─────────────────────────────────────────────────────────────
function formatNewsCard(noticia) {
  const cat    = sanitize(noticia.categoria || 'General');
  const titulo = sanitize(noticia.titulo    || 'Sin título');
  const texto  = sanitize(String(noticia.texto || '').substring(0, 170));
  const fecha  = sanitize(String(noticia.fecha  || ''));
  const imagen = sanitize(noticia.imagen || noticia.imagen_url || '');
  const imgHtml = imagen
    ? `<img src="${imagen}" alt="Imagen" loading="lazy" onerror="this.onerror=null;this.src='logo_jefatura.jpg'">`
    : '<div class="pn-imagen-placeholder">🖼️</div>';

  return `
    <article class="admin-news-card" data-id="${sanitize(String(noticia.id || ''))}">
      <div class="admin-news-image">${imgHtml}</div>
      <div class="admin-news-content">
        <div class="admin-news-category">${cat}</div>
        <h3>${titulo}</h3>
        <p>${texto}${texto.length >= 170 ? '…' : ''}</p>
        <div class="admin-news-meta"><time datetime="${fecha}">📅 ${fecha}</time></div>
      </div>
      <div class="admin-news-actions">
        <button type="button" class="btn-secondary admin-edit-btn">Editar</button>
        <button type="button" class="btn-danger   admin-delete-btn">Eliminar</button>
      </div>
    </article>`;
}

async function loadAdminNoticias() {
  const panel = getElement('#admin-noticias-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="admin-loading">Cargando noticias…</div>';

  try {
    const noticias = await apiFetch('/noticias?limit=20');
    if (!Array.isArray(noticias)) throw new Error('Formato de respuesta inválido');

    panel.innerHTML = noticias.length === 0
      ? '<div class="admin-empty">No hay noticias disponibles.</div>'
      : noticias.map(formatNewsCard).join('');

    attachCardEvents();
  } catch (error) {
    handleError(error, 'loadAdminNoticias');
    panel.innerHTML = '<div class="admin-error">No se pudieron cargar las noticias. Recargá la página.</div>';
  }
}

function attachCardEvents() {
  document.querySelectorAll('.admin-news-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.admin-edit-btn')?.addEventListener('click',   () => handleEdit(id));
    card.querySelector('.admin-delete-btn')?.addEventListener('click', () => handleDelete(id, card));
  });
}

async function handleEdit(id) {
  if (!id) return;
  try {
    const noticia = await apiFetch(`/noticias/${id}`);
    if (!noticia?.id) throw new Error('Noticia no encontrada');

    getElement('#noticia-id').value          = noticia.id;
    getElement('#noticia-titulo').value      = noticia.titulo     || '';
    getElement('#noticia-descripcion').value = noticia.descripcion|| '';
    getElement('#noticia-texto').value       = noticia.texto      || '';
    getElement('#noticia-categoria').value   = noticia.categoria_id || '';
    getElement('#noticia-fecha').value       = noticia.fecha      || '';
    getElement('#noticia-imagen').value      = noticia.imagen     || '';
    getElement('#noticia-destacada').checked = !!noticia.destacada;
    getElement('#noticia-publicada').checked = noticia.publicada === 1 || noticia.publicada === true;
    getElement('#admin-token').value         = getToken();

    const title = getElement('#noticia-form-title');
    if (title) title.textContent = 'Editar noticia';
    const btn = getElement('#form-submit-button');
    if (btn) btn.textContent = 'Actualizar noticia';

    // Scroll al formulario
    getElement('#form-crear-noticia')?.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    handleError(error, 'handleEdit');
    showAppAlert('No se pudo cargar la noticia para editar.', 'error');
  }
}

async function handleDelete(id, card) {
  if (!id) return;
  if (!window.confirm('¿Eliminar esta noticia? Esta acción no es reversible.')) return;

  const token = getToken();
  if (!token) {
    showAppAlert('No hay token válido. Ingresá el token primero.', 'error');
    return;
  }

  try {
    await apiFetch(`/noticias/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    card?.remove();
    showAppAlert('Noticia eliminada.', 'success');
    await cargarNoticias();
    renderNoticiasList();
  } catch (error) {
    handleError(error, 'handleDelete');
    showAppAlert('No se pudo eliminar la noticia.', 'error');
  }
}

// ── Cancelar / reset formulario ───────────────────────────────────────────────
function initCancelButton() {
  getElement('#form-cancel-button')?.addEventListener('click', () => {
    resetForm(false);
    const title = getElement('#noticia-form-title');
    if (title) title.textContent = 'Crear nueva noticia';
    const btn = getElement('#form-submit-button');
    if (btn) btn.textContent = 'Crear noticia';
    getElement('#noticia-id').value = '';
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restaurar token de sesión si existe
  const token = getToken();
  const tokenInput = getElement('#admin-token');
  if (token && tokenInput) tokenInput.value = token;

  initLivePreview();
  initCancelButton();
  initNoticiasForm(async () => {
    await cargarNoticias();
    renderNoticiasList();
    await loadAdminNoticias();
  });
  loadAdminNoticias();

  initActividadesForm();
  loadAdminActividades();
});

/* ════════════════════════════════════════════════════════════════════════════
 * ACTIVIDADES DE INSPECTORES (nivel / grado / mes + galería)
 * Mismo patrón CRUD que arriba, sobre /actividades. Fusionado acá para no
 * agregar un archivo js aparte solo para este formulario.
 * ════════════════════════════════════════════════════════════════════════════ */

function resetActividadForm() {
  const form = getElement('#form-crear-actividad');
  if (!form) return;
  form.reset();
  const tokenInput = getElement('#actividad-token');
  if (tokenInput) tokenInput.value = getToken();
  getElement('#actividad-id').value = '';
  const title = getElement('#actividad-form-title');
  if (title) title.textContent = 'Cargar actividad de inspector';
  const btn = getElement('#actividad-submit-button');
  if (btn) btn.textContent = 'Crear actividad';
}

function parseImagenes(texto) {
  return String(texto || '')
    .split('\n')
    .map(linea => linea.trim())
    .filter(linea => linea.length > 0);
}

function initActividadesForm() {
  const form = getElement('#form-crear-actividad');
  if (!form) return;

  const tokenInput = getElement('#actividad-token');
  if (tokenInput) tokenInput.value = getToken();

  form.addEventListener('submit', handleActividadSubmit);
  getElement('#actividad-cancel-button')?.addEventListener('click', resetActividadForm);
  getElement('#actividad-filtro-nivel')?.addEventListener('change', loadAdminActividades);
}

async function handleActividadSubmit(event) {
  event.preventDefault();

  const form = getElement('#form-crear-actividad');
  if (!form) return;

  const formData = new FormData(form);
  const actividadId = String(formData.get('id') || '').trim();
  const isUpdate = actividadId.length > 0;

  const tokenInput = getElement('#actividad-token');
  const token = String(tokenInput?.value || '').trim().replace(/^Bearer\s+/i, '');

  if (!token) {
    showAppAlert('Debés ingresar el token de administración.', 'error');
    return;
  }

  const data = {
    nivel: formData.get('nivel'),
    grado: formData.get('grado'),
    mes: formData.get('mes'), // input type=month -> 'YYYY-MM'
    titulo: formData.get('titulo'),
    descripcion: formData.get('descripcion'),
    inspector_nombre: formData.get('inspector_nombre'),
    imagenes: parseImagenes(formData.get('imagenes'))
  };

  if (!data.nivel || !data.grado || !data.mes || !data.titulo) {
    showAppAlert('Completá nivel, grado, mes y título.', 'error');
    return;
  }

  const btnSubmit = getElement('#actividad-submit-button');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = isUpdate ? 'Actualizando…' : 'Creando…';
  }

  try {
    const endpoint = isUpdate ? `/actividades/${encodeURIComponent(actividadId)}` : '/actividades';
    const result = await apiFetch(endpoint, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });

    if (result?.ok) {
      resetActividadForm();
      showAppAlert(isUpdate ? '✅ Actividad actualizada.' : '✅ Actividad creada.', 'success');
      await loadAdminActividades();
    } else {
      showAppAlert(result?.error || 'Error al guardar la actividad.', 'error');
    }
  } catch (error) {
    handleError(error, 'handleActividadSubmit');
    showAppAlert('No se pudo guardar la actividad. Verificá la conexión y el token.', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = isUpdate ? 'Actualizar actividad' : 'Crear actividad';
    }
  }
}

function formatActividadCard(actividad) {
  const nivel = sanitize(actividad.nivel || '');
  const grado = sanitize(actividad.grado || '');
  const titulo = sanitize(actividad.titulo || 'Sin título');
  const mes = sanitize(String(actividad.mes || '').substring(0, 7));
  const cantidadFotos = (actividad.imagenes || []).length;
  const primeraImagen = (actividad.imagenes && actividad.imagenes[0]) || '';
  const imgHtml = primeraImagen
    ? `<img src="${sanitize(primeraImagen)}" alt="Imagen" loading="lazy" onerror="this.onerror=null;this.src='logo_jefatura.jpg'">`
    : '<div class="pn-imagen-placeholder">🖼️</div>';

  return `
    <article class="admin-news-card" data-id="${sanitize(String(actividad.id || ''))}">
      <div class="admin-news-image">${imgHtml}</div>
      <div class="admin-news-content">
        <div class="admin-news-category">${nivel} · ${grado}</div>
        <h3>${titulo}</h3>
        <p>${mes} — ${cantidadFotos} foto${cantidadFotos === 1 ? '' : 's'}</p>
      </div>
      <div class="admin-news-actions">
        <button type="button" class="btn-secondary actividad-edit-btn">Editar</button>
        <button type="button" class="btn-danger actividad-delete-btn">Eliminar</button>
      </div>
    </article>`;
}

async function loadAdminActividades() {
  const panel = getElement('#admin-actividades-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="admin-loading">Cargando actividades…</div>';

  const nivelFiltro = getElement('#actividad-filtro-nivel')?.value || '';
  const token = getToken();

  if (!token) {
    panel.innerHTML = '<div class="admin-empty">Ingresá el token de administración arriba para ver el listado.</div>';
    return;
  }

  try {
    const query = nivelFiltro ? `?nivel=${encodeURIComponent(nivelFiltro)}` : '';
    const actividades = await apiFetch(`/actividades/admin/list${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!Array.isArray(actividades)) throw new Error('Formato de respuesta inválido');

    panel.innerHTML = actividades.length === 0
      ? '<div class="admin-empty">No hay actividades cargadas.</div>'
      : actividades.map(formatActividadCard).join('');

    attachActividadCardEvents(actividades);
  } catch (error) {
    handleError(error, 'loadAdminActividades');
    panel.innerHTML = '<div class="admin-error">No se pudieron cargar las actividades. Verificá el token.</div>';
  }
}

function attachActividadCardEvents(actividades) {
  document.querySelectorAll('#admin-actividades-panel .admin-news-card').forEach(card => {
    const id = card.dataset.id;
    const actividad = actividades.find(a => String(a.id) === id);
    card.querySelector('.actividad-edit-btn')?.addEventListener('click', () => handleActividadEdit(actividad));
    card.querySelector('.actividad-delete-btn')?.addEventListener('click', () => handleActividadDelete(id, card));
  });
}

function handleActividadEdit(actividad) {
  if (!actividad) return;

  getElement('#actividad-id').value = actividad.id;
  getElement('#actividad-nivel').value = actividad.nivel || '';
  getElement('#actividad-grado').value = actividad.grado || '';
  getElement('#actividad-mes').value = String(actividad.mes || '').substring(0, 7);
  getElement('#actividad-titulo').value = actividad.titulo || '';
  getElement('#actividad-inspector').value = actividad.inspector_nombre || '';
  getElement('#actividad-descripcion').value = actividad.descripcion || '';
  getElement('#actividad-imagenes').value = (actividad.imagenes || []).join('\n');
  getElement('#actividad-token').value = getToken();

  const title = getElement('#actividad-form-title');
  if (title) title.textContent = 'Editar actividad';
  const btn = getElement('#actividad-submit-button');
  if (btn) btn.textContent = 'Actualizar actividad';

  getElement('#form-crear-actividad')?.scrollIntoView({ behavior: 'smooth' });
}

async function handleActividadDelete(id, card) {
  if (!id) return;
  if (!window.confirm('¿Eliminar esta actividad? Esta acción no es reversible.')) return;

  const token = getToken();
  if (!token) {
    showAppAlert('No hay token válido. Ingresá el token primero.', 'error');
    return;
  }

  try {
    await apiFetch(`/actividades/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    card?.remove();
    showAppAlert('Actividad eliminada.', 'success');
  } catch (error) {
    handleError(error, 'handleActividadDelete');
    showAppAlert('No se pudo eliminar la actividad.', 'error');
  }
}
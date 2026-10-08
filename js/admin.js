/**
 * Panel administrativo — Jefatura Distrital Quilmes
 * Módulo unificado: preview en vivo + listado admin + formulario CRUD
 * (Fusiona los ex-archivos admin.js, adminActions.js y noticiasForm.js)
 */

import { apiFetch, getElement, sanitize, handleError } from './utils.js';
import { cargarNoticias, renderNoticiasList, showAppAlert } from './news.js';
import { renderCalendar } from './calendar.js';

// El token vive solamente en memoria mientras esta pestaña está abierta. Nunca
// se guarda en localStorage, sessionStorage, URLs ni cookies.
let activeToken = '';
const normalizeToken = value => String(value || '').replace(/^Bearer\s+/i, '').trim();
const getToken = () => activeToken;
const setToken = value => { activeToken = normalizeToken(value); return activeToken; };

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

function resetForm() {
  const form = getElement('#form-crear-noticia');
  if (!form) return;
  form.reset();
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
}

async function handleFormSubmit(event, onSuccess) {
  event.preventDefault();

  const form        = getElement('#form-crear-noticia');
  const btnSubmit   = getElement('#form-submit-button');
  if (!form) return;

  const formData  = new FormData(form);
  const noticiaId = String(formData.get('id') || '').trim();
  const isUpdate  = noticiaId.length > 0;

  const token = getToken();

  if (!token) {
    showAppAlert('Ingresá el token de seguridad para acceder al panel.', 'error');
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
      resetForm();
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

// ── Confirmación inline + helpers de tarjeta ──────────────────────────────────
/**
 * Reemplaza los botones de acción de una tarjeta con "¿Eliminar? [Sí] [No]".
 * Guarda los botones originales en un WeakMap para poder restaurarlos.
 */
const _origActions = new WeakMap();

function showInlineConfirm(card, onConfirm, onCancel) {
  const actionsEl = card.querySelector('.admin-news-actions');
  if (!actionsEl) return;
  if (_origActions.has(card)) return; // ya en confirmación

  _origActions.set(card, actionsEl.innerHTML);
  card.classList.add('card-confirming');

  actionsEl.innerHTML = `
    <span class="confirm-label">¿Eliminar?</span>
    <button type="button" class="btn-danger confirm-yes">Sí, eliminar</button>
    <button type="button" class="btn-secondary confirm-no">Cancelar</button>`;

  actionsEl.querySelector('.confirm-yes').addEventListener('click', () => {
    card.classList.remove('card-confirming');
    onConfirm();
  });
  actionsEl.querySelector('.confirm-no').addEventListener('click', () => {
    cancelInlineConfirm(card);
    if (typeof onCancel === 'function') onCancel();
  });
}

function cancelInlineConfirm(card) {
  const actionsEl = card.querySelector('.admin-news-actions');
  const orig = _origActions.get(card);
  if (!actionsEl || !orig) return;
  actionsEl.innerHTML = orig;
  _origActions.delete(card);
  card.classList.remove('card-confirming');
}

/** Marca la tarjeta que está siendo editada y limpia cualquier otra. */
function setActiveEditCard(card) {
  document.querySelectorAll('.admin-news-card.card-editing')
    .forEach(c => c.classList.remove('card-editing'));
  card?.classList.add('card-editing');
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

  const token = getToken();
  if (!token) {
    panel.innerHTML = '<div class="admin-empty">Ingresá el token para ver y administrar las noticias.</div>';
    return;
  }

  try {
    const noticias = await apiFetch('/noticias/admin?limit=20', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
    const noticia = await apiFetch(`/noticias/admin/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!noticia?.id) throw new Error('Noticia no encontrada');

    getElement('#noticia-id').value          = noticia.id;
    getElement('#noticia-titulo').value      = noticia.titulo     || '';
    getElement('#noticia-descripcion').value = noticia.descripcion|| '';
    getElement('#noticia-texto').value       = noticia.texto      || '';
    getElement('#noticia-categoria').value   = noticia.categoria_id || '';
    getElement('#noticia-fecha').value       = noticia.fecha      || '';
    getElement('#noticia-imagen').value      = noticia.imagen     || '';
    renderSinglePreview(noticia.imagen || '');
    getElement('#noticia-destacada').checked = !!noticia.destacada;
    getElement('#noticia-publicada').checked = noticia.publicada === 1 || noticia.publicada === true;
    const title = getElement('#noticia-form-title');
    if (title) title.textContent = 'Editar noticia';
    const btn = getElement('#form-submit-button');
    if (btn) btn.textContent = 'Actualizar noticia';

    // Marcar tarjeta activa y hacer scroll
    const card = document.querySelector(`.admin-news-card[data-id="${id}"]`);
    setActiveEditCard(card);
    getElement('#form-crear-noticia')?.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    handleError(error, 'handleEdit');
    showAppAlert('No se pudo cargar la noticia para editar.', 'error');
  }
}

function handleDelete(id, card) {
  if (!id || !card) return;
  showInlineConfirm(card, async () => {
    const token = getToken();
    if (!token) { showAppAlert('No hay token válido. Ingresá el token primero.', 'error'); return; }
    try {
      await apiFetch(`/noticias/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      card.classList.add('card-removing');
      setTimeout(() => card.remove(), 350);
      showAppAlert('Noticia eliminada.', 'success');
      await cargarNoticias();
      renderNoticiasList();
    } catch (error) {
      handleError(error, 'handleDelete');
      showAppAlert('No se pudo eliminar la noticia.', 'error');
      cancelInlineConfirm(card);
    }
  }, () => cancelInlineConfirm(card));
}

// ── Cancelar / reset formulario ───────────────────────────────────────────────
function initCancelButton() {
  getElement('#form-cancel-button')?.addEventListener('click', () => {
    resetForm();
    const title = getElement('#noticia-form-title');
    if (title) title.textContent = 'Crear nueva noticia';
    const btn = getElement('#form-submit-button');
    if (btn) btn.textContent = 'Crear noticia';
    getElement('#noticia-id').value = '';
    setActiveEditCard(null);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Limpia una versión antigua del sitio que pudiera haber dejado un token.
  sessionStorage.removeItem('jefatura_admin_token');

  initAdminAccessGate();
  initLivePreview();
  initCancelButton();
  initNoticiasForm(async () => {
    await cargarNoticias();
    renderNoticiasList();
    await loadAdminNoticias();
  });
  initActividadesForm();
  initImageUploads();
});

function initAdminAccessGate() {
  const form = getElement('#admin-access-form');
  const tokenInput = getElement('#admin-access-token');
  const errorMessage = getElement('#admin-access-error');
  const submitButton = getElement('#admin-access-submit');
  const gate = getElement('#admin-access-gate');
  const panel = getElement('#admin-panel');
  const status = getElement('.admin-status');
  const logoutButton = getElement('#admin-logout');
  if (!form || !tokenInput || !errorMessage || !submitButton || !gate || !panel) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const token = normalizeToken(tokenInput.value);
    if (!token) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Verificando…';
    errorMessage.textContent = '';

    try {
      const result = await apiFetch('/noticias/admin/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!result?.ok) throw new Error(result?.error || 'No se pudo verificar el token.');

      setToken(token);
      tokenInput.value = '';
      gate.hidden = true;
      panel.hidden = false;
      panel.removeAttribute('aria-hidden');
      if (status) status.textContent = 'Sesión activa';
      if (logoutButton) logoutButton.hidden = false;
      await Promise.all([loadAdminNoticias(), loadAdminActividades()]);
    } catch (error) {
      handleError(error, 'initAdminAccessGate');
      errorMessage.textContent = error?.body?.error || error.message || 'No se pudo verificar el token.';
      tokenInput.select();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Entrar al panel';
    }
  });

  logoutButton?.addEventListener('click', () => {
    setToken('');
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    gate.hidden = false;
    tokenInput.value = '';
    errorMessage.textContent = '';
    if (status) status.textContent = 'Token requerido';
    if (logoutButton) logoutButton.hidden = true;
    resetForm();
    resetActividadForm();
    tokenInput.focus();
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * ACTIVIDADES DE INSPECTORES (nivel / grado / mes + galería)
 * Mismo patrón CRUD que arriba, sobre /actividades. Fusionado acá para no
 * agregar un archivo js aparte solo para este formulario.
 * ════════════════════════════════════════════════════════════════════════════ */

function resetActividadForm() {
  const form = getElement('#form-crear-actividad');
  if (!form) return;
  form.reset();
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

  form.addEventListener('submit', handleActividadSubmit);
  getElement('#actividad-cancel-button')?.addEventListener('click', () => {
    resetActividadForm();
    setActiveEditCard(null);
  });
  getElement('#actividad-filtro-nivel')?.addEventListener('change', loadAdminActividades);
}

async function handleActividadSubmit(event) {
  event.preventDefault();

  const form = getElement('#form-crear-actividad');
  if (!form) return;

  const formData = new FormData(form);
  const actividadId = String(formData.get('id') || '').trim();
  const isUpdate = actividadId.length > 0;

  const token = getToken();

  if (!token) {
    showAppAlert('Ingresá el token de seguridad para acceder al panel.', 'error');
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
  renderActivityPreviews();
  const title = getElement('#actividad-form-title');
  if (title) title.textContent = 'Editar actividad';
  const btn = getElement('#actividad-submit-button');
  if (btn) btn.textContent = 'Actualizar actividad';

  const card = document.querySelector(`#admin-actividades-panel .admin-news-card[data-id="${actividad.id}"]`);
  setActiveEditCard(card);
  getElement('#form-crear-actividad')?.scrollIntoView({ behavior: 'smooth' });
}

function handleActividadDelete(id, card) {
  if (!id || !card) return;
  showInlineConfirm(card, async () => {
    const token = getToken();
    if (!token) { showAppAlert('No hay token válido. Ingresá el token primero.', 'error'); return; }
    try {
      await apiFetch(`/actividades/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      card.classList.add('card-removing');
      setTimeout(() => card.remove(), 350);
      showAppAlert('Actividad eliminada.', 'success');
    } catch (error) {
      handleError(error, 'handleActividadDelete');
      showAppAlert('No se pudo eliminar la actividad.', 'error');
      cancelInlineConfirm(card);
    }
  }, () => cancelInlineConfirm(card));
}

// ── Carga de imágenes ─────────────────────────────────────────────────────────
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/heic', 'image/heif'
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 20;

function getUploadStatus(input) {
  return input.dataset.mode === 'append'
    ? getElement('#upload-actividad-status')
    : getElement('#upload-noticia-status');
}

function showUploadStatus(input, message, isError = false) {
  const status = getUploadStatus(input);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('upload-status-error', isError);
}

function renderSinglePreview(url) {
  const preview = getElement('#preview-noticia-img');
  if (!preview) return;
  preview.replaceChildren();
  if (!url) return;
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Vista previa de la foto seleccionada';
  image.loading = 'lazy';
  preview.appendChild(image);
}

function renderActivityPreviews() {
  const list = getElement('#actividad-photo-list');
  const textarea = getElement('#actividad-imagenes');
  if (!list || !textarea) return;

  list.replaceChildren();
  parseImagenes(textarea.value).forEach((url, index) => {
    const item = document.createElement('div');
    item.className = 'upload-preview-item';

    const image = document.createElement('img');
    image.src = url;
    image.alt = `Foto ${index + 1}`;
    image.loading = 'lazy';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'upload-preview-remove';
    remove.setAttribute('aria-label', `Quitar foto ${index + 1}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      const urls = parseImagenes(textarea.value);
      urls.splice(index, 1);
      textarea.value = urls.join('\n');
      renderActivityPreviews();
    });

    item.append(image, remove);
    list.appendChild(item);
  });
}

async function uploadFile(file, token) {
  const formData = new FormData();
  formData.append('image', file, file.name);
  const result = await apiFetch('/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!result?.ok || !result.url) throw new Error(result?.error || 'El servidor no devolvió una URL de imagen.');
  return result.url;
}

async function handleImageSelection(input) {
  const files = Array.from(input.files || []);
  if (files.length === 0) return;

  const token = getToken();
  if (!token) {
    showUploadStatus(input, 'Ingresá el token antes de subir fotos.', true);
    input.value = '';
    return;
  }

  if (files.length > MAX_FILES_PER_BATCH) {
    showUploadStatus(input, `Elegí hasta ${MAX_FILES_PER_BATCH} fotos por tanda.`, true);
    input.value = '';
    return;
  }

  const invalid = files.find(file => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE);
  if (invalid) {
    showUploadStatus(input, 'Usá fotos JPG, PNG, WebP, GIF, AVIF o HEIC de hasta 10 MB cada una.', true);
    input.value = '';
    return;
  }

  const target = getElement(`#${input.dataset.target}`);
  if (!target) return;

  try {
    const urls = [];
    for (const [index, file] of files.entries()) {
      showUploadStatus(input, `Subiendo ${index + 1} de ${files.length}: ${file.name}`);
      urls.push(await uploadFile(file, token));
    }

    if (input.dataset.mode === 'append') {
      const existing = parseImagenes(target.value);
      target.value = [...existing, ...urls].join('\n');
      renderActivityPreviews();
    } else {
      target.value = urls[0];
      renderSinglePreview(urls[0]);
    }
    showUploadStatus(input, `${urls.length} foto${urls.length === 1 ? '' : 's'} subida${urls.length === 1 ? '' : 's'} correctamente.`);
  } catch (error) {
    handleError(error, 'handleImageSelection');
    showUploadStatus(input, error?.body?.error || error.message || 'No se pudo subir la foto.', true);
  } finally {
    input.value = '';
  }
}

function initImageUploads() {
  document.querySelectorAll('.upload-file-input').forEach(input => {
    input.addEventListener('change', () => handleImageSelection(input));
  });
  getElement('#actividad-imagenes')?.addEventListener('input', renderActivityPreviews);
  getElement('#noticia-imagen')?.addEventListener('input', event => renderSinglePreview(event.target.value.trim()));
  renderActivityPreviews();
}

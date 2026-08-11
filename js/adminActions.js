import { getElement, sanitize, handleError, apiFetch } from './utils.js';
import { initNoticiasForm } from './noticiasForm.js';
import { cargarNoticias, renderNoticiasList, showAppAlert } from './news.js';

const TOKEN_STORAGE_KEY = 'jefatura_admin_token';

function getToken() {
  return String(sessionStorage.getItem(TOKEN_STORAGE_KEY) || '').replace(/^Bearer\s+/i, '');
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function formatNewsCard(noticia) {
  const categoria = sanitize(noticia.categoria || 'General');
  const titulo = sanitize(noticia.titulo || 'Sin título');
  const texto = sanitize(String(noticia.texto || '').substring(0, 170));
  const fecha = sanitize(String(noticia.fecha || ''));
  const imagen = sanitize(noticia.imagen || noticia.imagen_url || '');
  const imagenHTML = imagen ? `<img src="${imagen}" alt="Imagen noticia" loading="lazy" onerror="this.onerror=null;this.src='logo_jefatura.jpg'" />` : '<div class="pn-imagen-placeholder">🖼️</div>';

  return `
    <article class="admin-news-card" data-id="${sanitize(String(noticia.id || ''))}">
      <div class="admin-news-image">${imagenHTML}</div>
      <div class="admin-news-content">
        <div class="admin-news-category">${categoria}</div>
        <h3>${titulo}</h3>
        <p>${texto}${texto.length >= 170 ? '...' : ''}</p>
        <div class="admin-news-meta"><time datetime="${fecha}">📅 ${fecha}</time></div>
      </div>
      <div class="admin-news-actions">
        <button type="button" class="btn-secondary admin-edit-btn">Editar</button>
        <button type="button" class="btn-danger admin-delete-btn">Eliminar</button>
      </div>
    </article>
  `;
}

async function loadAdminNoticias() {
  const panel = getElement('#admin-noticias-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="admin-loading">Cargando noticias administrativas...</div>';

  try {
    const noticias = await apiFetch('/noticias?limit=20');
    if (!Array.isArray(noticias)) {
      throw new Error('Formato de respuesta inválido');
    }

    if (noticias.length === 0) {
      panel.innerHTML = '<div class="admin-empty">No hay noticias disponibles para editar.</div>';
      return;
    }

    panel.innerHTML = noticias.map(formatNewsCard).join('');
    attachAdminCardEvents();
  } catch (error) {
    handleError(error, 'loadAdminNoticias');
    panel.innerHTML = '<div class="admin-error">No se pudieron cargar las noticias. Recargá la página.</div>';
  }
}

function attachAdminCardEvents() {
  const cards = document.querySelectorAll('.admin-news-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const editBtn = card.querySelector('.admin-edit-btn');
    const deleteBtn = card.querySelector('.admin-delete-btn');

    editBtn?.addEventListener('click', () => handleEditNoticia(id));
    deleteBtn?.addEventListener('click', () => handleDeleteNoticia(id, card));
  });
}

async function handleEditNoticia(id) {
  if (!id) return;

  try {
    const noticia = await apiFetch(`/noticias/${id}`);
    if (!noticia || !noticia.id) {
      throw new Error('No se encontró la noticia para editar');
    }

    const form = getElement('#form-crear-noticia');
    if (!form) return;

    getElement('#noticia-id').value = noticia.id;
    getElement('#noticia-titulo').value = noticia.titulo || '';
    getElement('#noticia-descripcion').value = noticia.descripcion || '';
    getElement('#noticia-texto').value = noticia.texto || '';
    getElement('#noticia-categoria').value = noticia.categoria_id || '';
    getElement('#noticia-fecha').value = noticia.fecha || '';
    getElement('#noticia-imagen').value = noticia.imagen || '';
    getElement('#noticia-destacada').checked = !!noticia.destacada;
    getElement('#noticia-publicada').checked = noticia.publicada === 1 || noticia.publicada === true;
    getElement('#admin-token').value = getToken();

    const title = getElement('#noticia-form-title');
    if (title) title.textContent = 'Editar noticia';
    const submitButton = getElement('#form-submit-button');
    if (submitButton) submitButton.textContent = 'Actualizar noticia';

    const modal = getElement('#modal-crear-noticia');
    if (modal) {
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }

  } catch (error) {
    handleError(error, 'handleEditNoticia');
    showAppAlert('No se pudo cargar la noticia para edición.', 'error');
  }
}

async function handleDeleteNoticia(id, card) {
  if (!id) return;

  const confirmed = window.confirm('¿Eliminar esta noticia? Esta acción no es reversible.');
  if (!confirmed) return;

  try {
    const token = getToken();
    if (!token) {
      showAppAlert('No hay token administrativo válido. Inicia sesión nuevamente.', 'error');
      return;
    }

    await apiFetch(`/noticias/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    card?.remove();
    showAppAlert('Noticia eliminada correctamente.', 'success');
    await cargarNoticias();
    renderNoticiasList();
  } catch (error) {
    handleError(error, 'handleDeleteNoticia');
    showAppAlert('No se pudo eliminar la noticia.', 'error');
  }
}

export function initAdminActions() {
  initNoticiasForm(async () => {
    await cargarNoticias();
    renderNoticiasList();
    await loadAdminNoticias();
  });

  const formCancel = getElement('#form-cancel-button');
  if (formCancel) {
    formCancel.addEventListener('click', () => {
      const modal = getElement('#modal-crear-noticia');
      if (modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('visible');
        document.body.style.overflow = '';
      }
      const title = getElement('#noticia-form-title');
      if (title) title.textContent = 'Crear nueva noticia';
      const submitButton = getElement('#form-submit-button');
      if (submitButton) submitButton.textContent = 'Crear noticia';
      const form = getElement('#form-crear-noticia');
      if (form) form.reset();
      const inputFecha = getElement('#noticia-fecha');
      if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
    });
  }

  const modal = getElement('#modal-crear-noticia');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('visible');
        document.body.style.overflow = '';
      }
    });
  }

  loadAdminNoticias();
}

window.addEventListener('DOMContentLoaded', () => {
  if (!adminToken) {
    showAppAlert('El token administrativo no está disponible. Ingresa el token antes de usar el panel.', 'error');
  }
  initAdminActions();
});

/**
 * Punto de entrada del cliente
 */

import { cargarNoticias, initSearch, showAppAlert } from './news.js';
import { initCalendar } from './calendar.js';
import { getElement, getApiBaseUrl } from './utils.js';  // ← ya no necesita apiConfig.js

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');

  initNavToggle();
  initSearch();
  initAdminAccessButton();

  try {
    const noticias = await cargarNoticias();
    initCalendar(noticias);
    console.log(`✅ App lista — ${noticias.length} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
    showAppAlert('No se pudieron cargar las noticias. Verificá la conexión o recargá la página.');
  }
});

// ── Nav toggle ────────────────────────────────────────────────────────────────
function initNavToggle() {
  const navToggle = getElement('#nav-toggle');
  const navMenu   = getElement('.primary-nav');
  if (!navToggle || !navMenu) return;

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navMenu.classList.toggle('open');
  });
}

// ── Botón de acceso admin ─────────────────────────────────────────────────────
function initAdminAccessButton() {
  const button       = getElement('#btn-subir-noticias');
  const menu         = getElement('#admin-access-menu');
  const modal        = getElement('#modal-admin-token');
  const closeButton  = getElement('#btn-cerrar-token');
  const cancelButton = getElement('#btn-cancelar-token');
  const submitButton = getElement('#btn-validar-token');
  const tokenInput   = getElement('#admin-token-input');
  const TOKEN_KEY    = 'jefatura_admin_token';

  if (!button || !modal || !closeButton || !cancelButton || !submitButton || !tokenInput) {
    console.warn('initAdminAccessButton: elemento faltante — omitiendo init del botón admin.');
    return;
  }

  let storedToken = sessionStorage.getItem(TOKEN_KEY);

  const updateButtonState = () => {
    const textSpan = button.querySelector('.aa-text');
    if (storedToken) {
      if (textSpan) textSpan.textContent = 'Abrir panel';
      button.classList.add('btn-admin-open');
    } else {
      if (textSpan) textSpan.textContent = 'Acceso';
      button.classList.remove('btn-admin-open');
    }
  };

  const openModal = () => {
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    tokenInput.value = '';
    setTimeout(() => tokenInput.focus(), 50);
  };

  const closeModal = () => {
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const clearToken = () => {
    storedToken = null;
    sessionStorage.removeItem(TOKEN_KEY);
    updateButtonState();
  };

  const saveToken = (token) => {
    storedToken = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    updateButtonState();
  };

  const verifyToken = async (token) => {
    const url = `${getApiBaseUrl()}/noticias/admin/verify-token`;
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await response.json().catch(() => {
      throw Object.assign(new Error(`Respuesta inesperada: ${response.status}`), { status: response.status });
    });
    if (!response.ok) {
      throw Object.assign(new Error(result?.error || `HTTP ${response.status}`), { status: response.status, body: result });
    }
    return result;
  };

  const verifyAndRedirect = async (token) => {
    try {
      const result = await verifyToken(token);
      if (!result?.ok) throw new Error(result?.error || 'Token inválido.');
      window.location.replace('/admin.html');
    } catch (error) {
      if (error.status === 403) { clearToken(); }
      closeModal();
      const msg = error.status === 403
        ? 'El token guardado no es válido. Ingresá uno nuevo.'
        : 'No se pudo verificar el token. Verificá tu conexión.';
      showAppAlert(msg, 'error');
      if (error.status === 403) openModal();
    }
  };

  const modalError = getElement('#modal-token-error');

  const showModalError = (msg) => {
    if (!modalError) return;
    modalError.textContent = msg;
    modalError.classList.add('visible');
  };
  const clearModalError = () => {
    if (!modalError) return;
    modalError.textContent = '';
    modalError.classList.remove('visible');
  };

  const submitToken = async () => {
    clearModalError();
    const token = String(tokenInput.value || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      showModalError('Debés ingresar el token de seguridad.');
      return;
    }
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Verificando…'; }
    try {
      const result = await verifyToken(token);
      if (!result?.ok) throw new Error(result?.error || 'Token inválido.');
      saveToken(token);
      closeModal();
      window.location.replace('/admin.html');
    } catch (error) {
      const msg = error.status === 403
        ? 'Token de seguridad inválido. Revisá el valor en Render.'
        : 'No se pudo conectar con el servidor. Intentá nuevamente.';
      showModalError(msg);
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Entrar al panel'; }
    }
  };

  button.addEventListener('click', () => {
    if (storedToken && menu) {
      const showing = menu.classList.toggle('show');
      menu.setAttribute('aria-hidden', String(!showing));
      button.setAttribute('aria-expanded', String(showing));
    } else {
      openModal();
    }
  });

  if (menu) {
    getElement('#admin-open-panel')?.addEventListener('click', () => {
      menu.classList.remove('show');
      verifyAndRedirect(sessionStorage.getItem(TOKEN_KEY));
    });
    getElement('#admin-use-other')?.addEventListener('click', () => {
      menu.classList.remove('show');
      openModal();
    });
    getElement('#admin-clear-token')?.addEventListener('click', () => {
      clearToken();
      menu.classList.remove('show');
      showAppAlert('Token eliminado.', 'info');
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !button.contains(e.target)) {
        menu.classList.remove('show');
      }
    });
  }

  closeButton.addEventListener('click',  closeModal);
  cancelButton.addEventListener('click', closeModal);
  submitButton.addEventListener('click', submitToken);
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitToken(); }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  updateButtonState();
}
/**
 * Punto de entrada del cliente
 * Carga módulos y coordina inicialización
 */

import { cargarNoticias, initSearch, showAppAlert } from './news.js';
import { initCalendar } from './calendar.js';
import { getElement } from './utils.js';
import { getApiBaseUrl } from './apiConfig.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');

  initNavToggle();
  initSearch();
  initAdminAccessButton();

  try {
    const noticias = await cargarNoticias();
    initCalendar(noticias);
    console.log(`✅ App lista - ${noticias.length} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
    showAppAlert('No se pudieron cargar las noticias. Verifique la conexión o recargue la página.');
  }
});

function initAdminAccessButton() {
  const button = getElement('#btn-subir-noticias');
  const menu = getElement('#admin-access-menu');
  const modal = getElement('#modal-admin-token');
  const closeButton = getElement('#btn-cerrar-token');
  const cancelButton = getElement('#btn-cancelar-token');
  const submitButton = getElement('#btn-validar-token');
  const tokenInput = getElement('#admin-token-input');
  const storedTokenKey = 'jefatura_admin_token';
  let storedToken = sessionStorage.getItem(storedTokenKey);

  if (!button || !modal || !closeButton || !cancelButton || !submitButton || !tokenInput) {
    console.error('initAdminAccessButton: elemento faltante', {
      button,
      modal,
      closeButton,
      cancelButton,
      submitButton,
      tokenInput
    });
    return;
  }

  const updateButtonState = () => {
    const textSpan = button.querySelector('.aa-text');
    if (storedToken) {
      if (textSpan) textSpan.textContent = 'Abrir panel';
      button.title = 'Usar token guardado para abrir el panel de noticias';
      button.classList.add('btn-admin-open');
    } else {
      if (textSpan) textSpan.textContent = 'Acceso';
      button.title = 'Requiere token de seguridad para acceder al panel';
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

  const clearStoredToken = () => {
    storedToken = null;
    sessionStorage.removeItem(storedTokenKey);
    updateButtonState();
  };

  const saveStoredToken = (token) => {
    storedToken = token;
    sessionStorage.setItem(storedTokenKey, token);
    updateButtonState();
  };

  const verifyTokenOnServer = async (token) => {
    const backendOrigin = getApiBaseUrl();
    const verifyUrl = `${backendOrigin}/noticias/admin/verify-token`;
    console.log('[verifyTokenOnServer] url=', verifyUrl, 'token=', token, 'location=', window.location.href, 'origin=', window.location.origin);

    const response = await fetch(verifyUrl, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const result = await response.json().catch((parseError) => {
      console.warn('No se pudo parsear JSON de respuesta de verificación de token', parseError);
      const error = new Error(`Respuesta inesperada del servidor: ${response.status}`);
      error.status = response.status;
      throw error;
    });

    if (!response.ok) {
      const errorMessage = result?.error || result?.message || `HTTP ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.body = result;
      throw error;
    }

    return result;
  };

  const verifyAndRedirect = async (token) => {
    try {
      const result = await verifyTokenOnServer(token);
      if (!result?.ok) {
        throw new Error(result?.error || 'Token inválido.');
      }
      window.location.replace('/admin.html');
    } catch (error) {
      if (error.status === 403) {
        clearStoredToken();
      }
      closeModal();
      console.error('❌ Error al validar token administrativo guardado:', error);
      if (error.status === 403) {
        showAppAlert('El token guardado no es válido. Ingresá uno nuevo.', 'error');
        openModal();
      } else {
        showAppAlert('No se pudo verificar el token. Verificá tu conexión y volvé a intentarlo.', 'error');
      }
    }
  };

  const submitToken = async () => {
    const token = String(tokenInput.value || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      showAppAlert('Debes ingresar un token de seguridad para continuar.', 'error');
      return;
    }

    try {
      const result = await verifyTokenOnServer(token);
      if (!result?.ok) {
        throw new Error(result?.error || 'Token inválido.');
      }

      saveStoredToken(token);
      closeModal();
      window.location.replace('/admin.html');
    } catch (error) {
      console.error('❌ Error al validar token administrativo:', error);
      if (error.status === 403) {
        showAppAlert('Token de seguridad inválido. Intenta nuevamente.', 'error');
      } else {
        showAppAlert('No se pudo verificar el token. Verificá tu conexión y volvé a intentarlo.', 'error');
      }
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
  // Manejo de opciones del menú
  if (menu) {
    const openBtn = getElement('#admin-open-panel');
    const useOtherBtn = getElement('#admin-use-other');
    const clearBtn = getElement('#admin-clear-token');

    openBtn?.addEventListener('click', () => {
      menu.classList.remove('show');
      button.setAttribute('aria-expanded', 'false');
      verifyAndRedirect(sessionStorage.getItem('jefatura_admin_token'));
    });
    useOtherBtn?.addEventListener('click', () => {
      menu.classList.remove('show');
      button.setAttribute('aria-expanded', 'false');
      openModal();
    });
    clearBtn?.addEventListener('click', () => {
      clearStoredToken();
      menu.classList.remove('show');
      button.setAttribute('aria-expanded', 'false');
      showAppAlert('Token eliminado.', 'info');
    });

    // Cerrar menú si se hace click afuera
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !button.contains(e.target)) {
        menu.classList.remove('show');
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }
  closeButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);
  submitButton.addEventListener('click', submitToken);
  tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitToken();
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  updateButtonState();
}

function initNavToggle() {
  const navToggle = getElement('#nav-toggle');
  const navMenu = getElement('.primary-nav');
  if (!navToggle || !navMenu) return;

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navMenu.classList.toggle('open');
  });
}



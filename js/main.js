/**
 * Punto de entrada del cliente
 */

import { cargarNoticias, initSearch, showAppAlert, cerrarNoticiaModal } from './news.js';
import { initCalendar } from './calendar.js';
import { getElement } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');

  initNavToggle();
  initSearch();
  initAdminAccessButton();
  initNoticiaModal();

  try {
    const noticias = await cargarNoticias();
    initCalendar(noticias);
    console.log(`✅ App lista — ${noticias.length} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
    showAppAlert('No se pudieron cargar las noticias. Verificá la conexión o recargá la página.');
  }
});

// ── Modal de noticias ─────────────────────────────────────────────────────────
function initNoticiaModal() {
  getElement('#noticia-modal-cerrar')?.addEventListener('click', cerrarNoticiaModal);
  getElement('#modal-noticia')?.addEventListener('click', e => {
    if (e.target.id === 'modal-noticia') cerrarNoticiaModal();
  });
}

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
  if (!button) return;
  // El token se pide dentro del panel y nunca se conserva en el navegador.
  button.addEventListener('click', () => window.location.assign('/admin.html'));
}

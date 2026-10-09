/**
 * Punto de entrada del cliente
 */

import { cargarCategorias, cargarNoticias, initSearch, showAppAlert, cerrarNoticiaModal } from './news.js';
import { initCalendar } from './calendar.js';
import { getElement } from './utils.js';
import { cargarActividadesRecientes } from './actividades.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');

  initNavToggle();
  initSearch();
  initAdminAccessButton();
  initNoticiaModal();
  initInspectorMenu();
  cargarActividadesRecientes();

  const categoriesLoaded = cargarCategorias().catch(() => {
    showAppAlert('No se pudieron cargar las categorías. Podés seguir viendo las noticias sin filtrar.', 'error');
  });

  try {
    const [noticias] = await Promise.all([cargarNoticias(), categoriesLoaded]);
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
    navToggle.setAttribute('aria-label', expanded ? 'Abrir menú principal' : 'Cerrar menú principal');
  });
}

function initInspectorMenu() {
  const toggle = getElement('#inspectores-menu-toggle');
  const menu = getElement('#inspectores-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    menu.hidden = expanded;
    toggle.setAttribute('aria-label', expanded ? 'Abrir niveles de inspectores' : 'Cerrar niveles de inspectores');
  });
  const mobileMenu = window.matchMedia('(max-width: 768px)');
  const syncInspectorMenu = event => {
    const expanded = !event.matches;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Cerrar niveles de inspectores' : 'Abrir niveles de inspectores');
    menu.hidden = !expanded;
  };
  syncInspectorMenu(mobileMenu);
  mobileMenu.addEventListener('change', syncInspectorMenu);
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 768px)').matches) {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir niveles de inspectores');
      }
    });
  });
}

// ── Botón de acceso admin ─────────────────────────────────────────────────────
function initAdminAccessButton() {
  const button       = getElement('#btn-subir-noticias');
  if (!button) return;
  // El token se pide dentro del panel y nunca se conserva en el navegador.
  button.addEventListener('click', () => window.location.assign('/admin.html'));
}

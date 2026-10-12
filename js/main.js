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
  const modal = getElement('#modal-noticia');
  if (!modal) return;
  getElement('#noticia-modal-cerrar')?.addEventListener('click', cerrarNoticiaModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) cerrarNoticiaModal();
  });
}

// ── Nav toggle ────────────────────────────────────────────────────────────────
function initNavToggle() {
  const navToggle = getElement('#nav-toggle');
  const navMenu   = getElement('.primary-nav');
  if (!navToggle || !navMenu) return;

  const mobileMenu = window.matchMedia('(max-width: 768px)');
  const closeMenu = ({ restoreFocus = false } = {}) => {
    navMenu.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menú principal');
    if (restoreFocus) navToggle.focus();
  };
  const syncMenu = event => {
    if (!event.matches) closeMenu();
    navToggle.setAttribute('aria-expanded', String(!event.matches));
    navToggle.setAttribute('aria-label', event.matches ? 'Abrir menú principal' : 'Cerrar menú principal');
  };
  syncMenu(mobileMenu);
  mobileMenu.addEventListener('change', syncMenu);

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !expanded;
    navToggle.setAttribute('aria-expanded', String(nextExpanded));
    navMenu.classList.toggle('open', nextExpanded);
    navToggle.setAttribute('aria-label', expanded ? 'Abrir menú principal' : 'Cerrar menú principal');
  });
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (mobileMenu.matches) closeMenu();
    });
  });
  document.addEventListener('pointerdown', event => {
    if (mobileMenu.matches && !navMenu.contains(event.target) && !navToggle.contains(event.target)) {
      closeMenu();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileMenu.matches &&
        navToggle.getAttribute('aria-expanded') === 'true') {
      closeMenu({ restoreFocus: true });
    }
  });
}

function initInspectorMenu() {
  const toggle = getElement('#inspectores-menu-toggle');
  const menu = getElement('#inspectores-menu');
  if (!toggle || !menu) return;

  const mobileMenu = window.matchMedia('(max-width: 768px)');
  const closeMenu = ({ restoreFocus = false } = {}) => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir niveles de inspectores');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    menu.hidden = expanded;
    toggle.setAttribute('aria-label', expanded ? 'Abrir niveles de inspectores' : 'Cerrar niveles de inspectores');
  });
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
        closeMenu();
      }
    });
  });
  document.addEventListener('pointerdown', event => {
    if (mobileMenu.matches && !menu.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileMenu.matches &&
        toggle.getAttribute('aria-expanded') === 'true') {
      closeMenu({ restoreFocus: true });
    }
  });
}

// ── Botón de acceso admin ─────────────────────────────────────────────────────
function initAdminAccessButton() {
  const button       = getElement('#btn-subir-noticias');
  if (!button) return;
  // El token se pide dentro del panel y nunca se conserva en el navegador.
  button.addEventListener('click', () => window.location.assign('/admin.html'));
}

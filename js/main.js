/**
 * Punto de entrada del cliente
 * Carga módulos y coordina inicialización
 */

import { cargarNoticias, initSearch, showAppAlert } from './news.js';
import { initCalendar } from './calendar.js';
import { getElement } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');

  initNavToggle();
  initSearch();

  try {
    const noticias = await cargarNoticias();
    initCalendar(noticias);
    console.log(`✅ App lista - ${noticias.length} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
    showAppAlert('No se pudieron cargar las noticias. Verifique la conexión o recargue la página.');
  }
});

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



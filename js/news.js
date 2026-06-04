/**
 * Módulo de Noticias
 * ✅ FIX: img con src vacío reemplazado por placeholder con emoji
 */

import { sanitize, handleError, safeFetch, getElement } from './utils.js';

let allNoticias = [];

function normalizeFecha(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).substring(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function normalizeNoticia(noticia) {
  return {
    ...noticia,
    fecha: normalizeFecha(noticia.fecha),
    imagen: noticia.imagen || noticia.imagen_url || '',
    categoria: noticia.categoria || '',
    destacada: noticia.destacada === 1 || noticia.destacada === '1' || noticia.destacada === true,
    publicada: noticia.publicada === 1 || noticia.publicada === '1' || noticia.publicada === true
  };
}

const featuredOverride = {
  id: 'featured-proyecto-distrital',
  titulo: 'Proyecto Distrital Quilmes',
  texto: 'Presentamos la imagen del Proyecto Distrital del 28 de abril, destacada en la portada y en el calendario.',
  categoria: 'Proyecto Distrital',
  fecha: '2026-04-28',
  imagen: 'proyecto_distrital.jpg',
  destacada: 1
};

export async function cargarNoticias() {
  const cacheKey = 'jefatura_noticias_v1';
  try {
    const noticias = await safeFetch('/noticias');
    const normalized = Array.isArray(noticias) ? noticias.map(normalizeNoticia) : [];
    if (normalized.length) {
      allNoticias = normalized;
      // Guardar copia en cache para fallback offline
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: allNoticias }));
      } catch (e) {
        handleError(e, 'cargarNoticias.localStorage.setItem');
      }
    } else {
      allNoticias = normalized;
    }

    const hasFeaturedOverride = allNoticias.some(n => n.fecha === featuredOverride.fecha && n.imagen === featuredOverride.imagen);
    if (!hasFeaturedOverride) {
      allNoticias.unshift(featuredOverride);
    }

    renderNoticiaDestacada();
    renderNoticiasList();
    return allNoticias;
  } catch (err) {
    handleError(err, 'cargarNoticias');

    // Intentar cargar desde cache local
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        allNoticias = Array.isArray(cached?.data) ? cached.data.map(normalizeNoticia) : [];
        // Asegurar override destacado
        const hasFeaturedOverride = allNoticias.some(n => n.fecha === featuredOverride.fecha && n.imagen === featuredOverride.imagen);
        if (!hasFeaturedOverride) {
          allNoticias.unshift(featuredOverride);
        }
        showAppAlert('Cargando noticias desde caché (sin conexión).', 'info');
        renderNoticiaDestacada();
        renderNoticiasList();
        return allNoticias;
      }
    } catch (e) {
      handleError(e, 'cargarNoticias.parseCache');
    }

    // Si no hay cache disponible, mostrar mensaje de error en UI.
    // No reemplazamos la tarjeta destacada estática si ya existe.
    showErrorMessage('No se pudieron cargar las noticias. Intente nuevamente más tarde.');
    const grid = getElement('.grid-noticias');
    if (grid) {
      grid.innerHTML = '<div class="sin-noticias">No se pudieron cargar las noticias. Por favor recarga la página.</div>';
    }
    return [];
  }
}

function renderNoticiaDestacada() {
  const noticiaDestacada = getElement('.noticia-destacada');
  if (!noticiaDestacada) return;

  if (allNoticias.length === 0) {
    noticiaDestacada.innerHTML = `
      <div class="nd-imagen"><div style="font-size:80px;" aria-label="Icono de periódico">📰</div></div>
      <div class="nd-body">
        <div class="nd-tag" aria-label="Etiqueta: Noticias">📌 Noticias</div>
        <h3>Aún no hay noticias cargadas</h3>
        <p>Se mostrarán aquí las noticias que se agreguen desde la base de datos.</p>
        <div class="nd-meta">
          <time class="nd-fecha" aria-label="Sin fecha">📅 --</time>
          <a href="#" class="leer-mas" aria-label="Leer más">Leer más →</a>
        </div>
      </div>`;
    return;
  }

  const destacada = allNoticias.find(n => n.destacada || n.fecha === featuredOverride.fecha) || allNoticias[0];
  const imageSrc = destacada.imagen ? sanitize(destacada.imagen) : 'proyecto_distrital.jpg';

  const imagenHTML = imageSrc
    ? `<img src="${imageSrc}" alt="Imagen: ${sanitize(destacada.titulo)}" loading="lazy" onerror="this.onerror=null;this.src='logo_jefatura.jpg'" />`
    : `<div class="nd-imagen-emoji" aria-label="Icono de educación">🎓</div>`;

  noticiaDestacada.innerHTML = `
    <div class="nd-imagen">${imagenHTML}</div>
    <div class="nd-body">
      <div class="nd-tag" aria-label="Etiqueta: ${sanitize(destacada.categoria || 'Noticia')}">📌 ${sanitize(destacada.categoria || 'Noticia')}</div>
      <h3>${sanitize(destacada.titulo)}</h3>
      <p>${sanitize(destacada.texto)}</p>
      <div class="nd-meta">
        <time class="nd-fecha" datetime="${sanitize(destacada.fecha)}" aria-label="Fecha: ${sanitize(destacada.fecha)}">📅 ${sanitize(destacada.fecha)}</time>
        <a href="#" class="leer-mas" aria-label="Leer noticia completa">Leer más →</a>
      </div>
    </div>`;
}

function getFeaturedItem() {
  return allNoticias.find(n => n.destacada || n.fecha === featuredOverride.fecha) || allNoticias[0];
}

function getAvailableNoticias() {
  const featured = getFeaturedItem();
  return allNoticias.filter(n => String(n.id) !== String(featured?.id));
}

function renderNoticiasList(noticias = getAvailableNoticias().slice(0, 4)) {
  const grid = getElement('.grid-noticias');
  if (!grid) return;

  if (noticias.length === 0) {
    grid.innerHTML = '<div class="sin-noticias">No hay noticias previas para mostrar.</div>';
    return;
  }

  grid.innerHTML = '';
  noticias.forEach(noticia => {
    const card = document.createElement('a');
    card.href = '#';
    card.className = 'card-noticia';
    card.setAttribute('aria-label', `Leer: ${sanitize(noticia.titulo)}`);
    card.innerHTML = `
      <div class="cn-imagen azul" aria-label="Icono de noticia">📰</div>
      <div class="cn-body">
        <div class="cn-categoria">${sanitize(noticia.categoria || 'General')}</div>
        <h4>${sanitize(noticia.titulo)}</h4>
        <p>${sanitize(noticia.texto.substring(0, 100))}...</p>
        <div class="cn-footer">
          <time datetime="${sanitize(noticia.fecha)}" aria-label="Fecha: ${sanitize(noticia.fecha)}">📅 ${sanitize(noticia.fecha)}</time>
          <span aria-hidden="true">Leer →</span>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

export { renderNoticiasList };

export function initSearch() {
  const searchInput = getElement('#search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    if (!query) {
      clearAppAlert();
      renderNoticiasList();
      return;
    }

    const filtered = allNoticias.filter(noticia => {
      const text = `${noticia.titulo} ${noticia.texto} ${noticia.categoria}`.toLowerCase();
      return text.includes(query);
    });

    if (filtered.length === 0) {
      showAppAlert(`No se encontraron noticias para "${sanitize(query)}".`);
    } else {
      clearAppAlert();
    }

    renderNoticiasList(filtered.slice(0, 6));
  });
}

export function showAppAlert(message, type = 'info') {
  const alertBox = getElement('#app-alert');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.add('show');
  
  // Limpiar estilos anteriores
  alertBox.style.background = '';
  alertBox.style.borderColor = '';
  alertBox.style.color = '';
  
  if (type === 'error') {
    alertBox.style.background = '#ffe4e4';
    alertBox.style.borderColor = '#f3c1c1';
    alertBox.style.color = '#7a2727';
  } else if (type === 'success') {
    alertBox.style.background = '#e4f8e8';
    alertBox.style.borderColor = '#c1f3c9';
    alertBox.style.color = '#276a33';
  } else {
    alertBox.style.background = '#fff4dc';
    alertBox.style.borderColor = '#f3dab2';
    alertBox.style.color = '#5a4323';
  }

  // Auto-ocultar después de 5 segundos
  setTimeout(clearAppAlert, 5000);
}

function clearAppAlert() {
  const alertBox = getElement('#app-alert');
  if (!alertBox) return;
  alertBox.textContent = '';
  alertBox.classList.remove('show');
}

export function getNewsByDate(date) {
  const dateStr = date instanceof Date ? date.toISOString().slice(0, 10) : date;
  return allNoticias.filter(n => n.fecha === dateStr);
}

export function getAllNoticias() {
  return allNoticias;
}

function showErrorMessage(message) {
  showAppAlert(message, 'error');
  const grid = getElement('.grid-noticias');
  if (grid) {
    grid.innerHTML = `<div class="sin-noticias">${sanitize(message)}</div>`;
  }
}

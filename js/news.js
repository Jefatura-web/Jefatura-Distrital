/**
 * Módulo de Noticias
 * ✅ FIX: img con src vacío reemplazado por placeholder con emoji
 */

import { sanitize, handleError, apiFetch, getElement } from './utils.js';

let allNoticias = [];
let categorias = [];
let newsPage = 1;
let newsHasNext = false;
let newsLoading = false;
let newsRequestId = 0;
const NEWS_PAGE_SIZE = 12;

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
    imagenes: Array.isArray(noticia.imagenes) && noticia.imagenes.length
      ? noticia.imagenes
      : (noticia.imagen || noticia.imagen_url ? [noticia.imagen || noticia.imagen_url] : []),
    categoria: noticia.categoria || '',
    categoria_icono: noticia.categoria_icono || '',
    categoria_color: noticia.categoria_color || '',
    destacada: noticia.destacada === 1 || noticia.destacada === '1' || noticia.destacada === true,
    publicada: noticia.publicada === 1 || noticia.publicada === '1' || noticia.publicada === true
  };
}

function newsUrl(noticia) {
  return noticia.slug ? `/noticia/${encodeURIComponent(noticia.slug)}` : '#';
}

export async function cargarCategorias() {
  const selects = [
    { element: getElement('#news-category-filter'), first: 'Todas las categorías' },
    { element: getElement('#noticia-categoria'), first: 'Elegí una categoría' }
  ].filter(item => item.element);
  if (!selects.length) return [];

  try {
    const response = await apiFetch('/noticias/categorias');
    if (!Array.isArray(response)) throw new Error('La API devolvió categorías con un formato inesperado');
    categorias = response;
    for (const { element, first } of selects) {
      const current = element.value;
      element.disabled = false;
      element.replaceChildren(new Option(first, ''));
      response.forEach(category => {
        const option = new Option(`${category.icono || ''} ${category.nombre}`.trim(), String(category.id));
        option.dataset.nombre = category.nombre || '';
        option.dataset.icono = category.icono || '';
        option.dataset.color = /^#[\da-f]{6}$/i.test(category.color || '') ? category.color : '#1a3a7a';
        if (element.id === 'news-category-filter' && category.descripcion) {
          option.title = category.descripcion;
        }
        element.add(option);
      });
      if ([...element.options].some(option => option.value === current)) element.value = current;
      if (element.id === 'noticia-categoria') {
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return categorias;
  } catch (error) {
    handleError(error, 'cargarCategorias');
    for (const { element } of selects) {
      element.replaceChildren(new Option('No se pudieron cargar las categorías', ''));
      element.disabled = true;
    }
    throw error;
  }
}

export async function cargarNoticias({ append = false } = {}) {
  const search = getElement('#search-input')?.value.trim() || '';
  const categoryId = getElement('#news-category-filter')?.value || '';
  const cacheKey = `jefatura_noticias_v1:${encodeURIComponent(search)}:${encodeURIComponent(categoryId)}`;
  const requestId = ++newsRequestId;
  const grid = getElement('.grid-noticias');
  const loadMore = getElement('#news-load-more');
  const pageStatus = getElement('#news-pagination-status');
  newsLoading = true;
  if (!append) {
    newsPage = 1;
    if (grid) grid.setAttribute('aria-busy', 'true');
  }
  if (loadMore) {
    loadMore.disabled = true;
    loadMore.textContent = append ? 'Cargando…' : 'Cargar más noticias';
  }

  try {
    const params = new URLSearchParams({
      page: String(append ? newsPage + 1 : 1),
      limit: String(NEWS_PAGE_SIZE),
      paginated: 'true'
    });
    if (search) params.set('search', search);
    if (categoryId) params.set('categoria_id', categoryId);

    const response = await apiFetch(`/noticias?${params}`);
    if (requestId !== newsRequestId) return allNoticias;
    if (!Array.isArray(response?.data) || !response?.pagination) {
      throw new Error('La API devolvió un formato de noticias paginadas inesperado');
    }
    const normalized = response.data.map(normalizeNoticia);
    allNoticias = append ? [...allNoticias, ...normalized] : normalized;
    newsPage = response.pagination.page;
    newsHasNext = Boolean(response.pagination.hasNext);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: allNoticias }));
    } catch (error) {
      handleError(error, 'cargarNoticias.localStorage.setItem');
    }
    renderNoticiaDestacada();
    renderNoticiasList(getAvailableNoticias());
    if (pageStatus) {
      pageStatus.textContent = `Mostrando ${allNoticias.length} de ${response.pagination.total} noticias`;
    }
    if (loadMore) {
      loadMore.hidden = !newsHasNext;
      loadMore.disabled = false;
    }
    return allNoticias;
  } catch (err) {
    if (requestId !== newsRequestId) return allNoticias;
    handleError(err, 'cargarNoticias');

    if (!append) {
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          allNoticias = Array.isArray(cached?.data)
            ? cached.data
              .filter(noticia => noticia?.slug !== 'featured-proyecto-distrital' &&
                noticia?.id !== 'featured-proyecto-distrital')
              .map(normalizeNoticia)
            : [];
          showAppAlert('No se pudo actualizar el contenido. Mostrando la última copia guardada.', 'info');
          renderNoticiaDestacada();
          renderNoticiasList(getAvailableNoticias());
          return allNoticias;
        }
      } catch (error) {
        handleError(error, 'cargarNoticias.parseCache');
      }
    }

    if (!append) {
      allNoticias = [];
      renderNoticiaDestacada();
      const featured = getElement('.noticia-destacada');
      if (featured) {
        featured.innerHTML = `
          <div class="nd-body" role="alert">
            <p>No se pudo cargar la noticia destacada.</p>
            <button type="button" class="news-retry">Reintentar</button>
          </div>`;
        featured.querySelector('.news-retry')?.addEventListener('click', cargarNoticias);
      }
      showErrorMessage('No se pudieron cargar las noticias. Revisá la conexión e intentá nuevamente.');
    } else {
      showAppAlert('No se pudieron cargar más noticias. Intentá de nuevo.', 'error');
      if (loadMore) {
        loadMore.disabled = false;
        loadMore.textContent = 'Reintentar';
      }
    }
    return [];
  } finally {
    if (requestId === newsRequestId) {
      newsLoading = false;
      if (grid) grid.removeAttribute('aria-busy');
      if (loadMore && newsHasNext) {
        loadMore.disabled = false;
        loadMore.textContent = 'Cargar más noticias';
      }
    }
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

  const destacada = allNoticias.find(n => n.destacada) || allNoticias[0];
  const imageSrc = destacada.imagen || '';

  const imagenHTML = imageSrc
    ? `<img src="${sanitize(imageSrc)}" alt="Imagen: ${sanitize(destacada.titulo)}" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />`
    : `<div class="nd-imagen-emoji" aria-label="Icono de educación">🎓</div>`;
  const summary = destacada.descripcion || String(destacada.texto || '').substring(0, 240);

  noticiaDestacada.innerHTML = `
    <div class="nd-imagen">${imagenHTML}</div>
    <div class="nd-body">
      <div class="nd-tag" aria-label="Etiqueta: ${sanitize(destacada.categoria || 'Noticia')}">📌 ${sanitize(destacada.categoria || 'Noticia')}</div>
      <h3>${sanitize(destacada.titulo)}</h3>
      <p>${sanitize(summary)}</p>
      <div class="nd-meta">
        <time class="nd-fecha" datetime="${sanitize(destacada.fecha)}" aria-label="Fecha: ${sanitize(destacada.fecha)}">📅 ${sanitize(destacada.fecha)}</time>
        <a href="${sanitize(newsUrl(destacada))}" class="leer-mas" aria-label="Leer noticia completa">Leer más →</a>
      </div>
    </div>`;
}

function getFeaturedItem() {
  return allNoticias.find(n => n.destacada) || allNoticias[0];
}

function getAvailableNoticias() {
  const featured = getFeaturedItem();
  return allNoticias.filter(n => String(n.id) !== String(featured?.id));
}

function renderNoticiasList(noticias = getAvailableNoticias()) {
  const grid = getElement('.grid-noticias');
  if (!grid) return;

  // Inyectar controles del carrusel una sola vez
  if (!getElement('.carousel-controls')) {
    const controls = document.createElement('div');
    controls.className = 'carousel-controls';
    controls.setAttribute('aria-label', 'Controles del carrusel');
    controls.innerHTML = `
      <button class="carousel-btn carousel-prev" type="button" aria-label="Noticias anteriores">‹</button>
      <button class="carousel-btn carousel-next" type="button" aria-label="Noticias siguientes">›</button>`;
    grid.parentNode.insertBefore(controls, grid);

    controls.querySelector('.carousel-prev').addEventListener('click', () => {
      grid.scrollBy({ left: -280, behavior: 'smooth' });
    });
    controls.querySelector('.carousel-next').addEventListener('click', () => {
      grid.scrollBy({ left: 280, behavior: 'smooth' });
    });
  }

  if (noticias.length === 0) {
    grid.innerHTML = '<div class="sin-noticias">No hay noticias para mostrar.</div>';
    return;
  }

  grid.innerHTML = '';
  noticias.forEach(noticia => {
    const card = document.createElement('article');
    card.className = 'card-noticia';
    const icon = noticia.categoria_icono || '📰';
    const categoryColor = /^#[\da-f]{6}$/i.test(noticia.categoria_color || '')
      ? noticia.categoria_color
      : '#1a3a7a';
    const imgSrc = noticia.imagenes?.[0] || noticia.imagen || noticia.imagen_url || '';
    const imgHtml = imgSrc
      ? `<img src="${sanitize(imgSrc)}" alt="${sanitize(noticia.titulo)}" loading="lazy"
              onerror="this.onerror=null;this.parentNode.classList.add('cn-imagen-fallback');this.remove()">`
      : '';
    card.innerHTML = `
      <div class="cn-imagen" style="--category-color:${categoryColor}">${imgHtml}<span class="cn-emoji" aria-hidden="true">${sanitize(icon)}</span></div>
      <div class="cn-body">
        <div class="cn-categoria" style="--category-color:${categoryColor}">${sanitize(icon)} ${sanitize(noticia.categoria || 'General')}</div>
        <h4><a href="${sanitize(newsUrl(noticia))}">${sanitize(noticia.titulo)}</a></h4>
        <p>${sanitize(String(noticia.descripcion || noticia.texto || '').substring(0, 140))}…</p>
        <div class="cn-footer">
          <time datetime="${sanitize(noticia.fecha)}">📅 ${sanitize(noticia.fecha)}</time>
          <a class="cn-leer" href="${sanitize(newsUrl(noticia))}">Leer más →</a>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

export { renderNoticiasList };

export function initSearch() {
  const searchInput = getElement('#search-input');
  const categorySelect = getElement('#news-category-filter');
  const loadMore = getElement('#news-load-more');
  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      clearAppAlert();
      cargarNoticias();
    }, 300);
  });
  categorySelect?.addEventListener('change', () => {
    clearAppAlert();
    cargarNoticias();
  });
  loadMore?.addEventListener('click', () => cargarNoticias({ append: true }));
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
    grid.innerHTML = `<div class="sin-noticias" role="alert">${sanitize(message)} <button type="button" class="news-retry">Reintentar</button></div>`;
    grid.querySelector('.news-retry')?.addEventListener('click', cargarNoticias);
  }
}

// ── Modal de lectura de noticias ──────────────────────────────────────────────
let _noticiaKeyHandler = null;

export function mostrarNoticiaModal(noticia) {
  const modal = getElement('#modal-noticia');
  const body  = getElement('#noticia-modal-body');
  if (!modal || !body) return;

  const images = noticia.imagenes?.length
    ? noticia.imagenes
    : [noticia.imagen || noticia.imagen_url].filter(Boolean);
  const imgHtml = images.length
    ? `<div class="nm-galeria">${images.map((url, index) =>
      `<img src="${sanitize(url)}" alt="${sanitize(noticia.titulo)} — foto ${index + 1}"${index ? ' loading="lazy"' : ''} onerror="this.remove()">`
    ).join('')}</div>`
    : '';

  body.innerHTML = `
    ${imgHtml}
    <div class="nm-body">
      <span class="nm-categoria">${sanitize(noticia.categoria || 'General')}</span>
      <h2 id="noticia-modal-titulo">${sanitize(noticia.titulo)}</h2>
      <time class="nm-fecha">📅 ${sanitize(noticia.fecha)}</time>
      ${noticia.descripcion ? `<p class="nm-descripcion">${sanitize(noticia.descripcion)}</p>` : ''}
      <div class="nm-texto">${sanitize(noticia.texto || '').replace(/\n/g, '<br>')}</div>
    </div>`;

  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (_noticiaKeyHandler) document.removeEventListener('keydown', _noticiaKeyHandler);
  _noticiaKeyHandler = e => { if (e.key === 'Escape') cerrarNoticiaModal(); };
  document.addEventListener('keydown', _noticiaKeyHandler);
}

export function cerrarNoticiaModal() {
  const modal = getElement('#modal-noticia');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (_noticiaKeyHandler) {
    document.removeEventListener('keydown', _noticiaKeyHandler);
    _noticiaKeyHandler = null;
  }
}
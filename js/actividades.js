/**
 * Actividades de Inspectores (nivel.html)
 * Mejoras: resumen anual por mes, filtro de búsqueda, cards con overlay,
 *          carrusel con dots + swipe + teclado.
 */

import { apiFetch, getElement, sanitize, handleError } from './utils.js';

export const NIVELES = {
  'inicial':      { nombre: 'Nivel Inicial',       icono: '🧸' },
  'primaria':     { nombre: 'Nivel Primario',       icono: '📘' },
  'secundaria':   { nombre: 'Nivel Secundario',     icono: '🎓' },
  'tecnica':      { nombre: 'Educación Técnica',    icono: '⚙️' },
  'agraria':      { nombre: 'Educación Agraria',    icono: '🌾' },
  'superior':     { nombre: 'Nivel Superior',       icono: '🏛️' },
  'especial':     { nombre: 'Educación Especial',   icono: '♿' },
  'pcyps':        { nombre: 'PCYPS',                icono: '📋' },
  'dejayam':      { nombre: 'DEJAYAM',              icono: '🏃' },
  'ed-fisica':    { nombre: 'Educación Física',     icono: '⚽' },
  'ed-artistica': { nombre: 'Educación Artística',  icono: '🎨' }
};

const MESES_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun',
                     'Jul','Ago','Sep','Oct','Nov','Dic'];

const state = {
  nivel:        'todos',
  actividades:  [],
  mesActivo:    null,
  anioActivo:   '',
  filtroActivo: '',
  inspectorActivo: '',
  pagina: 1,
  paginacion: { total: 0, totalPages: 0, hasNext: false },
  filtros: null,
  meses: []
};
let filtersBound = false;
let openedDeepLinkId = '';
let activityRequestId = 0;
const ACTIVITY_PAGE_SIZE = 24;

// ── Helpers de fecha ──────────────────────────────────────────────────────────
const mesKey   = f  => String(f || '').substring(0, 7);
const mesLabel = k  => { const [a,m] = k.split('-').map(Number); return (a && m) ? `${MESES_FULL[m-1]} ${a}` : k; };
const mesCorto = k  => { const m = parseInt(k.split('-')[1], 10); return MESES_CORTO[m-1] || k; };
const getMesesDisponibles = () => state.meses.map(item => item.month);

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initNivelPage() {
  if (!getElement('#nivel-contenido')) return;
  const params = new URLSearchParams(window.location.search);
  const requestedNivel = params.get('nivel')?.toLowerCase().trim() || 'todos';
  const nivel = requestedNivel === 'todos' || NIVELES[requestedNivel] ? requestedNivel : '';
  const info = NIVELES[nivel];
  const titulo = getElement('#nivel-titulo');
  const icono  = getElement('#nivel-icono');

  if (!nivel) {
    if (titulo) titulo.textContent = 'Nivel no encontrado';
    const c = getElement('#nivel-contenido');
    if (c) c.innerHTML = '<div class="sin-actividades">El nivel solicitado no existe. Volvé al inicio.</div>';
    return;
  }

  state.nivel = nivel;
  if (titulo) titulo.textContent = info?.nombre || 'Actividades de Inspectores';
  if (icono)  icono.textContent  = info?.icono || '📚';
  document.title = `${info?.nombre || 'Actividades de Inspectores'} | Jefatura Distrital Quilmes`;
  const levelSelect = getElement('#nivel-filtro-nivel');
  if (levelSelect) levelSelect.value = nivel;
  const requestedYear = params.get('anio') || '';
  state.anioActivo = /^\d{4}$/.test(requestedYear) ? requestedYear : '';
  state.filtroActivo = normalizarTexto(params.get('q') || '');
  state.inspectorActivo = params.get('inspector') || '';
  const requestedMonth = params.get('mes') || '';
  state.mesActivo = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : null;
  if (state.mesActivo) state.anioActivo = state.mesActivo.substring(0, 4);
  const searchInput = getElement('#nivel-filtro');
  if (searchInput) searchInput.value = params.get('q') || '';
  const inspectorSelect = getElement('#nivel-filtro-inspector');
  if (inspectorSelect) inspectorSelect.value = state.inspectorActivo;
  const yearSelect = getElement('#nivel-filtro-anio');
  if (yearSelect) yearSelect.value = state.anioActivo;

  bindFilters();
  await cargarActividades(true, true);
}

async function cargarActividades(refreshFilters = false, initialize = false) {
  const requestId = ++activityRequestId;
  const contenedor = getElement('#nivel-contenido');
  const resumen    = getElement('#nivel-resumen');
  const tabs       = getElement('#nivel-meses');

  if (contenedor) {
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.innerHTML = '<div class="nivel-loading" role="status">Cargando actividades…</div>';
  }

  try {
    if (refreshFilters || !state.filtros) {
      const facetParams = new URLSearchParams();
      if (state.nivel !== 'todos') facetParams.set('nivel', state.nivel);
      if (state.anioActivo) facetParams.set('anio', state.anioActivo);
      const filters = await apiFetch(`/actividades/filtros${facetParams.size ? `?${facetParams}` : ''}`);
      if (requestId !== activityRequestId) return;
      state.filtros = filters;
      if (!Array.isArray(state.filtros?.years) || !Array.isArray(state.filtros?.inspectors) ||
          !Array.isArray(state.filtros?.months)) {
        throw new Error('La API devolvió opciones de filtro con un formato inesperado');
      }
      state.meses = state.filtros.months;
      if (state.anioActivo && !state.filtros.years.includes(state.anioActivo)) {
        state.anioActivo = '';
        state.mesActivo = null;
        return cargarActividades(true, initialize);
      }
      if (initialize && !state.mesActivo && !state.anioActivo &&
          !new URLSearchParams(window.location.search).has('actividad') && state.nivel !== 'todos') {
            const latestMonth = state.filtros.months[0]?.month;
        if (latestMonth) {
          state.anioActivo = latestMonth.substring(0, 4);
          state.mesActivo = latestMonth;
          return cargarActividades(true, false);
        }
      }
      renderInspectorOptions();
      renderYearOptions();
      renderResumenAnual();
      renderTabsMes(getMesesDisponibles());
    }

    const apiParams = new URLSearchParams({
      page: String(state.pagina),
      limit: String(ACTIVITY_PAGE_SIZE)
    });
    if (state.nivel !== 'todos') apiParams.set('nivel', state.nivel);
    if (state.anioActivo) apiParams.set('anio', state.anioActivo);
    if (state.mesActivo) apiParams.set('mes', state.mesActivo);
    if (state.inspectorActivo) apiParams.set('inspector', state.inspectorActivo);
    if (state.filtroActivo) apiParams.set('search', getElement('#nivel-filtro')?.value.trim() || '');
    const response = await apiFetch(`/actividades/pagina?${apiParams}`);
    if (requestId !== activityRequestId) return;
    if (!Array.isArray(response?.data) || !response?.pagination) {
      throw new Error('La API devolvió un formato de actividades paginadas inesperado');
    }
    state.actividades = response.data;
    state.paginacion = response.pagination;
    state.pagina = response.pagination.page;
    renderGrillaGrados();
    const linkedId = new URLSearchParams(window.location.search).get('actividad') || '';
    if (linkedId && linkedId !== openedDeepLinkId) {
      let linkedActivity = state.actividades.find(activity => String(activity.id) === linkedId);
      if (!linkedActivity) {
        try {
          linkedActivity = await apiFetch(`/actividades/${encodeURIComponent(linkedId)}`);
        } catch (error) {
          if (error?.status !== 404) throw error;
        }
      }
      if (requestId !== activityRequestId) return;
      if (linkedActivity && activityMatchesCurrentFilters(linkedActivity)) {
        openedDeepLinkId = linkedId;
        mostrarDetalle(linkedActivity);
      }
    }
  } catch (err) {
    if (requestId !== activityRequestId) return;
    handleError(err, 'cargarActividades');
    if (contenedor) {
      contenedor.innerHTML = '<div class="nivel-error" role="alert">No se pudieron cargar las actividades. Revisá tu conexión e intentá nuevamente. <button type="button" id="nivel-reintentar">Reintentar</button></div>';
      getElement('#nivel-reintentar')?.addEventListener('click', () => cargarActividades(true));
    }
  } finally {
    if (requestId === activityRequestId && contenedor) contenedor.removeAttribute('aria-busy');
  }
}

function renderInspectorOptions() {
  const select = getElement('#nivel-filtro-inspector');
  if (!select) return;

  const inspectors = state.filtros?.inspectors || [];
  const current = state.inspectorActivo;
  select.innerHTML = '<option value="">Todos los inspectores</option>' +
    inspectors.map(name => `<option value="${sanitize(name)}">${sanitize(name)}</option>`).join('');
  if (inspectors.includes(current)) select.value = current;
  else state.inspectorActivo = '';
}

function renderYearOptions() {
  const select = getElement('#nivel-filtro-anio');
  if (!select) return;
  const years = state.filtros?.years || [];
  select.innerHTML = '<option value="">Todos los años</option>' +
    years.map(year => `<option value="${year}">${year}</option>`).join('');
  if (years.includes(state.anioActivo)) select.value = state.anioActivo;
  else state.anioActivo = '';
}

// ── Resumen anual ─────────────────────────────────────────────────────────────
function renderResumenAnual() {
  const resumen = getElement('#nivel-resumen');
  if (!resumen || !state.meses.length) {
    if (resumen) resumen.replaceChildren();
    return;
  }

  const maxCount = Math.max(...state.meses.map(item => item.total), 1);

  resumen.innerHTML = `
    <div class="resumen-anual">
      <span class="resumen-titulo">${state.anioActivo ? `Resumen de ${state.anioActivo}` : 'Resumen por mes'} — clic para navegar</span>
      <div class="resumen-barras">
        ${state.meses.slice().reverse().map(({ month: key, total: count }) => {
          const pct    = Math.max(Math.round((count / maxCount) * 100), 8);
          const activo = key === state.mesActivo;
          return `
            <button type="button" class="resumen-mes${activo ? ' activo' : ''}" aria-pressed="${activo}" data-mes="${key}"
                    title="${mesLabel(key)}: ${count} actividad${count !== 1 ? 'es' : ''}">
              <span class="resumen-bar" style="--pct:${pct}%"></span>
              <span class="resumen-count">${count}</span>
              <span class="resumen-label">${mesCorto(key)}</span>
            </button>`;
        }).join('')}
      </div>
    </div>`;

  resumen.querySelectorAll('.resumen-mes').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mesActivo = btn.dataset.mes;
      const nextYear = btn.dataset.mes.substring(0, 4);
      const refreshFilters = state.anioActivo !== nextYear;
      state.anioActivo = nextYear;
      const yearSelect = getElement('#nivel-filtro-anio');
      if (yearSelect) yearSelect.value = state.anioActivo;
      state.pagina = 1;
      renderResumenAnual();
      renderTabsMes(getMesesDisponibles());
      updateActivityUrl();
      cargarActividades(refreshFilters);
    });
  });
}

// ── Pestañas de mes ───────────────────────────────────────────────────────────
function renderTabsMes(meses) {
  const tabs = getElement('#nivel-meses');
  if (!tabs) return;

  tabs.innerHTML = `
    <button id="nivel-mes-tab-todos" type="button" role="tab" aria-controls="nivel-contenido" tabindex="${state.mesActivo === null ? '0' : '-1'}" aria-selected="${state.mesActivo === null}" class="nivel-mes-tab${state.mesActivo === null ? ' activo' : ''}" data-mes="todos">
      Todo el historial
    </button>
    ${meses.map(key => `
    <button id="nivel-mes-tab-${sanitize(key)}" type="button" role="tab" aria-controls="nivel-contenido" tabindex="${key === state.mesActivo ? '0' : '-1'}" aria-selected="${key === state.mesActivo}" class="nivel-mes-tab${key === state.mesActivo ? ' activo' : ''}" data-mes="${sanitize(key)}">
      ${sanitize(mesLabel(key))}
    </button>`).join('')}`;
  const selectedTabId = state.mesActivo
    ? `nivel-mes-tab-${state.mesActivo}`
    : 'nivel-mes-tab-todos';
  getElement('#nivel-contenido')?.setAttribute('aria-labelledby', selectedTabId);

  const monthTabs = [...tabs.querySelectorAll('.nivel-mes-tab')];
  monthTabs.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      state.mesActivo = btn.dataset.mes === 'todos' ? null : btn.dataset.mes;
      const selectedYear = state.mesActivo?.substring(0, 4) || '';
      const refreshFilters = selectedYear !== state.anioActivo;
      state.anioActivo = selectedYear;
      const yearSelect = getElement('#nivel-filtro-anio');
      if (yearSelect) yearSelect.value = state.anioActivo;
      state.pagina = 1;
      renderTabsMes(getMesesDisponibles());
      getElement(`#${selectedTabId}`)?.focus();
      updateActivityUrl();
      cargarActividades(refreshFilters);
    });
    btn.addEventListener('keydown', event => {
      const nextIndex = event.key === 'ArrowRight'
        ? (index + 1) % monthTabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + monthTabs.length) % monthTabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? monthTabs.length - 1
              : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      monthTabs[nextIndex].focus();
      monthTabs[nextIndex].click();
    });
  });
}

// ── Filtro de búsqueda ────────────────────────────────────────────────────────
function bindFilters() {
  if (filtersBound) return;
  filtersBound = true;
  const input = getElement('#nivel-filtro');
  const inspector = getElement('#nivel-filtro-inspector');
  const year = getElement('#nivel-filtro-anio');
  const level = getElement('#nivel-filtro-nivel');
  const clear = getElement('#nivel-filtros-limpiar');
  let searchTimer;
  if (input) {
    input.addEventListener('input', () => {
      state.filtroActivo = normalizarTexto(input.value);
      state.pagina = 1;
      updateActivityUrl();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => cargarActividades(), 300);
    });
  }
  if (inspector) {
    inspector.addEventListener('change', () => {
      state.inspectorActivo = inspector.value;
      state.pagina = 1;
      updateActivityUrl();
      cargarActividades();
    });
  }
  year?.addEventListener('change', () => {
    state.anioActivo = year.value;
    state.mesActivo = null;
    state.pagina = 1;
    updateActivityUrl();
    cargarActividades(true);
  });
  level?.addEventListener('change', async () => {
    state.nivel = level.value;
    state.mesActivo = null;
    state.anioActivo = '';
    state.inspectorActivo = '';
    state.pagina = 1;
    openedDeepLinkId = '';
    const inspectorSelect = getElement('#nivel-filtro-inspector');
    if (inspectorSelect) inspectorSelect.value = '';
    if (year) year.value = '';
    const title = getElement('#nivel-titulo');
    const icon = getElement('#nivel-icono');
    const info = NIVELES[state.nivel];
    if (title) title.textContent = info?.nombre || 'Actividades de Inspectores';
    if (icon) icon.textContent = info?.icono || '📚';
    document.title = `${info?.nombre || 'Actividades de Inspectores'} | Jefatura Distrital Quilmes`;
    updateActivityUrl();
    await cargarActividades(true);
  });
  clear?.addEventListener('click', () => {
    if (input) input.value = '';
    if (inspector) inspector.value = '';
    if (year) year.value = '';
    state.filtroActivo = '';
    state.inspectorActivo = '';
    state.anioActivo = '';
    state.mesActivo = null;
    state.pagina = 1;
    openedDeepLinkId = '';
    updateActivityUrl();
    cargarActividades(true);
  });

  getElement('#activity-page-prev')?.addEventListener('click', () => {
    if (state.pagina <= 1) return;
    state.pagina -= 1;
    cargarActividades();
  });
  getElement('#activity-page-next')?.addEventListener('click', () => {
    if (!state.paginacion.hasNext) return;
    state.pagina += 1;
    cargarActividades();
  });
}

function normalizarTexto(value) {
  return String(value || '').trim().toLocaleLowerCase('es-AR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function activityMatchesCurrentFilters(activity) {
  if (state.nivel !== 'todos' && activity.nivel !== state.nivel) return false;
  if (state.mesActivo && mesKey(activity.mes) !== state.mesActivo) return false;
  if (state.anioActivo && mesKey(activity.mes).substring(0, 4) !== state.anioActivo) return false;
  if (state.inspectorActivo && activity.inspector_nombre !== state.inspectorActivo) return false;
  return !state.filtroActivo || normalizarTexto([
    activity.grado,
    activity.escuela,
    activity.inspector_nombre,
    activity.titulo,
    activity.descripcion
  ].join(' ')).includes(state.filtroActivo);
}

function updateActivityUrl(activityId = '') {
  const url = new URL(window.location.href);
  url.searchParams.set('nivel', state.nivel);
  for (const [key, value] of [
    ['anio', state.anioActivo],
    ['mes', state.mesActivo || ''],
    ['q', getElement('#nivel-filtro')?.value.trim() || ''],
    ['inspector', state.inspectorActivo],
    ['actividad', activityId]
  ]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState({}, '', url);
}

export async function cargarActividadesRecientes() {
  const list = getElement('#actividades-recientes');
  if (!list) return;
  list.innerHTML = '<li class="nivel-loading" role="status">Cargando actividades recientes…</li>';
  try {
    const activities = await apiFetch('/actividades/recientes');
    if (!Array.isArray(activities)) throw new Error('La API devolvió un formato de actividades inesperado');
    if (!activities.length) {
      list.innerHTML = '<li class="sin-actividades">Todavía no hay actividades publicadas.</li>';
      return;
    }
    list.innerHTML = activities.map(activity => {
      const level = NIVELES[activity.nivel] || { nombre: activity.nivel || 'Actividad', icono: '📋' };
      const url = new URL('nivel.html', window.location.href);
      url.searchParams.set('nivel', activity.nivel);
      url.searchParams.set('actividad', String(activity.id));
      const date = mesLabel(mesKey(activity.mes));
      const school = activity.escuela ? ` · ${sanitize(activity.escuela)}` : '';
      return `<li role="listitem">
        <a href="${sanitize(`${url.pathname.split('/').pop()}${url.search}`)}" class="novedad-item">
          <div class="novedad-icono ni-azul" aria-hidden="true">${sanitize(level.icono)}</div>
          <div class="novedad-texto">
            <h5>${sanitize(activity.titulo)}</h5>
            <time datetime="${sanitize(`${mesKey(activity.mes)}-01`)}">📅 ${sanitize(date)} · ${sanitize(level.nombre)}${school}</time>
          </div>
        </a>
      </li>`;
    }).join('');
  } catch (error) {
    handleError(error, 'cargarActividadesRecientes');
    list.innerHTML = '<li class="nivel-error" role="alert">No se pudieron cargar las actividades recientes. <button type="button" id="actividades-recientes-retry">Reintentar</button></li>';
    getElement('#actividades-recientes-retry')?.addEventListener('click', cargarActividadesRecientes);
  }
}

// ── Grilla de grados ──────────────────────────────────────────────────────────
function renderGrillaGrados() {
  const contenedor = getElement('#nivel-contenido');
  if (!contenedor) return;

  const delMes = state.actividades;

  const results = getElement('#nivel-resultados');
  if (results) {
    const dateLabel = state.mesActivo ? mesLabel(state.mesActivo) : state.anioActivo || 'todo el historial';
    results.textContent = `${state.paginacion.total} actividad${state.paginacion.total === 1 ? '' : 'es'} · ${dateLabel}`;
  }

  const previous = getElement('#activity-page-prev');
  const next = getElement('#activity-page-next');
  const pageStatus = getElement('#activity-page-status');
  if (previous) previous.disabled = state.pagina <= 1;
  if (next) next.disabled = !state.paginacion.hasNext;
  if (pageStatus) {
    pageStatus.textContent = state.paginacion.totalPages
      ? `Página ${state.pagina} de ${state.paginacion.totalPages}`
      : 'Sin páginas';
  }

  if (delMes.length === 0) {
    const hasFilters = state.filtroActivo || state.inspectorActivo || state.anioActivo ||
      state.mesActivo || new URLSearchParams(window.location.search).has('actividad');
    const msg = hasFilters
      ? 'No hay actividades que coincidan con los filtros elegidos.'
      : state.mesActivo
        ? 'No hay actividades cargadas para este mes.'
        : 'Todavía no hay actividades cargadas para este nivel.';
    contenedor.innerHTML = `<div class="sin-actividades">${msg}</div>`;
    return;
  }

  contenedor.innerHTML = `<div class="nivel-grid-grados">${delMes.map(cardGrado).join('')}</div>`;

  contenedor.querySelectorAll('.grado-card').forEach(card => {
    const actividad = delMes.find(a => String(a.id) === card.dataset.id);
    if (!actividad) return;
    const open = () => mostrarDetalle(actividad);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function cardGrado(actividad) {
  const primeraImg = (actividad.imagenes && actividad.imagenes[0]) || '';
  const cantFotos  = (actividad.imagenes || []).length;

  const imgHtml = primeraImg
    ? `<img src="${sanitize(primeraImg)}" alt="${sanitize(actividad.grado)}" loading="lazy"
            onerror="this.onerror=null;this.style.display='none'">`
    : '<div class="grado-sin-img">🖼️</div>';

  return `
    <article class="grado-card" data-id="${sanitize(String(actividad.id))}"
             tabindex="0" role="button" aria-label="Ver: ${sanitize(actividad.titulo)}">
      <div class="grado-imagen">
        ${imgHtml}
        <div class="grado-overlay">
          <span class="grado-overlay-grado">${sanitize(actividad.grado)}</span>
        </div>
        ${cantFotos > 1 ? `<span class="grado-badge-fotos">📷 ${cantFotos}</span>` : ''}
      </div>
      <div class="grado-body">
        <h4>${sanitize(actividad.titulo)}</h4>
        ${actividad.escuela ? `<p class="grado-escuela">${sanitize(actividad.escuela)}</p>` : ''}
        <p class="grado-inspector">${actividad.inspector_nombre ? `👤 ${sanitize(actividad.inspector_nombre)} · ` : ''}${sanitize(mesLabel(mesKey(actividad.mes)))}</p>
      </div>
    </article>`;
}

// ── Modal con carrusel ────────────────────────────────────────────────────────
function mostrarDetalle(actividad) {
  const modal = getElement('#nivel-detalle-modal');
  const body  = getElement('#nivel-detalle-body');
  if (!modal || !body) return;

  const imagenes = actividad.imagenes || [];
  const total    = imagenes.length;

  const slides = imagenes.map((url, i) => `
    <div class="foto-slide">
      <img src="${sanitize(url)}" alt="Foto ${i+1} de ${total}"
           loading="${i === 0 ? 'eager' : 'lazy'}"
           onerror="this.onerror=null;this.style.opacity='0'">
    </div>`).join('');

  const nav = total > 1 ? `
    <button class="foto-nav foto-prev" type="button" aria-label="Anterior">‹</button>
    <button class="foto-nav foto-next" type="button" aria-label="Siguiente">›</button>
    <div class="foto-dots">
      ${imagenes.map((_,i) => `<button class="foto-dot${i===0?' activo':''}" type="button" data-idx="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('')}
    </div>
    <div class="foto-counter"><span class="foto-actual">1</span> / ${total}</div>` : '';

  body.innerHTML = `
    <h3 id="detalle-titulo">${sanitize(actividad.titulo)}</h3>
    <p class="nivel-detalle-meta">
      ${sanitize(actividad.grado)} · ${sanitize(mesLabel(mesKey(actividad.mes)))}
      ${actividad.escuela ? ` · 🏫 ${sanitize(actividad.escuela)}` : ''}
      ${actividad.inspector_nombre ? ` · 👤 ${sanitize(actividad.inspector_nombre)}` : ''}
    </p>
    ${actividad.descripcion ? `<p class="nivel-detalle-texto">${sanitize(actividad.descripcion)}</p>` : ''}
    <div class="actividad-share-tools">
      <label for="actividad-share-url">Enlace para compartir</label>
      <div>
        <input id="actividad-share-url" type="url" readonly />
        <button id="actividad-share-copy" type="button">Copiar enlace</button>
        <button id="actividad-print" type="button">Imprimir</button>
      </div>
      <span id="actividad-share-status" role="status" aria-live="polite"></span>
    </div>
    ${total > 0 ? `
      <div class="foto-carousel" id="foto-carousel">
        <div class="foto-track" id="foto-track">${slides}</div>
        ${nav}
      </div>` : ''}`;

  if (total > 1) initCarousel(total);
  bindDetailModalKeys();

  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('nivel', state.nivel);
  shareUrl.searchParams.set('actividad', String(actividad.id));
  const shareInput = getElement('#actividad-share-url');
  if (shareInput) shareInput.value = shareUrl.href;
  getElement('#actividad-share-copy')?.addEventListener('click', async () => {
    const status = getElement('#actividad-share-status');
    try {
      await navigator.clipboard.writeText(shareUrl.href);
      if (status) status.textContent = 'Enlace copiado.';
    } catch (error) {
      handleError(error, 'copiar enlace de actividad');
      if (status) status.textContent = 'No se pudo copiar automáticamente. Seleccioná y copiá el enlace.';
      shareInput?.focus();
      shareInput?.select();
    }
  });
  getElement('#actividad-print')?.addEventListener('click', () => window.print());
  updateActivityUrl(String(actividad.id));

  _previousFocus = document.activeElement;
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  getElement('#nivel-detalle-cerrar')?.focus();
}

let _keyHandler = null;
let _previousFocus = null;
let _carouselGoTo = null;

function initCarousel(total) {
  const track = getElement('#foto-track');
  if (!track) return;
  let current = 0;
  const dots  = document.querySelectorAll('.foto-dot');

  const goTo = idx => {
    current = ((idx % total) + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    const counter = getElement('.foto-actual');
    if (counter) counter.textContent = current + 1;
    dots.forEach((d, i) => {
      d.classList.toggle('activo', i === current);
      d.setAttribute('aria-current', String(i === current));
    });
  };
  _carouselGoTo = delta => goTo(current + delta);

  getElement('.foto-prev')?.addEventListener('click', () => goTo(current - 1));
  getElement('.foto-next')?.addEventListener('click', () => goTo(current + 1));
  dots.forEach(dot => dot.addEventListener('click', () => goTo(parseInt(dot.dataset.idx, 10))));

  // Swipe táctil
  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1);
  });

}

function bindDetailModalKeys() {
  if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
  _keyHandler = e => {
    if (e.key === 'Escape') cerrarDetalle();
    const isEditingText = e.target instanceof HTMLElement &&
      e.target.matches('input, textarea, select, [contenteditable="true"]');
    if (!isEditingText && e.key === 'ArrowRight') _carouselGoTo?.(1);
    if (!isEditingText && e.key === 'ArrowLeft') _carouselGoTo?.(-1);
    if (e.key === 'Tab') {
      const focusable = [...modalFocusableElements()];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', _keyHandler);
}

function* modalFocusableElements() {
  const modal = getElement('#nivel-detalle-modal');
  if (!modal) return;
  yield* modal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]');
}

function cerrarDetalle() {
  const modal = getElement('#nivel-detalle-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  updateActivityUrl();
  openedDeepLinkId = '';
  renderGrillaGrados();
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  _carouselGoTo = null;
  if (_previousFocus instanceof HTMLElement) _previousFocus.focus();
  _previousFocus = null;
}

document.addEventListener('DOMContentLoaded', () => {
  initNivelPage();
  getElement('#nivel-detalle-cerrar')?.addEventListener('click', cerrarDetalle);
  getElement('#nivel-detalle-modal')?.addEventListener('click', e => {
    if (e.target.id === 'nivel-detalle-modal') cerrarDetalle();
  });
});
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
  nivel:        null,
  actividades:  [],
  mesActivo:    null,
  filtroActivo: '',
  inspectorActivo: ''
};

// ── Helpers de fecha ──────────────────────────────────────────────────────────
const mesKey   = f  => String(f || '').substring(0, 7);
const mesLabel = k  => { const [a,m] = k.split('-').map(Number); return (a && m) ? `${MESES_FULL[m-1]} ${a}` : k; };
const mesCorto = k  => { const m = parseInt(k.split('-')[1], 10); return MESES_CORTO[m-1] || k; };

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initNivelPage() {
  const nivel = new URLSearchParams(window.location.search).get('nivel')?.toLowerCase().trim() || '';
  const info  = NIVELES[nivel];
  const titulo = getElement('#nivel-titulo');
  const icono  = getElement('#nivel-icono');

  if (!info) {
    if (titulo) titulo.textContent = 'Nivel no encontrado';
    const c = getElement('#nivel-contenido');
    if (c) c.innerHTML = '<div class="sin-actividades">El nivel solicitado no existe. Volvé al inicio.</div>';
    return;
  }

  state.nivel = nivel;
  if (titulo) titulo.textContent = info.nombre;
  if (icono)  icono.textContent  = info.icono;
  document.title = `${info.nombre} | Jefatura Distrital Quilmes`;

  await cargarActividades();
}

async function cargarActividades() {
  const contenedor = getElement('#nivel-contenido');
  const resumen    = getElement('#nivel-resumen');
  const tabs       = getElement('#nivel-meses');

  if (contenedor) contenedor.innerHTML = '<div class="nivel-loading">Cargando actividades…</div>';
  if (resumen)    resumen.innerHTML    = '';
  if (tabs)       tabs.innerHTML       = '';

  try {
    const data = await apiFetch(`/actividades?nivel=${encodeURIComponent(state.nivel)}`);
    state.actividades = Array.isArray(data) ? data : [];

    if (state.actividades.length === 0) {
      if (contenedor) contenedor.innerHTML = '<div class="sin-actividades">Todavía no hay actividades cargadas para este nivel.</div>';
      return;
    }

    const meses = [...new Set(state.actividades.map(a => mesKey(a.mes)))].sort().reverse();
    state.mesActivo = meses[0];

    renderInspectorOptions();
    renderResumenAnual();
    renderTabsMes(meses);
    initFiltro();
    renderGrillaGrados();
  } catch (err) {
    handleError(err, 'cargarActividades');
    if (contenedor) contenedor.innerHTML = '<div class="nivel-error">No se pudieron cargar las actividades. Intentá más tarde.</div>';
  }
}

function renderInspectorOptions() {
  const select = getElement('#nivel-filtro-inspector');
  if (!select) return;

  const inspectors = [...new Set(state.actividades
    .map(activity => String(activity.inspector_nombre || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  select.innerHTML = '<option value="">Todos los inspectores</option>' +
    inspectors.map(name => `<option value="${sanitize(name)}">${sanitize(name)}</option>`).join('');
}

// ── Resumen anual ─────────────────────────────────────────────────────────────
function renderResumenAnual() {
  const resumen = getElement('#nivel-resumen');
  if (!resumen || state.actividades.length === 0) return;

  const porMes = {};
  state.actividades.forEach(a => { const k = mesKey(a.mes); porMes[k] = (porMes[k] || 0) + 1; });

  const meses    = [...new Set(state.actividades.map(a => mesKey(a.mes)))].sort();
  const maxCount = Math.max(...Object.values(porMes), 1);

  resumen.innerHTML = `
    <div class="resumen-anual">
      <span class="resumen-titulo">Resumen del año — clic para navegar al mes</span>
      <div class="resumen-barras">
        ${meses.map(key => {
          const count  = porMes[key] || 0;
          const pct    = Math.max(Math.round((count / maxCount) * 100), 8);
          const activo = key === state.mesActivo;
          return `
            <button type="button" class="resumen-mes${activo ? ' activo' : ''}" data-mes="${key}"
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
      const mesesActuales = [...new Set(state.actividades.map(a => mesKey(a.mes)))].sort().reverse();
      renderResumenAnual();
      renderTabsMes(mesesActuales);
      renderGrillaGrados();
    });
  });
}

// ── Pestañas de mes ───────────────────────────────────────────────────────────
function renderTabsMes(meses) {
  const tabs = getElement('#nivel-meses');
  if (!tabs) return;

  tabs.innerHTML = `
    <button type="button" role="tab" aria-selected="${state.mesActivo === null}" class="nivel-mes-tab${state.mesActivo === null ? ' activo' : ''}" data-mes="todos">
      Todo el historial
    </button>
    ${meses.map(key => `
    <button type="button" role="tab" aria-selected="${key === state.mesActivo}" class="nivel-mes-tab${key === state.mesActivo ? ' activo' : ''}" data-mes="${sanitize(key)}">
      ${sanitize(mesLabel(key))}
    </button>`).join('')}`;

  tabs.querySelectorAll('.nivel-mes-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mesActivo = btn.dataset.mes === 'todos' ? null : btn.dataset.mes;
      tabs.querySelectorAll('.nivel-mes-tab').forEach(b => {
        b.classList.remove('activo');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('activo');
      btn.setAttribute('aria-selected', 'true');
      renderResumenAnual();
      renderGrillaGrados();
    });
  });
}

// ── Filtro de búsqueda ────────────────────────────────────────────────────────
function initFiltro() {
  const input = getElement('#nivel-filtro');
  const inspector = getElement('#nivel-filtro-inspector');
  const clear = getElement('#nivel-filtros-limpiar');
  if (input) {
    input.value = '';
    state.filtroActivo = '';
    input.addEventListener('input', () => {
      state.filtroActivo = normalizarTexto(input.value);
      renderGrillaGrados();
    });
  }
  if (inspector) {
    inspector.value = '';
    state.inspectorActivo = '';
    inspector.addEventListener('change', () => {
      state.inspectorActivo = inspector.value;
      renderGrillaGrados();
    });
  }
  clear?.addEventListener('click', () => {
    if (input) input.value = '';
    if (inspector) inspector.value = '';
    state.filtroActivo = '';
    state.inspectorActivo = '';
    state.mesActivo = null;
    const meses = [...new Set(state.actividades.map(activity => mesKey(activity.mes)))].sort().reverse();
    renderResumenAnual();
    renderTabsMes(meses);
    renderGrillaGrados();
  });
}

function normalizarTexto(value) {
  return String(value || '').trim().toLocaleLowerCase('es-AR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Grilla de grados ──────────────────────────────────────────────────────────
function renderGrillaGrados() {
  const contenedor = getElement('#nivel-contenido');
  if (!contenedor) return;

  let delMes = state.mesActivo
    ? state.actividades.filter(a => mesKey(a.mes) === state.mesActivo)
    : [...state.actividades];

  delMes = delMes.filter(activity => {
    const searchable = normalizarTexto([
      activity.grado,
      activity.inspector_nombre,
      activity.titulo,
      activity.descripcion
    ].join(' '));
    const matchesSearch = !state.filtroActivo || searchable.includes(state.filtroActivo);
    const matchesInspector = !state.inspectorActivo || activity.inspector_nombre === state.inspectorActivo;
    return matchesSearch && matchesInspector;
  });

  const results = getElement('#nivel-resultados');
  if (results) {
    const dateLabel = state.mesActivo ? mesLabel(state.mesActivo) : 'todo el historial';
    results.textContent = `${delMes.length} de ${state.actividades.length} actividades · ${dateLabel}`;
  }

  if (delMes.length === 0) {
    const hasFilters = state.filtroActivo || state.inspectorActivo;
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
      ${imagenes.map((_,i) => `<span class="foto-dot${i===0?' activo':''}" data-idx="${i}"></span>`).join('')}
    </div>
    <div class="foto-counter"><span class="foto-actual">1</span> / ${total}</div>` : '';

  body.innerHTML = `
    <h3 id="detalle-titulo">${sanitize(actividad.titulo)}</h3>
    <p class="nivel-detalle-meta">
      ${sanitize(actividad.grado)} · ${sanitize(mesLabel(mesKey(actividad.mes)))}
      ${actividad.inspector_nombre ? ` · 👤 ${sanitize(actividad.inspector_nombre)}` : ''}
    </p>
    ${actividad.descripcion ? `<p class="nivel-detalle-texto">${sanitize(actividad.descripcion)}</p>` : ''}
    ${total > 0 ? `
      <div class="foto-carousel" id="foto-carousel">
        <div class="foto-track" id="foto-track">${slides}</div>
        ${nav}
      </div>` : ''}`;

  if (total > 1) initCarousel(total);

  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

let _keyHandler = null;

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
    dots.forEach((d, i) => d.classList.toggle('activo', i === current));
  };

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

  // Teclado
  if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
  _keyHandler = e => {
    if (e.key === 'ArrowRight') goTo(current + 1);
    if (e.key === 'ArrowLeft')  goTo(current - 1);
    if (e.key === 'Escape')     cerrarDetalle();
  };
  document.addEventListener('keydown', _keyHandler);
}

function cerrarDetalle() {
  const modal = getElement('#nivel-detalle-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
}

document.addEventListener('DOMContentLoaded', () => {
  initNivelPage();
  getElement('#nivel-detalle-cerrar')?.addEventListener('click', cerrarDetalle);
  getElement('#nivel-detalle-modal')?.addEventListener('click', e => {
    if (e.target.id === 'nivel-detalle-modal') cerrarDetalle();
  });
});
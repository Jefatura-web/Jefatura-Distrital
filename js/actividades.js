/**
 * Módulo de Actividades de Inspectores (página nivel.html)
 * Mismo patrón que news.js/calendar.js: fetch + normalize + render, usando utils.js.
 */

import { apiFetch, getElement, sanitize, handleError } from './utils.js';

export const NIVELES = {
  'inicial':       { nombre: 'Nivel Inicial',        icono: '🧸' },
  'primaria':      { nombre: 'Nivel Primario',       icono: '📘' },
  'secundaria':    { nombre: 'Nivel Secundario',     icono: '🎓' },
  'tecnica':       { nombre: 'Educación Técnica',    icono: '⚙️' },
  'agraria':       { nombre: 'Educación Agraria',    icono: '🌾' },
  'superior':      { nombre: 'Nivel Superior',       icono: '🏛️' },
  'especial':      { nombre: 'Educación Especial',   icono: '♿' },
  'pcyps':         { nombre: 'PCYPS',                icono: '📋' },
  'dejayam':       { nombre: 'DEJAYAM',               icono: '🏃' },
  'ed-fisica':     { nombre: 'Educación Física',     icono: '⚽' },
  'ed-artistica':  { nombre: 'Educación Artística',  icono: '🎨' }
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const state = {
  nivel: null,
  actividades: [],   // todas las actividades del nivel, ya traídas del server
  mesActivo: null    // 'YYYY-MM'
};

function getNivelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('nivel') || '').toLowerCase().trim();
}

function mesKey(fechaStr) {
  // fechaStr viene como 'YYYY-MM-DD' o Date serializado por mysql2; nos quedamos con YYYY-MM
  return String(fechaStr || '').substring(0, 7);
}

function mesLabel(key) {
  const [anio, mesNum] = key.split('-').map(Number);
  if (!anio || !mesNum) return key;
  return `${MESES[mesNum - 1]} ${anio}`;
}

export async function initNivelPage() {
  const nivel = getNivelFromUrl();
  const info = NIVELES[nivel];

  const titulo = getElement('#nivel-titulo');
  const icono = getElement('#nivel-icono');

  if (!info) {
    if (titulo) titulo.textContent = 'Nivel no encontrado';
    const contenedor = getElement('#nivel-contenido');
    if (contenedor) {
      contenedor.innerHTML = '<div class="sin-actividades">El nivel solicitado no existe. Volvé al inicio e ingresá desde el menú "Sede de Inspectores".</div>';
    }
    return;
  }

  state.nivel = nivel;
  if (titulo) titulo.textContent = info.nombre;
  if (icono) icono.textContent = info.icono;
  document.title = `${info.nombre} | Jefatura Distrital Quilmes`;

  await cargarActividades();
}

async function cargarActividades() {
  const contenedor = getElement('#nivel-contenido');
  const tabsMes = getElement('#nivel-meses');
  if (contenedor) contenedor.innerHTML = '<div class="nivel-loading">Cargando actividades…</div>';

  try {
    const actividades = await apiFetch(`/actividades?nivel=${encodeURIComponent(state.nivel)}`);
    state.actividades = Array.isArray(actividades) ? actividades : [];

    if (state.actividades.length === 0) {
      if (tabsMes) tabsMes.innerHTML = '';
      if (contenedor) {
        contenedor.innerHTML = '<div class="sin-actividades">Todavía no hay actividades cargadas para este nivel.</div>';
      }
      return;
    }

    const meses = [...new Set(state.actividades.map(a => mesKey(a.mes)))].sort().reverse();
    state.mesActivo = meses[0];

    renderTabsMes(meses);
    renderGrillaGrados();
  } catch (error) {
    handleError(error, 'cargarActividades');
    if (contenedor) {
      contenedor.innerHTML = '<div class="nivel-error">No se pudieron cargar las actividades. Intentá nuevamente más tarde.</div>';
    }
  }
}

function renderTabsMes(meses) {
  const tabsMes = getElement('#nivel-meses');
  if (!tabsMes) return;

  tabsMes.innerHTML = meses.map(key => `
    <button type="button" class="nivel-mes-tab${key === state.mesActivo ? ' activo' : ''}" data-mes="${sanitize(key)}">
      ${sanitize(mesLabel(key))}
    </button>
  `).join('');

  tabsMes.querySelectorAll('.nivel-mes-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mesActivo = btn.dataset.mes;
      tabsMes.querySelectorAll('.nivel-mes-tab').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      renderGrillaGrados();
    });
  });
}

function renderGrillaGrados() {
  const contenedor = getElement('#nivel-contenido');
  if (!contenedor) return;

  const delMes = state.actividades.filter(a => mesKey(a.mes) === state.mesActivo);

  if (delMes.length === 0) {
    contenedor.innerHTML = '<div class="sin-actividades">No hay actividades cargadas para este mes.</div>';
    return;
  }

  contenedor.innerHTML = `<div class="nivel-grid-grados">${delMes.map(cardGrado).join('')}</div>`;

  contenedor.querySelectorAll('.grado-card').forEach(card => {
    card.addEventListener('click', () => {
      const actividad = delMes.find(a => String(a.id) === card.dataset.id);
      if (actividad) mostrarDetalle(actividad);
    });
  });
}

function cardGrado(actividad) {
  const primeraImagen = (actividad.imagenes && actividad.imagenes[0]) || '';
  const imgHtml = primeraImagen
    ? `<img src="${sanitize(primeraImagen)}" alt="Foto de ${sanitize(actividad.grado)}" loading="lazy" onerror="this.onerror=null;this.src='logo_jefatura.jpg'">`
    : '<div class="grado-imagen-placeholder">🖼️</div>';

  const cantidadFotos = (actividad.imagenes || []).length;

  return `
    <article class="grado-card" data-id="${sanitize(String(actividad.id))}" tabindex="0" role="button" aria-label="Ver detalle de ${sanitize(actividad.grado)}">
      <div class="grado-imagen">${imgHtml}${cantidadFotos > 1 ? `<span class="grado-badge-fotos">📷 ${cantidadFotos}</span>` : ''}</div>
      <div class="grado-body">
        <div class="grado-nombre">${sanitize(actividad.grado)}</div>
        <h4>${sanitize(actividad.titulo)}</h4>
        ${actividad.inspector_nombre ? `<p class="grado-inspector">👤 ${sanitize(actividad.inspector_nombre)}</p>` : ''}
      </div>
    </article>`;
}

function mostrarDetalle(actividad) {
  const modal = getElement('#nivel-detalle-modal');
  const body = getElement('#nivel-detalle-body');
  if (!modal || !body) return;

  const galeria = (actividad.imagenes || []).map(url => `
    <img src="${sanitize(url)}" alt="Foto de ${sanitize(actividad.grado)}" loading="lazy" onerror="this.onerror=null;this.style.display='none'">
  `).join('');

  body.innerHTML = `
    <h3>${sanitize(actividad.titulo)}</h3>
    <p class="nivel-detalle-meta">${sanitize(actividad.grado)} · ${sanitize(mesLabel(mesKey(actividad.mes)))}${actividad.inspector_nombre ? ` · ${sanitize(actividad.inspector_nombre)}` : ''}</p>
    ${actividad.descripcion ? `<p class="nivel-detalle-texto">${sanitize(actividad.descripcion)}</p>` : ''}
    ${galeria ? `<div class="nivel-detalle-galeria">${galeria}</div>` : ''}
  `;

  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

function cerrarDetalle() {
  const modal = getElement('#nivel-detalle-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  initNivelPage();
  getElement('#nivel-detalle-cerrar')?.addEventListener('click', cerrarDetalle);
  getElement('#nivel-detalle-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'nivel-detalle-modal') cerrarDetalle();
  });
});

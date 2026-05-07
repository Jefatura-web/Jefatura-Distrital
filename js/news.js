/**
 * Módulo de Noticias
 * ✅ FIX: img con src vacío reemplazado por placeholder con emoji
 */

import { sanitize, handleError, safeFetch, getElement } from './utils.js';

let allNoticias = [];

export async function cargarNoticias() {
  try {
    allNoticias = await safeFetch('/noticias');
    renderNoticiaDestacada();
    renderNoticiasList();
    return allNoticias;
  } catch (err) {
    handleError(err, 'cargarNoticias');
    showErrorMessage('No se pudieron cargar las noticias');
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

  const destacada = allNoticias[0];

  // ✅ FIX: si no hay imagen, mostrar placeholder con emoji en vez de <img src="">
  const imagenHTML = destacada.imagen
    ? `<img src="${sanitize(destacada.imagen)}" alt="Imagen: ${sanitize(destacada.titulo)}" style="width:100%;height:100%;object-fit:cover;" />`
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

function renderNoticiasList() {
  const grid = getElement('.grid-noticias');
  if (!grid) return;

  const noticias = allNoticias.slice(1, 3);
  
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

export function getNewsByDate(date) {
  const dateStr = date instanceof Date ? date.toISOString().slice(0, 10) : date;
  return allNoticias.filter(n => n.fecha === dateStr);
}

export function getAllNoticias() {
  return allNoticias;
}

function showErrorMessage(message) {
  const grid = getElement('.grid-noticias');
  if (grid) {
    grid.innerHTML = `<div class="sin-noticias">${sanitize(message)}</div>`;
  }
}

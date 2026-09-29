/**
 * Utilidades compartidas del cliente
 * Incluye: helpers DOM, fetch seguro, formateo y resolución de la URL de API.
 * (Absorbe el ex-archivo apiConfig.js)
 */

// ── API base URL ─────────────────────────────────────────────────────────────
// Orden de prioridad:
//  1. window.JEFATURA_API_BASE_URL  (inyectado en el HTML para producción)
//  2. localhost:3000                (desarrollo local)
//  3. mismo origen que el frontend  (Render: Express sirve estática + API juntas)
export function getApiBaseUrl() {
  if (window.JEFATURA_API_BASE_URL) return window.JEFATURA_API_BASE_URL;

  const { hostname, port, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
export function apiFetch(path, options = {}) {
  const url = new URL(path, getApiBaseUrl()).href;
  return safeFetch(url, options);
}

export async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const body     = await response.text();
    let   data     = null;
    try { data = body ? JSON.parse(body) : null; } catch { data = body; }

    if (!response.ok) {
      const error    = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status   = response.status;
      error.body     = data;
      throw error;
    }
    return data;
  } catch (error) {
    handleError(error, `safeFetch(${url})`);
    throw error;
  }
}

// ── DOM ───────────────────────────────────────────────────────────────────────
export function getElement(selector) {
  try   { return document.querySelector(selector); }
  catch (e) { handleError(e, `getElement(${selector})`); return null; }
}

export function getElements(selector) {
  try   { return document.querySelectorAll(selector); }
  catch (e) { handleError(e, `getElements(${selector})`); return []; }
}

// ── Sanitización ──────────────────────────────────────────────────────────────
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Fechas ────────────────────────────────────────────────────────────────────
export function formatDate(date) {
  if (!(date instanceof Date)) return '';
  return date.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

export function dateToISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0, 10);
}

// ── Errores ───────────────────────────────────────────────────────────────────
export function handleError(error, context = 'Error') {
  console.error(`[${context}]`, error?.message || error);
}
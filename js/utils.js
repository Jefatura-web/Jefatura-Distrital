/**
 * Módulo de utilidades - Funciones compartidas
 */

export function sanitize(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatDate(date) {
  if (!(date instanceof Date)) return '';
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function dateToISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0, 10);
}

export function handleError(error, context = 'Error') {
  const message = error?.message || String(error);
  console.error(`[${context}] ${message}`);
}

export async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    handleError(error, `safeFetch(${url})`);
    throw error;
  }
}

export function getElement(selector) {
  try {
    return document.querySelector(selector);
  } catch (error) {
    handleError(error, `getElement(${selector})`);
    return null;
  }
}

export function getElements(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (error) {
    handleError(error, `getElements(${selector})`);
    return [];
  }
}

/**
 * Módulo de utilidades - Funciones compartidas
 */

import { getApiBaseUrl } from './apiConfig.js';

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

export function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl).href;
  return safeFetch(url, options);
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
    const body = await response.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch (parseError) {
      data = body;
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.body = data;
      throw error;
    }

    return data;
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

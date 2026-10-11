
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

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export async function safeFetch(url, options = {}) {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let callerAborted = false;
  const abortFromCaller = () => {
    callerAborted = true;
    controller.abort(callerSignal?.reason);
  };
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(new Error('Tiempo de espera agotado')), timeoutMs)
    : null;

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
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
    if (controller.signal.aborted) {
      const aborted = new Error(callerAborted
        ? 'La solicitud fue cancelada.'
        : 'El servidor tardó demasiado en responder. Intentá nuevamente.');
      aborted.name = callerAborted ? 'AbortError' : 'TimeoutError';
      aborted.code = callerAborted ? 'ABORT_ERR' : 'ETIMEDOUT';
      if (!callerAborted) handleError(aborted, `safeFetch(${url})`);
      throw aborted;
    }
    handleError(error, `safeFetch(${url})`);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
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

export function safeUrl(value, { base = window.location.href, allowRelative = true } = {}) {
  const candidate = String(value ?? '').trim();
  if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return '';
  try {
    const parsed = new URL(candidate, base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (!allowRelative && !/^[a-z][a-z\d+.-]*:/i.test(candidate)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

// ── Fechas ────────────────────────────────────────────────────────────────────
export function parseLocalDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function formatDate(value, options = {}) {
  const date = parseLocalDate(value);
  if (!date) return '';
  return date.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...options
  });
}

export function dateToISO(date) {
  const localDate = parseLocalDate(date);
  if (!localDate) return '';
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Errores ───────────────────────────────────────────────────────────────────
export function handleError(error, context = 'Error') {
  console.error(`[${context}]`, error?.message || error);
}
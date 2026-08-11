export function getApiBaseUrl() {
  if (window.JEFATURA_API_BASE_URL) {
    return window.JEFATURA_API_BASE_URL;
  }

  const hostname = window.location.hostname;
  const port = window.location.port;

  // En desarrollo local, el backend Express corre en el puerto 3000.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  return `${window.location.protocol}//${hostname}${port ? `:${port}` : ''}`;
}

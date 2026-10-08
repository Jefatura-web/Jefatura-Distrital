const crypto = require('crypto');

const SESSION_COOKIE = 'jefatura_admin_session';
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const sessions = new Map();

function timingSafeEqual(a, b) {
  const valueA = Buffer.from(String(a || ''));
  const valueB = Buffer.from(String(b || ''));
  return valueA.length === valueB.length && crypto.timingSafeEqual(valueA, valueB);
}

function getSessionId(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.find(part => part.trim().startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return '';
  return cookie.trim().slice(SESSION_COOKIE.length + 1);
}

function isAdminSession(req, now = Date.now()) {
  const sessionId = getSessionId(req);
  if (!sessionId) return false;

  const key = crypto.createHash('sha256').update(sessionId).digest('hex');
  const expiresAt = sessions.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    sessions.delete(key);
    return false;
  }
  return true;
}

function createAdminSession(res, now = Date.now()) {
  for (const [key, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(key);
  }

  const sessionId = crypto.randomBytes(32).toString('base64url');
  const key = crypto.createHash('sha256').update(sessionId).digest('hex');
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  sessions.set(key, expiresAt);

  const attributes = [
    `${SESSION_COOKIE}=${sessionId}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearAdminSession(req, res) {
  const sessionId = getSessionId(req);
  if (sessionId) {
    const key = crypto.createHash('sha256').update(sessionId).digest('hex');
    sessions.delete(key);
  }

  const attributes = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function requireAuth(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    console.error('[adminAuth] ADMIN_TOKEN no está configurado en las variables de entorno.');
    return res.status(500).json({ error: 'Autenticación no configurada en el servidor' });
  }
  if (!isAdminSession(req)) {
    return res.status(401).json({ error: 'La sesión administrativa expiró o no es válida. Ingresá nuevamente.' });
  }
  next();
}

function createLoginAttemptLimiter({ limit = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attemptsByIp = new Map();
  const keyFor = req => String(req.ip || req.socket?.remoteAddress || 'unknown');

  function check(req, res, next) {
    const key = keyFor(req);
    const attempts = (attemptsByIp.get(key) || []).filter(timestamp => timestamp > now() - windowMs);
    if (attempts.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((attempts[0] + windowMs - now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ ok: false, error: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.' });
    }
    attemptsByIp.set(key, attempts);
    next();
  }

  function recordFailure(req) {
    const key = keyFor(req);
    const attempts = (attemptsByIp.get(key) || []).filter(timestamp => timestamp > now() - windowMs);
    attempts.push(now());
    attemptsByIp.set(key, attempts);
  }

  function clear(req) {
    attemptsByIp.delete(keyFor(req));
  }

  return { check, recordFailure, clear };
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  timingSafeEqual,
  isAdminSession,
  createAdminSession,
  clearAdminSession,
  requireAuth,
  createLoginAttemptLimiter
};

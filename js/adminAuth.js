const crypto = require('crypto');

const SESSION_COOKIE = 'jefatura_admin_session';
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const sessions = new Map();
let database = null;

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    database.query(sql, values, (error, result) => error ? reject(error) : resolve(result));
  });
}

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

function sessionHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

async function isAdminSession(req, now = Date.now()) {
  const sessionId = getSessionId(req);
  if (!sessionId) return false;

  const key = sessionHash(sessionId);
  if (database) {
    const rows = await query(
      'SELECT session_hash FROM admin_sessions WHERE session_hash = ? AND expires_at > ? LIMIT 1',
      [key, new Date(now)]
    );
    return rows.length > 0;
  }

  if (process.env.NODE_ENV === 'production') return false;
  const expiresAt = sessions.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    sessions.delete(key);
    return false;
  }
  return true;
}

function setSessionCookie(res, sessionId, expiresAt, maxAge) {
  const attributes = [
    `${SESSION_COOKIE}=${sessionId}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

async function createAdminSession(res, now = Date.now()) {
  for (const [key, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(key);
  }

  const sessionId = crypto.randomBytes(32).toString('base64url');
  const key = sessionHash(sessionId);
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;

  if (database) {
    await query(
      'INSERT INTO admin_sessions (session_hash, expires_at) VALUES (?, ?)',
      [key, new Date(expiresAt)]
    );
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Almacenamiento de sesiones no disponible.');
  } else {
    sessions.set(key, expiresAt);
  }

  setSessionCookie(res, sessionId, expiresAt, SESSION_TTL_SECONDS);
}

async function clearAdminSession(req, res) {
  const sessionId = getSessionId(req);
  if (sessionId) {
    const key = sessionHash(sessionId);
    if (database) {
      await query('DELETE FROM admin_sessions WHERE session_hash = ?', [key]);
    } else {
      sessions.delete(key);
    }
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

function requireCsrf(req, res, next) {
  const origin = String(req.get('origin') || '');
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (origin !== expectedOrigin || fetchSite === 'cross-site' ||
      req.get('x-requested-with') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'La solicitud no pudo validarse. Recargá la página e intentá nuevamente.' });
  }
  next();
}

async function requireAuth(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    console.error('[adminAuth] ADMIN_TOKEN no está configurado.');
    return res.status(500).json({ error: 'Autenticación no configurada en el servidor' });
  }
  try {
    if (!await isAdminSession(req)) {
      return res.status(401).json({ error: 'La sesión administrativa expiró o no es válida. Ingresá nuevamente.' });
    }
    next();
  } catch (error) {
    console.error('[adminAuth] No se pudo consultar la sesión administrativa:', error.code || error.name);
    return res.status(503).json({ error: 'No se pudo validar la sesión. Intentá nuevamente en unos minutos.' });
  }
}

function setDatabase(db) {
  database = db;
}

function purgeExpiredSessions(callback = () => {}) {
  if (!database) return callback(new Error('Almacenamiento de sesiones no disponible.'));
  database.query('DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP', error => {
    callback(error || null);
  });
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
  sessionHash,
  isAdminSession,
  createAdminSession,
  clearAdminSession,
  requireAuth,
  requireCsrf,
  setDatabase,
  purgeExpiredSessions,
  createLoginAttemptLimiter
};

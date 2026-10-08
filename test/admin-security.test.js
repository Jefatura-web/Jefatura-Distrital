const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');

process.env.ADMIN_TOKEN = 'test-admin-token-with-sufficient-length';

const adminAuth = require('../js/adminAuth');
const noticiasRoutes = require('../js/noticiasRoutes');
const uploadRoutes = require('../js/uploadController');
const { detectImageMime, imageMimeMatches } = require('../js/uploadController');

const app = express();
app.use(express.json());
app.use('/noticias', noticiasRoutes);
app.use('/upload', uploadRoutes);
app.get('/test/protected', adminAuth.requireAuth, (_req, res) => res.json({ ok: true }));

const server = app.listen(0, '127.0.0.1');
const baseUrl = new Promise((resolve, reject) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`));
  server.once('error', reject);
});

after(() => new Promise(resolve => server.close(resolve)));

test('admin sessions use HttpOnly cookies, expire and can be revoked', () => {
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name.toLowerCase(), value) };
  const createdAt = 1_800_000_000_000;
  adminAuth.createAdminSession(response, createdAt);

  const cookieHeader = headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  assert.match(cookieHeader, /Max-Age=7200/);
  const cookie = cookieHeader.split(';')[0];
  const request = { headers: { cookie } };

  assert.equal(adminAuth.isAdminSession(request, createdAt + 1000), true);
  assert.equal(adminAuth.isAdminSession(request, createdAt + adminAuth.SESSION_TTL_SECONDS * 1000), false);

  adminAuth.createAdminSession(response, createdAt);
  const activeRequest = { headers: { cookie: headers.get('set-cookie').split(';')[0] } };
  adminAuth.clearAdminSession(activeRequest, response);
  assert.match(headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(adminAuth.isAdminSession(activeRequest, createdAt + 1000), false);
});

test('login verification sets a session cookie, rejects wrong tokens and rate limits failures', async () => {
  const url = await baseUrl;
  const invalid = await fetch(`${url}/noticias/admin/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'wrong-token' })
  });
  assert.equal(invalid.status, 403);

  const valid = await fetch(`${url}/noticias/admin/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: process.env.ADMIN_TOKEN })
  });
  assert.equal(valid.status, 200);
  const cookie = valid.headers.get('set-cookie').split(';')[0];

  const session = await fetch(`${url}/noticias/admin/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  const protectedWithoutCookie = await fetch(`${url}/test/protected`, {
    headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
  });
  assert.equal(protectedWithoutCookie.status, 401);
  const protectedWithCookie = await fetch(`${url}/test/protected`, { headers: { Cookie: cookie } });
  assert.equal(protectedWithCookie.status, 200);

  const form = new FormData();
  form.append('image', new Blob(['not actually a PNG'], { type: 'image/png' }), 'fake.png');
  const invalidImage = await fetch(`${url}/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form
  });
  assert.equal(invalidImage.status, 400);
  assert.match((await invalidImage.json()).error, /no coincide/);

  const noSession = await fetch(`${url}/noticias/admin/session`);
  assert.equal(noSession.status, 401);

  const logout = await fetch(`${url}/noticias/admin/session`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(logout.status, 200);
  const revoked = await fetch(`${url}/noticias/admin/session`, { headers: { Cookie: cookie } });
  assert.equal(revoked.status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${url}/noticias/admin/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' })
    });
    assert.equal(response.status, 403);
  }
  const limited = await fetch(`${url}/noticias/admin/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'wrong-token' })
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('server detects supported image signatures and rejects MIME mismatches', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const gif = Buffer.from('GIF89a');
  const webp = Buffer.from('RIFF0000WEBP');
  const avif = Buffer.from('0000ftypavif');
  const heic = Buffer.from('0000ftypheic');

  assert.equal(detectImageMime(jpeg), 'image/jpeg');
  assert.equal(detectImageMime(png), 'image/png');
  assert.equal(detectImageMime(gif), 'image/gif');
  assert.equal(detectImageMime(webp), 'image/webp');
  assert.equal(detectImageMime(avif), 'image/avif');
  assert.equal(detectImageMime(heic), 'image/heic');
  assert.equal(detectImageMime(Buffer.from('not an image')), null);
  assert.equal(imageMimeMatches('image/jpeg', 'image/png'), false);
  assert.equal(imageMimeMatches('image/heif', 'image/heic'), true);
});

test('login limiter rejects the sixth failure and resets after the window', () => {
  let now = 10_000;
  const limiter = adminAuth.createLoginAttemptLimiter({ limit: 5, windowMs: 1000, now: () => now });
  const req = { ip: '192.0.2.1' };
  let statusCode;
  const res = {
    setHeader() {},
    status(value) {
      statusCode = value;
      return this;
    },
    json() {
      return this;
    }
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    let passed = false;
    limiter.check(req, res, () => { passed = true; });
    assert.equal(passed, true);
    limiter.recordFailure(req);
  }

  limiter.check(req, res, () => assert.fail('sixth check should be rate limited'));
  assert.equal(statusCode, 429);
  now += 1001;
  let passed = false;
  limiter.check(req, res, () => { passed = true; });
  assert.equal(passed, true);
});

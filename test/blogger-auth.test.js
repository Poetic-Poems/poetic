'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');

const {
  waitForCode,
  generateState,
  generatePkce,
} = require('../src/tools/blogger-auth');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Fire the OAuth redirect at the loopback server, retrying briefly while it
// binds. Resolves with the HTTP status code.
function hitCallback(port, query) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/${query}`, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED' && attempts < 20) {
          attempts += 1;
          setTimeout(attempt, 25);
        } else {
          reject(err);
        }
      });
    };
    attempt();
  });
}

test('generateState produces distinct URL-safe values', () => {
  const a = generateState();
  const b = generateState();
  assert.notStrictEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('generatePkce challenge is base64url(sha256(verifier))', () => {
  const { verifier, challenge } = generatePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  const expected = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.strictEqual(challenge, expected);
});

test('waitForCode resolves the code when the returned state matches', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const status = await hitCallback(port, '?code=auth-code&state=expected-state');
  assert.strictEqual(status, 200);
  assert.strictEqual(await pending, 'auth-code');
});

test('waitForCode rejects a callback whose state does not match', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  // Attach the rejection assertion before firing the callback, so the
  // rejection is never momentarily unhandled.
  const rejection = assert.rejects(pending, /State parameter mismatch/);
  const status = await hitCallback(port, '?code=auth-code&state=forged');
  assert.strictEqual(status, 400);
  await rejection;
});

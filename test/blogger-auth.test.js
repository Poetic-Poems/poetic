'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const readline = require('readline');
const { PassThrough } = require('stream');

const {
  waitForCode,
  generateState,
  generatePkce,
  describeBlogAccess,
  saveFileMode0600,
  promptHidden,
  escapeHtml,
  buildConsentUrl,
  exchangeCodeForTokens,
  lookupBlogId,
  listMyBlogs,
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

// Like hitCallback, but resolves with both the status code and the response
// body, for tests that need to inspect the rendered HTML.
function hitCallbackWithBody(port, query) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/${query}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
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

test('waitForCode ignores a callback carrying neither code nor error, whatever its state', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  // A request with no code and no error — a browser favicon fetch, say — is
  // ignored rather than treated as a state mismatch, even though its absent
  // state does not match the expected one.
  assert.strictEqual(await hitCallback(port, 'favicon.ico'), 404);
  // The server is still listening, so the genuine callback still completes.
  assert.strictEqual(await hitCallback(port, '?code=auth-code&state=expected-state'), 200);
  assert.strictEqual(await pending, 'auth-code');
});

// ── waitForCode: error branch ───────────────────────────────────────────────

test('waitForCode rejects with the error message when state matches', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const rejection = assert.rejects(pending, /OAuth error: access_denied/);
  const { status, body } = await hitCallbackWithBody(port, '?error=access_denied&state=expected-state');
  assert.strictEqual(status, 400);
  assert.match(body, /access_denied/);
  await rejection;
});

test('waitForCode treats an error callback with missing state as a CSRF mismatch', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const rejection = assert.rejects(pending, /State parameter mismatch/);
  const { status, body } = await hitCallbackWithBody(port, '?error=access_denied');
  assert.strictEqual(status, 400);
  assert.match(body, /State mismatch/);
  // The unescaped error value must never reach the response when the state
  // check itself is what rejected the request.
  assert.doesNotMatch(body, /access_denied/);
  await rejection;
});

test('waitForCode treats an error callback with mismatched state as a CSRF mismatch', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const rejection = assert.rejects(pending, /State parameter mismatch/);
  const status = await hitCallback(port, '?error=access_denied&state=forged');
  assert.strictEqual(status, 400);
  await rejection;
});

test('waitForCode HTML-escapes a malformed error value before rendering it', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const rejection = assert.rejects(pending, /OAuth error:/);
  const maliciousError = '<img src=x onerror=alert(1)>';
  const { status, body } = await hitCallbackWithBody(
    port,
    `?${new URLSearchParams({ error: maliciousError, state: 'expected-state' }).toString()}`
  );
  assert.strictEqual(status, 400);
  assert.doesNotMatch(body, /<img/);
  assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  await rejection;
});

// ── escapeHtml ───────────────────────────────────────────────────────────────

test('escapeHtml escapes &, <, >, and "', () => {
  assert.strictEqual(
    escapeHtml('<img src=x onerror=alert(1)> & "quoted"'),
    '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'
  );
});

// ── promptHidden ──────────────────────────────────────────────────────────────

test('promptHidden resolves with the typed value', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.on('data', () => {}); // drain
  const rl = readline.createInterface({ input, output, terminal: true });

  const pending = promptHidden(rl, 'Enter your BLOGGER_CLIENT_SECRET: ');
  input.write('super-secret');
  input.write('\n');
  assert.strictEqual(await pending, 'super-secret');
  rl.close();
});

test('promptHidden never writes the typed characters to the output stream', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let captured = '';
  output.on('data', (chunk) => {
    captured += chunk.toString();
  });
  // terminal: true so the interface echoes keystrokes the same way a real
  // tty session would — the exact path promptHidden must suppress.
  const rl = readline.createInterface({ input, output, terminal: true });

  const question = 'Enter your BLOGGER_CLIENT_SECRET: ';
  const pending = promptHidden(rl, question);
  input.write('s');
  input.write('3');
  input.write('c');
  input.write('r');
  input.write('3');
  input.write('t');
  input.write('\n');
  await pending;
  rl.close();

  assert.doesNotMatch(captured, /s3cr3t/);
  assert.match(captured, new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('promptHidden restores the original output-writing behaviour for later questions', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let captured = '';
  output.on('data', (chunk) => {
    captured += chunk.toString();
  });
  const rl = readline.createInterface({ input, output, terminal: true });

  const hiddenPending = promptHidden(rl, 'secret: ');
  input.write('hidden-value\n');
  await hiddenPending;

  captured = '';
  const visiblePending = new Promise(resolve => rl.question('name: ', resolve));
  input.write('visible-value\n');
  assert.strictEqual(await visiblePending, 'visible-value');
  rl.close();

  assert.match(captured, /visible-value/);
});

// ── describeBlogAccess ────────────────────────────────────────────────────────

const BLOG_ID = '7781143180070523245';
const MINE = { id: BLOG_ID, name: 'Fragments and Unity', url: 'https://fragments-and-unity.blogspot.com/' };
const OTHER = { id: '999', name: 'Other Blog', url: 'https://other.blogspot.com/' };

test('describeBlogAccess: unrecognised account is not ok and explains Workspace', () => {
  const { ok, text } = describeBlogAccess({ recognised: false, blogs: [] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, /does not recognise this account/);
  assert.match(text, /Workspace/);
  // \s+ rather than a literal space: the guidance is hard-wrapped for a terminal.
  assert.match(text, /caller does not have\s+permission/);
});

test('describeBlogAccess: account owning no blogs is not ok', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, /does not administer any blogs/);
});

test('describeBlogAccess: configured blog present is ok and marked in the list', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [MINE, OTHER] }, BLOG_ID);
  assert.strictEqual(ok, true);
  assert.match(text, /can manage these blogs/);
  assert.match(text, new RegExp(`${BLOG_ID}.*Fragments and Unity.*← blogger\\.blog_id`));
  // Only the configured blog is marked.
  assert.doesNotMatch(text, /999.*←/);
});

test('describeBlogAccess: configured blog absent is not ok and lists the alternatives', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [OTHER] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, new RegExp(`cannot manage blog ${BLOG_ID}`));
  assert.match(text, /999 {2}Other Blog/);
  assert.match(text, /before saving these credentials/);
});

test('describeBlogAccess: blog_id matched as a string when config yields a number', () => {
  // YAML parses an unquoted blog_id as a number; the ids from Blogger are strings.
  const { ok } = describeBlogAccess({ recognised: true, blogs: [{ ...MINE, id: '999' }] }, 999);
  assert.strictEqual(ok, true);
});

test('describeBlogAccess: no configured blog_id lists blogs and says to set one', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [MINE] }, null);
  assert.strictEqual(ok, true);
  assert.match(text, /Copy the ID/);
  assert.match(text, /quoted/);
  assert.doesNotMatch(text, /←/);
});

// ── buildConsentUrl ──────────────────────────────────────────────────────────

test('buildConsentUrl constructs a URL with all required OAuth parameters', () => {
  const clientId = 'test-client-id.apps.googleusercontent.com';
  const redirectUri = 'http://localhost:4753';
  const state = 'test-state-value';
  const codeChallenge = 'test-code-challenge';

  const url = buildConsentUrl(clientId, redirectUri, state, codeChallenge);

  assert.strictEqual(url.searchParams.get('client_id'), clientId);
  assert.strictEqual(url.searchParams.get('redirect_uri'), redirectUri);
  assert.strictEqual(url.searchParams.get('response_type'), 'code');
  assert.strictEqual(url.searchParams.get('access_type'), 'offline');
  assert.strictEqual(url.searchParams.get('prompt'), 'select_account consent');
  assert.strictEqual(url.searchParams.get('state'), state);
  assert.strictEqual(url.searchParams.get('code_challenge'), codeChallenge);
  assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
});

test('buildConsentUrl includes the required Blogger scope', () => {
  const url = buildConsentUrl('client-id', 'http://localhost:4753', 'state', 'challenge');
  const scope = url.searchParams.get('scope');
  assert.strictEqual(scope, 'https://www.googleapis.com/auth/blogger');
});

test('buildConsentUrl returns a URL pointing to Google OAuth endpoint', () => {
  const url = buildConsentUrl('client-id', 'http://localhost:4753', 'state', 'challenge');
  assert.match(url.href, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
});

test('buildConsentUrl generates unique URLs for different states and PKCE challenges', () => {
  const url1 = buildConsentUrl('client-id', 'http://localhost:4753', 'state1', 'challenge1');
  const url2 = buildConsentUrl('client-id', 'http://localhost:4753', 'state2', 'challenge2');
  assert.notStrictEqual(url1.toString(), url2.toString());
  assert.strictEqual(url1.searchParams.get('state'), 'state1');
  assert.strictEqual(url2.searchParams.get('state'), 'state2');
  assert.strictEqual(url1.searchParams.get('code_challenge'), 'challenge1');
  assert.strictEqual(url2.searchParams.get('code_challenge'), 'challenge2');
});

test('buildConsentUrl uses S256 (SHA256) as the PKCE challenge method', () => {
  const { challenge } = generatePkce();
  const url = buildConsentUrl('client-id', 'http://localhost:4753', 'state', challenge);
  assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
  // Ensure the challenge is passed through correctly
  assert.strictEqual(url.searchParams.get('code_challenge'), challenge);
});

// ── saveFileMode0600 ──────────────────────────────────────────────────────────

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blogger-auth-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('saveFileMode0600 creates a new file with mode 0600', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.blogger-credentials.json');
    saveFileMode0600(target, JSON.stringify({ refresh_token: 'first-token' }));
    assert.strictEqual(fs.readFileSync(target, 'utf8'), JSON.stringify({ refresh_token: 'first-token' }));
    assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
  });
});

test('saveFileMode0600 overwrites a pre-existing read-only (0400) file, ending up at mode 0600', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.blogger-credentials.json');
    fs.writeFileSync(target, JSON.stringify({ refresh_token: 'stale-token' }), { mode: 0o400 });
    fs.chmodSync(target, 0o400);

    saveFileMode0600(target, JSON.stringify({ refresh_token: 'fresh-token' }));

    const reloaded = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(reloaded.refresh_token, 'fresh-token');
    assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);
  });
});

test('saveFileMode0600 leaves no temp file behind after a successful save', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.blogger-credentials.json');
    saveFileMode0600(target, JSON.stringify({ refresh_token: 'token' }));
    const entries = fs.readdirSync(dir);
    assert.deepStrictEqual(entries, ['.blogger-credentials.json']);
  });
});

// ── exchangeCodeForTokens / lookupBlogId / listMyBlogs (issue #237) ─────────
//
// The pure request-shaping logic main() delegates to for the OAuth token
// exchange and the post-auth Blogger checks — already extracted out of
// main() (mirroring sync-blogger.js's getAccessToken/listAccessibleBlogs),
// just never unit tested. main()'s own body stays interactive I/O
// (readline prompts, the real loopback server) and is intentionally left
// untested.

// Swaps global.fetch for the duration of `run`, mirroring
// test/sync-blogger.test.js's withMockFetch.
async function withMockFetch(mockFetch, run) {
  const original = global.fetch;
  global.fetch = mockFetch;
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

function jsonResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// ── exchangeCodeForTokens ────────────────────────────────────────────────────

test('exchangeCodeForTokens: posts the authorization_code grant and resolves with the parsed tokens', async () => {
  let capturedUrl, capturedInit;
  const tokens = await withMockFetch(
    async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, { access_token: 'ACCESS', refresh_token: 'REFRESH' });
    },
    () => exchangeCodeForTokens({
      clientId: 'cid', clientSecret: 'csec', code: 'CODE', redirectUri: 'http://localhost:4753', codeVerifier: 'VERIFIER',
    })
  );

  assert.deepStrictEqual(tokens, { access_token: 'ACCESS', refresh_token: 'REFRESH' });
  assert.strictEqual(capturedUrl, 'https://oauth2.googleapis.com/token');
  assert.strictEqual(capturedInit.method, 'POST');
  assert.strictEqual(capturedInit.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(capturedInit.body);
  assert.strictEqual(body.get('client_id'), 'cid');
  assert.strictEqual(body.get('client_secret'), 'csec');
  assert.strictEqual(body.get('code'), 'CODE');
  assert.strictEqual(body.get('redirect_uri'), 'http://localhost:4753');
  assert.strictEqual(body.get('grant_type'), 'authorization_code');
  assert.strictEqual(body.get('code_verifier'), 'VERIFIER');
});

test('exchangeCodeForTokens: omits code_verifier from the body when none is given', async () => {
  let capturedInit;
  await withMockFetch(
    async (url, init) => { capturedInit = init; return jsonResponse(200, {}); },
    () => exchangeCodeForTokens({ clientId: 'cid', clientSecret: 'csec', code: 'CODE', redirectUri: 'http://localhost:4753' })
  );
  const body = new URLSearchParams(capturedInit.body);
  assert.strictEqual(body.has('code_verifier'), false);
});

test('exchangeCodeForTokens: throws with the response body on a non-ok response', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(400, { error: 'invalid_grant' }),
      () => exchangeCodeForTokens({ clientId: 'cid', clientSecret: 'csec', code: 'BAD', redirectUri: 'http://localhost:4753' })
    ),
    /Token exchange failed: HTTP 400/
  );
});

// ── lookupBlogId ──────────────────────────────────────────────────────────────

test('lookupBlogId: sends the blog URL as a query param and the token as a Bearer header', async () => {
  let capturedUrl, capturedInit;
  const data = await withMockFetch(
    async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, { id: '42', name: 'My Blog' });
    },
    () => lookupBlogId('https://myblog.blogspot.com', 'ACCESS-TOKEN')
  );

  assert.deepStrictEqual(data, { id: '42', name: 'My Blog' });
  assert.strictEqual(
    capturedUrl,
    'https://www.googleapis.com/blogger/v3/blogs/byurl?url=https%3A%2F%2Fmyblog.blogspot.com'
  );
  assert.strictEqual(capturedInit.headers.Authorization, 'Bearer ACCESS-TOKEN');
});

test('lookupBlogId: throws with the response body on a non-ok response', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(404, { error: 'not found' }),
      () => lookupBlogId('https://myblog.blogspot.com', 'ACCESS-TOKEN')
    ),
    /Blog lookup failed: HTTP 404/
  );
});

// ── listMyBlogs ───────────────────────────────────────────────────────────────

test('listMyBlogs: recognised=false on a 403 (Blogger not enabled for the account)', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(403, {}),
    () => listMyBlogs('ACCESS-TOKEN')
  );
  assert.deepStrictEqual(result, { recognised: false, blogs: [] });
});

test('listMyBlogs: maps items to { id, name, url }, coercing id to a string', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(200, { items: [{ id: 999, name: 'Blog A', url: 'https://a.example/' }] }),
    () => listMyBlogs('ACCESS-TOKEN')
  );
  assert.deepStrictEqual(result, {
    recognised: true,
    blogs: [{ id: '999', name: 'Blog A', url: 'https://a.example/' }],
  });
});

test('listMyBlogs: recognised=true with no blogs when items is absent', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(200, {}),
    () => listMyBlogs('ACCESS-TOKEN')
  );
  assert.deepStrictEqual(result, { recognised: true, blogs: [] });
});

test('listMyBlogs: sends the token as a Bearer header', async () => {
  let capturedInit;
  await withMockFetch(
    async (url, init) => { capturedInit = init; return jsonResponse(200, {}); },
    () => listMyBlogs('MY-TOKEN')
  );
  assert.strictEqual(capturedInit.headers.Authorization, 'Bearer MY-TOKEN');
});

test('listMyBlogs: throws with the response body on a non-403 non-ok response', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(500, { error: 'server error' }),
      () => listMyBlogs('ACCESS-TOKEN')
    ),
    /Blog list failed: HTTP 500/
  );
});

'use strict';

/**
 * Regression tests for the stored-XSS fix in serve-static.js's directory
 * listing (commit 3eb8bd9, CodeQL code-scanning-alert-5): entry names read
 * from the filesystem, and the requested path, must be HTML-escaped before
 * they're interpolated into the generated listing page, and hrefs must be
 * percent-encoded.
 *
 * serve-static.js has no module.exports and starts a real HTTP server as a
 * side effect of being loaded (`server.listen(...)` at the top level), so it
 * can't be required directly in a test. Instead, its source is compiled into
 * a throwaway Module with http.createServer stubbed out (so no socket is
 * actually opened) and a controlled --dir argv (so the startup directory
 * check passes without touching the real `public/`), then the pure helpers
 * are pulled off by appending an export statement to the in-memory source —
 * the file on disk is never modified.
 *
 * The `http.createServer` stub also captures the request-handler callback
 * the module passes to it. That captured function is the same one a real
 * deployment wires up, so it's handed to a *second*, unstubbed
 * `http.createServer` bound to an ephemeral port, and driven with real
 * `http.request` calls below — exercising the actual request path (routing,
 * headers, streaming) rather than a re-implementation of it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVE_STATIC_PATH = path.join(__dirname, '..', 'src', 'tools', 'serve-static.js');
const PATH_GUARD_PATH = path.join(path.dirname(SERVE_STATIC_PATH), 'path-guard.js');

function loadServeStaticInternals(dirForStartupCheck, extraArgs = [], { pathGuardOverrides } = {}) {
  const source = fs.readFileSync(SERVE_STATIC_PATH, 'utf8');
  const patched = `${source}\nmodule.exports = { escapeHtml, encodeHref, generateDirectoryListing, CORS_HEADERS, HOST };\n`;

  const originalArgv = process.argv;
  const originalCreateServer = http.createServer;
  const originalPathGuardCacheEntry = require.cache[PATH_GUARD_PATH];
  let capturedRequestHandler = null;
  http.createServer = (handler) => {
    capturedRequestHandler = handler;
    return { listen() {} };
  };
  process.argv = [process.argv[0], SERVE_STATIC_PATH, '--dir', dirForStartupCheck, '--port', '0', ...extraArgs];

  if (pathGuardOverrides) {
    const real = require(PATH_GUARD_PATH);
    require.cache[PATH_GUARD_PATH] = {
      id: PATH_GUARD_PATH,
      filename: PATH_GUARD_PATH,
      loaded: true,
      exports: { ...real, ...pathGuardOverrides },
    };
  }

  try {
    const mod = new Module(SERVE_STATIC_PATH, module);
    mod.filename = SERVE_STATIC_PATH;
    mod.paths = Module._nodeModulePaths(path.dirname(SERVE_STATIC_PATH));
    mod._compile(patched, SERVE_STATIC_PATH);
    return { ...mod.exports, requestHandler: capturedRequestHandler };
  } finally {
    process.argv = originalArgv;
    http.createServer = originalCreateServer;
    if (pathGuardOverrides) {
      if (originalPathGuardCacheEntry) {
        require.cache[PATH_GUARD_PATH] = originalPathGuardCacheEntry;
      } else {
        delete require.cache[PATH_GUARD_PATH];
      }
    }
  }
}

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Async counterpart of withTempDir: `fn` returns a Promise, so the temp dir
// must survive until that promise settles, not just until `fn` returns.
async function withTempDirAsync(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-test-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Runs `fn(port)` against a real server wrapping `requestHandler`, closing
// the server (and thus releasing the port) once `fn`'s promise settles.
function withRunningServer(requestHandler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(requestHandler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      Promise.resolve()
        .then(() => fn(port))
        .then(
          (result) => server.close(() => resolve(result)),
          (err) => server.close(() => reject(err))
        );
    });
  });
}

function httpGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: requestPath, method: 'GET' },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('escapeHtml escapes &, <, >, ", and \'', () => {
  withTempDir((dir) => {
    const { escapeHtml } = loadServeStaticInternals(dir);
    assert.strictEqual(
      escapeHtml('<script>alert(\'x\')</script> & "quoted"'),
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;'
    );
  });
});

test('encodeHref percent-encodes each path segment', () => {
  withTempDir((dir) => {
    const { encodeHref } = loadServeStaticInternals(dir);
    assert.strictEqual(
      encodeHref('a dir/<script>.html'),
      'a%20dir/%3Cscript%3E.html'
    );
    // A crafted "javascript:" segment is percent-encoded, not left as a scheme.
    assert.strictEqual(encodeHref('javascript:alert(1)'), 'javascript%3Aalert(1)');
  });
});

test('generateDirectoryListing escapes a hostile filename and encodes its href', () => {
  withTempDir((dir) => {
    // A real filename can never contain "/" (it's the path separator), so a
    // hostile name can carry an opening tag but not a matching "</script>"
    // closer — enough to prove escapeHtml runs on entry names.
    const hostileName = '<script>alert(1)>.txt';
    fs.writeFileSync(path.join(dir, hostileName), 'content');

    const { generateDirectoryListing } = loadServeStaticInternals(dir);
    const html = generateDirectoryListing(dir, '/');

    assert.ok(
      !html.includes('<script>alert(1)>.txt'),
      'raw hostile filename must not appear unescaped in the listing HTML'
    );
    assert.ok(
      html.includes('&lt;script&gt;alert(1)&gt;.txt'),
      'hostile filename must appear HTML-escaped as inert text'
    );
    assert.ok(
      html.includes(encodeURIComponent(hostileName)),
      'href for the hostile filename must be percent-encoded'
    );
  });
});

test('generateDirectoryListing escapes a relative path containing HTML', () => {
  withTempDir((dir) => {
    const hostileDirName = '<img src=x onerror=alert(1)>';
    fs.mkdirSync(path.join(dir, hostileDirName));

    const { generateDirectoryListing } = loadServeStaticInternals(dir);
    const html = generateDirectoryListing(dir, `/${hostileDirName}`);

    assert.ok(
      !html.includes(`<div class="path">${hostileDirName}</div>`),
      'raw hostile relative path must not appear unescaped'
    );
    assert.ok(
      html.includes('&lt;img src=x onerror=alert(1)&gt;'),
      'hostile relative path must appear HTML-escaped as inert text'
    );
  });
});

test('generateDirectoryListing escapes quotes and ampersands in filenames', () => {
  withTempDir((dir) => {
    const name = 'it\'s "quoted" & ampersand.txt';
    fs.writeFileSync(path.join(dir, name), 'content');

    const { generateDirectoryListing } = loadServeStaticInternals(dir);
    const html = generateDirectoryListing(dir, '/');

    assert.ok(html.includes('it&#39;s &quot;quoted&quot; &amp; ampersand.txt'));
    assert.ok(!html.includes(`>${name}<`));
  });
});

test('CORS_HEADERS: omits Access-Control-Allow-Origin on the default loopback bind (127.0.0.1)', () => {
  withTempDir((dir) => {
    const { CORS_HEADERS, HOST } = loadServeStaticInternals(dir);
    assert.strictEqual(HOST, '127.0.0.1');
    assert.deepStrictEqual(CORS_HEADERS, {});
  });
});

test('CORS_HEADERS: omits Access-Control-Allow-Origin for the ::1 loopback host', () => {
  withTempDir((dir) => {
    const { CORS_HEADERS, HOST } = loadServeStaticInternals(dir, ['--host', '::1']);
    assert.strictEqual(HOST, '::1');
    assert.deepStrictEqual(CORS_HEADERS, {});
  });
});

test('CORS_HEADERS: sets a wildcard Access-Control-Allow-Origin when explicitly bound to 0.0.0.0', () => {
  withTempDir((dir) => {
    const { CORS_HEADERS, HOST } = loadServeStaticInternals(dir, ['--host', '0.0.0.0']);
    assert.strictEqual(HOST, '0.0.0.0');
    assert.deepStrictEqual(CORS_HEADERS, { 'Access-Control-Allow-Origin': '*' });
  });
});

/*
 * Request-handler integration tests below drive the real handler captured
 * from the stubbed http.createServer (see loadServeStaticInternals), wired
 * up to a genuine http.createServer/listen(0) and hit with real
 * http.request calls — no re-implementation of routing/header logic.
 */

test('request handler: serves an existing file with 200 and the correct Content-Type', async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world');
    const { requestHandler } = loadServeStaticInternals(dir);

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/hello.txt'));

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8');
    assert.strictEqual(res.body, 'hello world');
  });
});

test('request handler: falls back to index.html for a route with no file extension (SPA fallback)', async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SPA shell</html>');
    const { requestHandler } = loadServeStaticInternals(dir);

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/some/client-route'));

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.strictEqual(res.body, '<html>SPA shell</html>');
  });
});

test('request handler: returns 404 for a missing path with a file extension (no SPA fallback)', async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SPA shell</html>');
    const { requestHandler } = loadServeStaticInternals(dir);

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/missing.png'));

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body, 'Not Found');
  });
});

test('request handler: a ../ traversal attempt cannot escape the root directory', async () => {
  // decodeURIComponent(url.pathname) is always an absolute (leading-"/")
  // string, and both Node's WHATWG URL parser and path.normalize() clamp an
  // absolute path's ".." segments at "/" rather than letting them underflow
  // — so no crafted request path (plain or percent-encoded) can make
  // safeJoin() produce a path outside ROOT_DIR here. This asserts that
  // outer defence holds: the request resolves harmlessly inside ROOT_DIR
  // (as a 404, since no such file exists there) rather than reading
  // /etc/passwd or any other file outside the served directory.
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world');
    const { requestHandler } = loadServeStaticInternals(dir);

    const res = await withRunningServer(requestHandler, (port) =>
      httpGet(port, '/../../../../../../../../etc/passwd')
    );

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body, 'Not Found');
  });
});

test('request handler: returns 403 when the traversal guard trips on the file-serving call site', async () => {
  // The guard is unreachable through any real request path (see the test
  // above), so its own response is verified directly here by forcing
  // isWithinRoot() to report false, the way it would if some future change
  // ever let a candidate path slip past safeJoin().
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world');
    const { requestHandler } = loadServeStaticInternals(dir, [], {
      pathGuardOverrides: { isWithinRoot: () => false },
    });

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/hello.txt'));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body, 'Forbidden');
  });
});

test('request handler: returns 403 when the traversal guard trips on the directory-listing call site', async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>root index</html>');
    const { requestHandler } = loadServeStaticInternals(dir, [], {
      pathGuardOverrides: { isWithinRoot: () => false },
    });

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/'));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body, 'Forbidden');
  });
});

test('request handler: returns 403 for a symlink committed inside root whose target resolves outside it', async () => {
  // No pathGuardOverrides here — this exercises the real path-guard.js
  // against a genuine on-disk symlink, the scenario TD26072801 fixed
  // (e.g. public/theme.html -> /etc/passwd, published verbatim).
  await withTempDirAsync(async (dir) => {
    const root = fs.realpathSync(dir);
    const outsideFile = path.join(root, '..', `serve-static-secret-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(outsideFile, 'top secret');
    fs.symlinkSync(outsideFile, path.join(root, 'linked.txt'));
    const { requestHandler } = loadServeStaticInternals(root);

    try {
      const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/linked.txt'));
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body, 'Forbidden');
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });
});

test('request handler: still answers 404 for a request path that does not exist on disk', async () => {
  // A missing target can't be resolved by realpath (ENOENT), so the
  // symlink-aware containment check must fall back to its lexical result
  // rather than crash — the existing fileExists() check downstream is what
  // turns "not found" into a 404.
  await withTempDirAsync(async (dir) => {
    const { requestHandler } = loadServeStaticInternals(dir);

    const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/no-such-file.txt'));

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body, 'Not Found');
  });
});

test('request handler: a directory index.html symlinked out of root is not served, and the listing is generated instead', async () => {
  // The traversal guard on a directory request clears the *directory*; the
  // index.html served in its place is a separate path and needs its own
  // containment check, or a symlinked public/sub/index.html rides in on the
  // directory's clearance.
  await withTempDirAsync(async (dir) => {
    const root = fs.realpathSync(dir);
    const outsideFile = path.join(root, '..', `serve-static-secret-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(outsideFile, 'top secret');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.symlinkSync(outsideFile, path.join(root, 'sub', 'index.html'));
    const { requestHandler } = loadServeStaticInternals(root);

    try {
      const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/sub/'));
      assert.strictEqual(res.statusCode, 200);
      assert.doesNotMatch(res.body, /top secret/);
      assert.match(res.body, /Directory Listing/);
      // The listing may name the symlink (requesting it 403s), but must not
      // stat through it: printing the resolved target's size ("10 B" for the
      // ten-byte outside file) would leak metadata about a file the server
      // just declined to serve.
      assert.match(res.body, /index\.html/);
      assert.doesNotMatch(res.body, /class="size"/);
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });
});

test('request handler: the SPA fallback does not serve a root index.html symlinked out of root', async () => {
  // ROOT_DIR/index.html is synthesised for the fallback rather than derived
  // from the request, so it bypasses the guard applied to request paths and
  // has to be checked where it is built.
  await withTempDirAsync(async (dir) => {
    const root = fs.realpathSync(dir);
    const outsideFile = path.join(root, '..', `serve-static-secret-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(outsideFile, 'top secret');
    fs.symlinkSync(outsideFile, path.join(root, 'index.html'));
    const { requestHandler } = loadServeStaticInternals(root);

    try {
      const res = await withRunningServer(requestHandler, (port) => httpGet(port, '/some/route'));
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body, 'Not Found');
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });
});

/*
 * Graceful-shutdown tests below spawn the real serve-static.js as a child
 * process, rather than using the throwaway-Module technique above — that
 * technique stubs `http.createServer`'s `listen`/`close` away entirely
 * (see loadServeStaticInternals) and so can't exercise a real signal
 * reaching a real `process.exit`. TD26072619: before this fix, `npm run
 * stop`'s bare SIGTERM terminated the process immediately, mid-response.
 */

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk;
      if (output.includes('Serving ')) {
        child.stdout.removeListener('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      reject(new Error(`server exited before it was ready (code ${code}, signal ${signal})`))
    );
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

test('SIGTERM (the signal `npm run stop` sends) lets an in-flight response finish and exits cleanly', async () => {
  await withTempDirAsync(async (dir) => {
    // Large enough that the file is still streaming out (not yet fully
    // buffered/flushed) when SIGTERM arrives, so this exercises a request
    // that's genuinely in-flight. An earlier version of this test sent the
    // signal between two requests on an idle keep-alive socket instead —
    // `server.close()` only guarantees to drain connections with an active
    // request, not idle ones, so that version flaked (~15% locally) on
    // whichever side of the close() the client's next request happened to
    // land.
    const content = crypto.randomBytes(5 * 1024 * 1024);
    fs.writeFileSync(path.join(dir, 'big.bin'), content);
    const port = await getFreePort();

    const child = spawn(
      process.execPath,
      [SERVE_STATIC_PATH, '--port', String(port), '--dir', dir, '--host', '127.0.0.1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForServerReady(child);

      const response = await new Promise((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/big.bin', method: 'GET' },
          (res) => {
            // Headers have arrived but the body is still streaming; signal
            // now so the shutdown handler races the in-flight response,
            // not a request that hasn't been sent yet.
            child.kill('SIGTERM');
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) })
            );
            res.on('error', reject);
          }
        );
        req.on('error', reject);
        req.end();
      });

      // A regression back to abrupt termination would truncate this body
      // instead of letting the stream finish.
      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.body.equals(content));

      const { code, signal } = await waitForExit(child);

      // A graceful `server.close()` shutdown calls `process.exit(0)`; a
      // process killed abruptly by the signal itself would instead report
      // code null and the signal's name.
      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});

test('SIGINT exits cleanly via the same graceful shutdown path', async () => {
  await withTempDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world');
    const port = await getFreePort();

    const child = spawn(
      process.execPath,
      [SERVE_STATIC_PATH, '--port', String(port), '--dir', dir, '--host', '127.0.0.1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForServerReady(child);
      child.kill('SIGINT');
      const { code, signal } = await waitForExit(child);

      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});

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
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const http = require('http');

const SERVE_STATIC_PATH = path.join(__dirname, '..', 'src', 'tools', 'serve-static.js');

function loadServeStaticInternals(dirForStartupCheck, extraArgs = []) {
  const source = fs.readFileSync(SERVE_STATIC_PATH, 'utf8');
  const patched = `${source}\nmodule.exports = { escapeHtml, encodeHref, generateDirectoryListing, CORS_HEADERS, HOST };\n`;

  const originalArgv = process.argv;
  const originalCreateServer = http.createServer;
  http.createServer = () => ({ listen() {} });
  process.argv = [process.argv[0], SERVE_STATIC_PATH, '--dir', dirForStartupCheck, '--port', '0', ...extraArgs];

  try {
    const mod = new Module(SERVE_STATIC_PATH, module);
    mod.filename = SERVE_STATIC_PATH;
    mod.paths = Module._nodeModulePaths(path.dirname(SERVE_STATIC_PATH));
    mod._compile(patched, SERVE_STATIC_PATH);
    return mod.exports;
  } finally {
    process.argv = originalArgv;
    http.createServer = originalCreateServer;
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('escapeHtml escapes &, <, >, ", and \'', () => {
  withTempDir((dir) => {
    const { escapeHtml } = loadServeStaticInternals(dir);
    assert.strictEqual(
      escapeHtml(`<script>alert('x')</script> & "quoted"`),
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
    const name = `it's "quoted" & ampersand.txt`;
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

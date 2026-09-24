'use strict';

/**
 * Tests for src/tools/poetic-config.js's warning branches (issue #237):
 *   - a legacy .poetic-config file present with no .poetic-config.yaml
 *   - blogger.blog_id parsed as a YAML number instead of a quoted string
 *
 * readPoeticConfig()'s ordinary parsing paths (nested keys, absent file) are
 * already covered in test/poem-render.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readPoeticConfig, CONFIG_FILENAME } = require('../src/tools/poetic-config');

function tmpConfigDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Run `fn`, capturing every console.warn call instead of printing it;
// restores console.warn afterwards even if `fn` throws.
function withCapturedWarnings(fn) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

// ── Legacy .poetic-config file ───────────────────────────────────────────────

test('readPoeticConfig: warns and returns {} when a legacy .poetic-config exists but .poetic-config.yaml does not', (t) => {
  const dir = tmpConfigDir(t);
  fs.writeFileSync(path.join(dir, '.poetic-config'), 'title=Old Format\n', 'utf8');

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.deepStrictEqual(config, {}, 'the legacy file must be ignored, not parsed as key=value');
  assert.ok(
    warnings.some((w) => w.includes('legacy .poetic-config') && w.includes(CONFIG_FILENAME)),
    `expected a legacy-config warning, got: ${JSON.stringify(warnings)}`
  );
});

test('readPoeticConfig: no warning when neither .poetic-config nor .poetic-config.yaml exists', (t) => {
  const dir = tmpConfigDir(t);

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.deepStrictEqual(config, {});
  assert.deepStrictEqual(warnings, []);
});

test('readPoeticConfig: no legacy warning once .poetic-config.yaml exists, even alongside a leftover legacy file', (t) => {
  const dir = tmpConfigDir(t);
  fs.writeFileSync(path.join(dir, '.poetic-config'), 'title=Old Format\n', 'utf8');
  fs.writeFileSync(path.join(dir, CONFIG_FILENAME), 'title: New Format\n', 'utf8');

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.strictEqual(config.title, 'New Format');
  assert.deepStrictEqual(warnings, []);
});

// ── blogger.blog_id parsed as a YAML number ──────────────────────────────────

test('readPoeticConfig: warns when blogger.blog_id is an unquoted (numeric) YAML value', (t) => {
  const dir = tmpConfigDir(t);
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    'blogger:\n  blog_id: 1234567890123456789\n',
    'utf8'
  );

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.strictEqual(typeof config.blogger.blog_id, 'number');
  assert.ok(
    warnings.some((w) => w.includes('blogger.blog_id was parsed as a YAML number')),
    `expected a blog_id-precision warning, got: ${JSON.stringify(warnings)}`
  );
});

test('readPoeticConfig: no warning when blogger.blog_id is already a quoted string', (t) => {
  const dir = tmpConfigDir(t);
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    'blogger:\n  blog_id: "1234567890123456789"\n',
    'utf8'
  );

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.strictEqual(typeof config.blogger.blog_id, 'string');
  assert.deepStrictEqual(warnings, []);
});

test('readPoeticConfig: no warning when blogger is absent entirely', (t) => {
  const dir = tmpConfigDir(t);
  fs.writeFileSync(path.join(dir, CONFIG_FILENAME), 'title: My Poems\n', 'utf8');

  let config;
  const warnings = withCapturedWarnings(() => {
    config = readPoeticConfig(dir);
  });

  assert.strictEqual(config.blogger, undefined);
  assert.deepStrictEqual(warnings, []);
});

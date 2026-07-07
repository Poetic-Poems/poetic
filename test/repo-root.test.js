'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

test('REPO_ROOT points at the repository root', () => {
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, 'package.json')),
    'REPO_ROOT should contain package.json'
  );
  assert.strictEqual(REPO_ROOT, path.join(__dirname, '..'));
});

test('REPO_ROOT resolves the same regardless of process.cwd() at require time', () => {
  const modulePath = path.join(__dirname, '..', 'src', 'tools', 'repo-root.js');
  const output = execFileSync(
    process.execPath,
    ['-e', `console.log(require(${JSON.stringify(modulePath)}).REPO_ROOT)`],
    { cwd: os.tmpdir(), encoding: 'utf8' }
  ).trim();
  assert.strictEqual(output, REPO_ROOT);
});

test('build entry points resolve POEMS_DIR/PUBLIC_DIR via REPO_ROOT, not process.cwd()', () => {
  // Each of these modules used to compute its directory constants from
  // process.cwd(); guard against that regression by checking the source
  // directly rather than executing the (file-writing) build scripts here.
  const files = ['build-poems.js', 'poem-render.js', 'build-all-poems.js', 'poem-to-yaml.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', file), 'utf8');
    assert.ok(
      !/path\.join\(\s*process\.cwd\(\)/.test(source),
      `${file} should not derive directory paths from process.cwd()`
    );
  }
});

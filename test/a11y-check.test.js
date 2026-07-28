'use strict';

/**
 * Tests for src/tools/a11y-check.js's pure helpers (target discovery, report
 * formatting). Deliberately does not exercise main()/the puppeteer-core +
 * axe-core browser run — that needs a real Chrome install, which is what the
 * CI step (build-poems.yml, non-blocking) itself verifies against.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { discoverCheckTargets, formatViolations, findChromeExecutable } = require('../src/tools/a11y-check');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-a11y-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('discoverCheckTargets: returns index.html plus the first poem directory\'s index.html', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>', 'utf8');
  fs.mkdirSync(path.join(dir, 'a-poem'));
  fs.writeFileSync(path.join(dir, 'a-poem', 'index.html'), '<html></html>', 'utf8');
  fs.mkdirSync(path.join(dir, 'raw'));
  fs.writeFileSync(path.join(dir, 'raw', 'index.html'), '<html></html>', 'utf8');

  const targets = discoverCheckTargets(dir);

  assert.deepStrictEqual(targets, [
    { name: 'index.html', filePath: path.join(dir, 'index.html') },
    { name: 'a-poem/index.html', filePath: path.join(dir, 'a-poem', 'index.html') },
  ]);
});

test('discoverCheckTargets: skips raw/ even when it sorts before the real poem directory', (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, 'raw'));
  fs.writeFileSync(path.join(dir, 'raw', 'index.html'), '<html></html>', 'utf8');
  fs.mkdirSync(path.join(dir, 'z-poem'));
  fs.writeFileSync(path.join(dir, 'z-poem', 'index.html'), '<html></html>', 'utf8');

  const targets = discoverCheckTargets(dir);

  assert.deepStrictEqual(
    targets.map((target) => target.name),
    ['z-poem/index.html']
  );
});

test('discoverCheckTargets: returns an empty list when publicDir has no built pages', (t) => {
  const dir = tmpDir(t);
  assert.deepStrictEqual(discoverCheckTargets(dir), []);
});

test('discoverCheckTargets: skips a directory with no index.html of its own', (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, 'empty-dir'));
  assert.deepStrictEqual(discoverCheckTargets(dir), []);
});

test('formatViolations: reports a clean pass when there are no violations', () => {
  assert.strictEqual(formatViolations('index.html', []), '✅ index.html: no violations');
});

test('formatViolations: lists each violation\'s impact, id, help text, node count and help URL', () => {
  const report = formatViolations('index.html', [
    {
      id: 'landmark-one-main',
      impact: 'moderate',
      help: 'Document should have one main landmark',
      helpUrl: 'https://dequeuniversity.com/rules/axe/landmark-one-main',
      nodes: [{}, {}],
    },
  ]);

  assert.strictEqual(
    report,
    '❌ index.html: 1 violation(s)\n' +
    '  - [moderate] landmark-one-main: Document should have one main landmark ' +
    '(2 node(s)) — https://dequeuniversity.com/rules/axe/landmark-one-main'
  );
});

test('findChromeExecutable: returns the first candidate that exists on disk', (t) => {
  const dir = tmpDir(t);
  const fakeChrome = path.join(dir, 'fake-chrome');
  fs.writeFileSync(fakeChrome, '', 'utf8');

  assert.strictEqual(
    findChromeExecutable(['/nonexistent/chrome-bin', fakeChrome, '/usr/bin/google-chrome']),
    fakeChrome
  );
});

test('findChromeExecutable: returns undefined when no candidate exists', () => {
  assert.strictEqual(
    findChromeExecutable(['/nonexistent/a', '/nonexistent/b']),
    undefined
  );
});

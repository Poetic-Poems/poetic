'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { safeJoin, isWithinRoot } = require('../src/tools/path-guard');

const ROOT = path.resolve('/srv/site/public');

test('isWithinRoot accepts the root directory itself', () => {
  assert.strictEqual(isWithinRoot(ROOT, ROOT), true);
});

test('isWithinRoot accepts a nested path', () => {
  assert.strictEqual(
    isWithinRoot(ROOT, path.join(ROOT, 'poems', 'a.html')),
    true
  );
});

test('isWithinRoot rejects a sibling whose name merely extends the root', () => {
  // Regression: a bare startsWith(ROOT) check treated "publicX" as contained
  // because the string prefix matches. Comparing against ROOT + path.sep does
  // not.
  const sibling = ROOT + 'X'; // e.g. /srv/site/publicX
  assert.strictEqual(isWithinRoot(ROOT, sibling), false);
  assert.strictEqual(
    isWithinRoot(ROOT, path.join(sibling, 'secret.txt')),
    false
  );
});

test('safeJoin strips a leading slash so an absolute target stays under root', () => {
  const joined = safeJoin(ROOT, '/etc/passwd');
  assert.strictEqual(joined, path.join(ROOT, 'etc', 'passwd'));
  assert.strictEqual(isWithinRoot(ROOT, joined), true);
});

test('safeJoin + isWithinRoot reject a ../ target that escapes into a sibling', () => {
  const joined = safeJoin(ROOT, '../publicX/secret.txt');
  assert.strictEqual(isWithinRoot(ROOT, joined), false);
});

test('isWithinRoot accepts an in-root path that does not exist on disk', () => {
  // realpath can't resolve a missing target, so containment falls back to
  // the lexical check already computed — the caller's own not-found
  // handling (a 404, an existsSync fallback) is what deals with "missing".
  assert.strictEqual(
    isWithinRoot(ROOT, path.join(ROOT, 'no-such-file.html')),
    true
  );
});

test('isWithinRoot rejects a symlink inside root that resolves outside it', () => {
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-'))
  );
  const root = path.join(tmp, 'public');
  const outside = path.join(tmp, 'secret');
  fs.mkdirSync(root);
  fs.writeFileSync(outside, 'top secret');
  const link = path.join(root, 'theme.html');
  fs.symlinkSync(outside, link);

  try {
    assert.strictEqual(isWithinRoot(root, link), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isWithinRoot accepts a symlink inside root that resolves inside it', () => {
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-'))
  );
  const root = path.join(tmp, 'public');
  fs.mkdirSync(root);
  const target = path.join(root, 'real.html');
  fs.writeFileSync(target, 'hello');
  const link = path.join(root, 'alias.html');
  fs.symlinkSync(target, link);

  try {
    assert.strictEqual(isWithinRoot(root, link), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isWithinRoot rejects a symlinked directory inside root whose target escapes', () => {
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-'))
  );
  const root = path.join(tmp, 'public');
  const outsideDir = path.join(tmp, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(outsideDir, 'passwd'), 'root:x:0:0');
  fs.symlinkSync(outsideDir, path.join(root, 'uploads'));

  try {
    assert.strictEqual(
      isWithinRoot(root, path.join(root, 'uploads', 'passwd')),
      false
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

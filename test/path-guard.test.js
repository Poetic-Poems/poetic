'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
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

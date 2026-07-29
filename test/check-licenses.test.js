'use strict';

/**
 * Tests for scripts/check-licenses.js, the CI licence gate over
 * package-lock.json's production tree. Two behaviours here are policy
 * decisions from the PR review of the gate, pinned so they don't regress:
 *
 * - An SPDX OR disjunction (e.g. "(MIT OR Apache-2.0)") passes when any
 *   alternative is on the allow-list; AND/WITH and nested expressions stay
 *   fail-closed as violations.
 * - `devOptional` lockfile entries are checked, not skipped: npm sets that
 *   flag on a package reachable both from the dev tree and as an optional
 *   dependency of a production dependency, so a production install can
 *   still put it on disk. Only strictly-dev entries are skipped.
 *
 * main() accepts a { rootDir } override so each test runs against its own
 * temp directory's package-lock.json (and node_modules, for the fallback
 * path) rather than this repo's.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { normaliseLicense, isAllowedLicense, main } = require('../scripts/check-licenses');

// A throwaway temp directory holding a package-lock.json built from the
// given packages map, cleaned up when the test ends.
function tmpRepo(t, packages) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-check-licenses-'));
  const lock = {
    name: 'fixture',
    lockfileVersion: 3,
    packages: { '': { name: 'fixture', version: '1.0.0' }, ...packages },
  };
  fs.writeFileSync(path.join(rootDir, 'package-lock.json'), JSON.stringify(lock));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  return rootDir;
}

// Capture console.log/console.error output produced while running `fn`.
function captureLogs(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const result = fn();
    return { result, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test('normaliseLicense passes SPDX strings through', () => {
  assert.strictEqual(normaliseLicense('MIT'), 'MIT');
});

test('normaliseLicense unwraps the legacy object form', () => {
  assert.strictEqual(normaliseLicense({ type: 'MIT', url: 'https://example.org' }), 'MIT');
});

test('normaliseLicense unwraps a single-element legacy array', () => {
  assert.strictEqual(normaliseLicense([{ type: 'ISC' }]), 'ISC');
});

test('normaliseLicense returns null for shapes it cannot reduce', () => {
  assert.strictEqual(normaliseLicense(undefined), null);
  assert.strictEqual(normaliseLicense([{ type: 'MIT' }, { type: 'ISC' }]), null);
  assert.strictEqual(normaliseLicense({ url: 'https://example.org' }), null);
});

test('isAllowedLicense accepts plain allow-listed identifiers and rejects others', () => {
  assert.strictEqual(isAllowedLicense('MIT'), true);
  assert.strictEqual(isAllowedLicense('GPL-3.0-only'), false);
});

test('isAllowedLicense accepts an OR disjunction with an allowed alternative', () => {
  assert.strictEqual(isAllowedLicense('(MIT OR Apache-2.0)'), true);
  assert.strictEqual(isAllowedLicense('(GPL-3.0-only OR MIT)'), true);
  assert.strictEqual(isAllowedLicense('MIT OR GPL-3.0-only'), true);
  assert.strictEqual(isAllowedLicense('(BSD-2-Clause OR MIT OR Apache-2.0)'), true);
});

test('isAllowedLicense rejects an OR disjunction with no allowed alternative', () => {
  assert.strictEqual(isAllowedLicense('(GPL-2.0-only OR GPL-3.0-only)'), false);
});

test('isAllowedLicense stays fail-closed on AND, WITH, and nested expressions', () => {
  assert.strictEqual(isAllowedLicense('(MIT AND Zlib)'), false);
  assert.strictEqual(isAllowedLicense('Apache-2.0 WITH LLVM-exception'), false);
  assert.strictEqual(isAllowedLicense('(MIT AND (LGPL-2.1-or-later OR BSD-3-Clause))'), false);
});

test('main passes a tree whose licences are all allowed', (t) => {
  const rootDir = tmpRepo(t, {
    'node_modules/alpha': { version: '1.0.0', license: 'MIT' },
    'node_modules/beta': { version: '2.0.0', license: '(MIT OR Apache-2.0)' },
  });
  const { result, logs } = captureLogs(() => main({ rootDir }));
  assert.strictEqual(result, true);
  assert.ok(logs.some((line) => line.includes('Checked 2 production package(s)')));
});

test('main fails on a disallowed licence and names the package', (t) => {
  const rootDir = tmpRepo(t, {
    'node_modules/alpha': { version: '1.0.0', license: 'GPL-3.0-only' },
  });
  const { result, errors } = captureLogs(() => main({ rootDir }));
  assert.strictEqual(result, false);
  assert.ok(errors.some((line) => line.includes('alpha@1.0.0: GPL-3.0-only')));
});

test('main skips dev entries but checks devOptional entries', (t) => {
  const rootDir = tmpRepo(t, {
    'node_modules/dev-only': { version: '1.0.0', license: 'GPL-3.0-only', dev: true },
    'node_modules/dev-optional': { version: '1.0.0', license: 'GPL-3.0-only', devOptional: true },
  });
  const { result, errors } = captureLogs(() => main({ rootDir }));
  assert.strictEqual(result, false);
  assert.ok(errors.some((line) => line.includes('dev-optional@1.0.0')));
  assert.ok(!errors.some((line) => line.includes('dev-only@1.0.0')));
});

test('main falls back to node_modules when the lockfile has no licence', (t) => {
  const rootDir = tmpRepo(t, {
    'node_modules/gamma': { version: '3.0.0' },
  });
  const pkgDir = path.join(rootDir, 'node_modules', 'gamma');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'gamma', version: '3.0.0', license: 'ISC' })
  );
  const { result } = captureLogs(() => main({ rootDir }));
  assert.strictEqual(result, true);
});

test('main fails when a licence cannot be determined at all', (t) => {
  const rootDir = tmpRepo(t, {
    'node_modules/delta': { version: '4.0.0' },
  });
  const { result, errors } = captureLogs(() => main({ rootDir }));
  assert.strictEqual(result, false);
  assert.ok(errors.some((line) => line.includes('delta@4.0.0')));
});

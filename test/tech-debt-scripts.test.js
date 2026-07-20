'use strict';

// Tests for scripts/get-tech-debt-record.pl and scripts/next-tech-debt-id.pl.
//
// Each test builds a throwaway git repo containing a fixture TECH-DEBT.md, so
// the scripts' repo-root discovery (git rev-parse) and --ref reading (git
// show) run hermetically against the fixture rather than this repo's real
// register.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const RECORD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'get-tech-debt-record.pl');
const NEXT_ID_SCRIPT = path.join(REPO_ROOT, 'scripts', 'next-tech-debt-id.pl');

// Skip everywhere perl isn't installed (e.g. a bare Windows dev box); CI's
// ubuntu runners always have it.
const HAVE_PERL = spawnSync('perl', ['-e', '1']).status === 0;

// Isolate git from the developer's global/system config so runs are
// deterministic everywhere.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Poetic Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Poetic Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

const FIXTURE = `# Tech debt

## Current Items

### TD26071901 Old item one

Body A.

### TD26072001 Todays item one

Body B.

### TD26072002 Todays item two

Body C.

## Ledger

| ID | Title | Status | Resolved | Ref |
|----|-------|--------|----------|-----|
| TD26071901 | Old item one | open | | |
| TD26072001 | Todays item one | open | | |
| TD26072002 | Todays item two | open | | |
`;

const EXTRA_RECORD = `
### TD26072003 Uncommitted item

Body D.
`;

function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-scripts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'TECH-DEBT.md'), FIXTURE);
  git(dir, 'add', 'TECH-DEBT.md');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return dir;
}

// Insert an extra record into the working tree only (not committed), so
// default and --ref runs see different registers.
function addUncommittedRecord(dir) {
  const file = path.join(dir, 'TECH-DEBT.md');
  const updated = fs
    .readFileSync(file, 'utf8')
    .replace('\n## Ledger\n', `${EXTRA_RECORD}\n## Ledger\n`);
  fs.writeFileSync(file, updated);
}

function runRecord(cwd, ...args) {
  return spawnSync('perl', [RECORD_SCRIPT, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

function runNextId(cwd, ...args) {
  return spawnSync('perl', [NEXT_ID_SCRIPT, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

function ids(stdout) {
  return [...stdout.matchAll(/^id:\s+(\S+)/gm)].map((m) => m[1]);
}

test('a unique suffix resolves to exactly one record (exit 0)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runRecord(repo, '72001');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD26072001']);
  assert.match(r.stdout, /Body B\./);
});

test('a shared suffix is ambiguous (exit = matches - 1)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runRecord(repo, '1');
  assert.strictEqual(r.status, 1, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD26071901', 'TD26072001']);
});

test('an infix-only segment does not match (exit 255)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runRecord(repo, '719');
  assert.strictEqual(r.status, 255);
  assert.deepStrictEqual(ids(r.stdout), []);
});

test('full IDs match, with or without the TD/D prefix', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  for (const segment of ['TD26072002', 'D26072002', '26072002']) {
    const r = runRecord(repo, segment);
    assert.strictEqual(r.status, 0, `${segment}: ${r.stderr}`);
    assert.deepStrictEqual(ids(r.stdout), ['TD26072002'], segment);
  }
});

test('an invalid segment dies without matching', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runRecord(repo, 'xyz');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /Invalid ID segment/);
});

test('--ref reads the register at the ref, not the working tree', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  addUncommittedRecord(repo);

  const workingTree = runRecord(repo, '2003');
  assert.strictEqual(workingTree.status, 0, workingTree.stderr);
  assert.deepStrictEqual(ids(workingTree.stdout), ['TD26072003']);

  const atRef = runRecord(repo, '--ref', 'HEAD', '2003');
  assert.strictEqual(atRef.status, 255);
  assert.deepStrictEqual(ids(atRef.stdout), []);

  const committed = runRecord(repo, '--ref', 'HEAD', '72001');
  assert.strictEqual(committed.status, 0, committed.stderr);
  assert.deepStrictEqual(ids(committed.stdout), ['TD26072001']);
});

test('--ref with an unknown ref fails loudly', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runRecord(repo, '--ref', 'no-such-ref', '72001');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /git show failed/);
});

test('next-tech-debt-id counts the Ledger, not just visible items', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runNextId(repo, '260720');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'TD26072003');
});

test('next-tech-debt-id --ref allocates from the ref, not the working tree', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  addUncommittedRecord(repo);

  const workingTree = runNextId(repo, '260720');
  assert.strictEqual(workingTree.status, 0, workingTree.stderr);
  assert.strictEqual(workingTree.stdout.trim(), 'TD26072004');

  const atRef = runNextId(repo, '--ref', 'HEAD', '260720');
  assert.strictEqual(atRef.status, 0, atRef.stderr);
  assert.strictEqual(atRef.stdout.trim(), 'TD26072003');
});

test('next-tech-debt-id rejects a malformed date', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const r = runNextId(repo, '2607');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /Invalid date/);
});

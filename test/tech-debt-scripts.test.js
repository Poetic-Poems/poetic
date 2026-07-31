'use strict';

// Tests for scripts/get-tech-debt-record.pl, scripts/next-tech-debt-id.pl
// and scripts/td-check.pl, in both register formats: the legacy single-file
// TECH-DEBT.md and the per-item tech-debt/ directory.
//
// Each test builds a throwaway git repo containing a fixture register, so
// the scripts' repo-root discovery (git rev-parse) and --ref reading (git
// show / ls-tree) run hermetically against the fixture rather than this
// repo's real register.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const RECORD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'get-tech-debt-record.pl');
const NEXT_ID_SCRIPT = path.join(REPO_ROOT, 'scripts', 'next-tech-debt-id.pl');
const TD_CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'td-check.pl');

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

// ---------------------------------------------------------------------------
// Per-item register format (tech-debt/ directory + scoped IDs)
// ---------------------------------------------------------------------------

const SCOPED_POLICY = `---
scope: PPtest
---

# Tech debt

Policy only; items live in tech-debt/, one file each.
`;

// Build an item file whose filed date is derived from the ID, so fixtures
// stay internally consistent by construction.
function itemFile(id, extra = {}, body = 'A body.\n') {
  const m = id.match(/-(\d{2})(\d{2})(\d{2})[0-9a-z]\d$/);
  assert.ok(m, `test bug: unparseable item ID ${id}`);
  const meta = {
    id,
    title: `Title for ${id}`,
    status: 'open',
    filed: `20${m[1]}-${m[2]}-${m[3]}`,
    ...extra,
  };
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) lines.push(`${key}: ${value}`);
  }
  lines.push('---', '', body.trimEnd(), '');
  return lines.join('\n');
}

const ITEMS = {
  'TD-PPtest-26071901.md': itemFile(
    'TD-PPtest-26071901',
    { status: 'resolved', resolved: '2026-07-25', ref: '#12' },
    'Body A.\n'
  ),
  'TD-PPtest-26072001.md': itemFile(
    'TD-PPtest-26072001',
    { 'legacy-id': 'TD26072001' },
    'Body B.\n'
  ),
  'TD-PPtest-26072002.md': itemFile('TD-PPtest-26072002', {}, 'Body C.\n'),
};

function makeItemRepo(t, items = ITEMS, policy = SCOPED_POLICY) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-items-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'TECH-DEBT.md'), policy);
  fs.mkdirSync(path.join(dir, 'tech-debt'));
  for (const [name, content] of Object.entries(items)) {
    fs.writeFileSync(path.join(dir, 'tech-debt', name), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return dir;
}

function runCheck(cwd, ...args) {
  return spawnSync('perl', [TD_CHECK_SCRIPT, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

test('per-item: a unique suffix resolves with status and path', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, '72001');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD-PPtest-26072001']);
  assert.match(r.stdout, /^status: open$/m);
  assert.match(r.stdout, /^path: {2}tech-debt\/TD-PPtest-26072001\.md$/m);
  assert.match(r.stdout, /Body B\./);
});

test('per-item: a legacy-id segment matches its record', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, 'TD26072001');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD-PPtest-26072001']);
  assert.match(r.stdout, /^legacy-id: TD26072001$/m);
});

test('per-item: a scoped segment matches', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, 'test-26072002');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD-PPtest-26072002']);
});

test('per-item: a shared suffix is ambiguous (exit = matches - 1)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, '1');
  assert.strictEqual(r.status, 1, r.stderr);
  assert.deepStrictEqual(ids(r.stdout), ['TD-PPtest-26071901', 'TD-PPtest-26072001']);
});

test('per-item: --ref reads the register at the ref, not the working tree', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  fs.writeFileSync(
    path.join(repo, 'tech-debt', 'TD-PPtest-26072003.md'),
    itemFile('TD-PPtest-26072003', {}, 'Body D.\n')
  );

  const workingTree = runRecord(repo, '2003');
  assert.strictEqual(workingTree.status, 0, workingTree.stderr);
  assert.deepStrictEqual(ids(workingTree.stdout), ['TD-PPtest-26072003']);

  const atRef = runRecord(repo, '--ref', 'HEAD', '2003');
  assert.strictEqual(atRef.status, 255);
  assert.deepStrictEqual(ids(atRef.stdout), []);
});

test('per-item: next-tech-debt-id allocates from filenames and the declared scope', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const sameDay = runNextId(repo, '260720');
  assert.strictEqual(sameDay.status, 0, sameDay.stderr);
  assert.strictEqual(sameDay.stdout.trim(), 'TD-PPtest-26072003');

  const freshDay = runNextId(repo, '260731');
  assert.strictEqual(freshDay.status, 0, freshDay.stderr);
  assert.strictEqual(freshDay.stdout.trim(), 'TD-PPtest-26073101');
});

test('per-item: next-tech-debt-id --ref ignores uncommitted items', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  fs.writeFileSync(
    path.join(repo, 'tech-debt', 'TD-PPtest-26072003.md'),
    itemFile('TD-PPtest-26072003', {}, 'Body D.\n')
  );
  const workingTree = runNextId(repo, '260720');
  assert.strictEqual(workingTree.stdout.trim(), 'TD-PPtest-26072004');
  const atRef = runNextId(repo, '--ref', 'HEAD', '260720');
  assert.strictEqual(atRef.stdout.trim(), 'TD-PPtest-26072003');
});

test('per-item: NN overflows 99 -> a0 -> .. -> z9, then dies', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    'TD-PPtest-26080199.md': itemFile('TD-PPtest-26080199'),
  });
  assert.strictEqual(runNextId(repo, '260801').stdout.trim(), 'TD-PPtest-260801a0');

  fs.writeFileSync(
    path.join(repo, 'tech-debt', 'TD-PPtest-260801a9.md'),
    itemFile('TD-PPtest-260801a9')
  );
  assert.strictEqual(runNextId(repo, '260801').stdout.trim(), 'TD-PPtest-260801b0');

  fs.writeFileSync(
    path.join(repo, 'tech-debt', 'TD-PPtest-260801z9.md'),
    itemFile('TD-PPtest-260801z9')
  );
  const overflow = runNextId(repo, '260801');
  assert.notStrictEqual(overflow.status, 0);
  assert.match(overflow.stderr, /NN overflow/);
});

test('per-item: next-tech-debt-id dies without a declared scope', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, ITEMS, '# Tech debt\n\nNo frontmatter.\n');
  const r = runNextId(repo, '260720');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /declares no scope/);
});

test('per-item: td-check passes a consistent register, via arg and auto-detect', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const explicit = runCheck(repo, 'tech-debt');
  assert.strictEqual(explicit.status, 0, explicit.stdout);
  assert.match(explicit.stdout, /consistent/);

  const autodetect = runCheck(repo);
  assert.strictEqual(autodetect.status, 0, autodetect.stdout);
  assert.match(autodetect.stdout, /^tech-debt: 3 items/m);
});

test('per-item: td-check reports the drift classes', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    // id does not match the filename, and the status is unrecognised
    'TD-PPtest-26072101.md': itemFile('TD-PPtest-26072199', { status: 'bogus' }),
    // wrong scope for this repository
    'TD-XXwron-26072201.md': itemFile('TD-XXwron-26072201'),
    // resolved but with no ref, and NN 00 is never allocated
    'TD-PPtest-26072301.md': itemFile('TD-PPtest-26072301', {
      status: 'resolved',
      resolved: '2026-07-24',
    }),
    'TD-PPtest-26072400.md': itemFile('TD-PPtest-26072400'),
    // open item carrying a resolution field
    'TD-PPtest-26072501.md': itemFile('TD-PPtest-26072501', { resolved: '2026-07-26' }),
  });
  const r = runCheck(repo, 'tech-debt');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /ID MISMATCH {4}TD-PPtest-26072101\.md/);
  assert.match(r.stdout, /BAD STATUS {5}TD-PPtest-26072101\.md \(bogus\)/);
  assert.match(r.stdout, /BAD SCOPE {6}TD-XXwron-26072201\.md/);
  assert.match(r.stdout, /MISSING FIELD {2}TD-PPtest-26072301\.md \(ref\)/);
  assert.match(r.stdout, /BAD NAME {7}TD-PPtest-26072400\.md/);
  assert.match(r.stdout, /STALE FIELD {4}TD-PPtest-26072501\.md \(resolved/);
});

test('per-item: an empty register (scope declared, no directory yet) is per-item', { skip: !HAVE_PERL }, (t) => {
  // A register that has not filed its first item cannot commit an empty
  // tech-debt/ directory, so the scope: declaration alone must put the repo
  // on the per-item format — otherwise its first allocation would come out
  // unscoped.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'TECH-DEBT.md'), SCOPED_POLICY);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');

  const first = runNextId(dir, '260801');
  assert.strictEqual(first.status, 0, first.stderr);
  assert.strictEqual(first.stdout.trim(), 'TD-PPtest-26080101');

  const atRef = runNextId(dir, '--ref', 'HEAD', '260801');
  assert.strictEqual(atRef.status, 0, atRef.stderr);
  assert.strictEqual(atRef.stdout.trim(), 'TD-PPtest-26080101');

  // The resolver sees an empty register: no matches, never a die.
  const record = runRecord(dir, '101');
  assert.strictEqual(record.status, 255);
  assert.deepStrictEqual(ids(record.stdout), []);
  assert.strictEqual(record.stderr, '');
});

test('legacy: td-check passes the consistent fixture and flags a stale body', { skip: !HAVE_PERL }, (t) => {
  const repo = makeRepo(t);
  const clean = runCheck(repo, 'TECH-DEBT.md');
  assert.strictEqual(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /consistent/);

  // Flip a row to resolved without removing its body: STALE BODY drift.
  const file = path.join(repo, 'TECH-DEBT.md');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        '| TD26071901 | Old item one | open | | |',
        '| TD26071901 | Old item one | resolved | 2026-07-25 | #9 |'
      )
  );
  const drifted = runCheck(repo, 'TECH-DEBT.md');
  assert.strictEqual(drifted.status, 1, drifted.stdout);
  assert.match(drifted.stdout, /STALE BODY {5}TD26071901/);
});

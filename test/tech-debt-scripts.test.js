'use strict';

// Tests for scripts/get-tech-debt-record.pl, scripts/next-tech-debt-id.pl,
// scripts/reserve-tech-debt-id.pl, scripts/td-check.pl and
// scripts/check-tech-debt-open-rewrites.pl against the per-item tech-debt/
// register format.
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
const { spawnSync, spawn } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const RECORD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'get-tech-debt-record.pl');
const NEXT_ID_SCRIPT = path.join(REPO_ROOT, 'scripts', 'next-tech-debt-id.pl');
const RESERVE_ID_SCRIPT = path.join(REPO_ROOT, 'scripts', 'reserve-tech-debt-id.pl');
const TD_CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'td-check.pl');
const OPEN_REWRITES_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'check-tech-debt-open-rewrites.pl'
);

const COMMIT_FORMAT_SCRIPT = path.join(REPO_ROOT, '.githooks', 'check-commit-format.sh');
const TOOLING_MANIFEST = path.join(REPO_ROOT, 'scripts', 'td-tooling-manifest');

// Skip everywhere perl isn't installed (e.g. a bare Windows dev box); CI's
// ubuntu runners always have it.
const HAVE_PERL = spawnSync('perl', ['-e', '1']).status === 0;
const HAVE_BASH = spawnSync('bash', ['-c', 'true']).status === 0;
// `test/` is synced verbatim into consumer repos, but `.githooks/` is not:
// the Conventional Commits rule it encodes is this repository's own
// contribution policy, enforced here by commit-format.yml, and consumers
// carry neither the hooks nor that workflow.
const HAVE_COMMIT_FORMAT = fs.existsSync(COMMIT_FORMAT_SCRIPT);
// `test/` is synced verbatim into consumer repos, but the manifest itself is
// deliberately not (see docs/TECH-DEBT-REGISTER.md's "Tooling manifest for
// consumers"): consumers fetch it live from poetic main so a newly added
// canonical script is picked up immediately, without waiting on a sync.
const HAVE_TOOLING_MANIFEST = fs.existsSync(TOOLING_MANIFEST);

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

function runReserve(cwd, ...args) {
  return spawnSync('perl', [RESERVE_ID_SCRIPT, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

// Async variant, for genuine concurrency tests where several reservations
// must actually overlap in wall-clock time rather than run one after another.
function runReserveAsync(cwd, ...args) {
  return new Promise((resolve) => {
    const child = spawn('perl', [RESERVE_ID_SCRIPT, ...args], { cwd, env: GIT_ENV });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function runOpenRewrites(cwd, ...args) {
  return spawnSync('perl', [OPEN_REWRITES_SCRIPT, ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

// A bare "remote" plus one clone of it with `origin` set up and `main`
// pushed -- reserve-tech-debt-id.pl operates against origin/main and pushes
// td/* branches, so its tests need a real remote, not just a local repo.
function makeRemoteRepo(t, items = ITEMS, policy = SCOPED_POLICY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'td-remote-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remoteDir = path.join(root, 'remote.git');
  const seedDir = path.join(root, 'seed');

  git(root, 'init', '-q', '-b', 'main', '--bare', remoteDir);
  git(root, 'init', '-q', '-b', 'main', seedDir);
  fs.writeFileSync(path.join(seedDir, 'TECH-DEBT.md'), policy);
  if (Object.keys(items).length) {
    fs.mkdirSync(path.join(seedDir, 'tech-debt'));
    for (const [name, content] of Object.entries(items)) {
      fs.writeFileSync(path.join(seedDir, 'tech-debt', name), content);
    }
  }
  git(seedDir, 'remote', 'add', 'origin', remoteDir);
  git(seedDir, 'add', '-A');
  git(seedDir, 'commit', '-q', '-m', 'fixture');
  git(seedDir, 'push', '-q', 'origin', 'main');

  return { root, remoteDir };
}

// A fresh clone of an existing remote -- reservation races are only
// meaningful between independent clones, since a single clone's local git
// state is not what two concurrent writers actually share.
function cloneRemote(t, remoteDir, name) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'td-clone-')), name);
  git(path.dirname(dir), 'clone', '-q', remoteDir, dir);
  t.after(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
  return dir;
}

function remoteBranches(remoteDir, pattern = 'refs/heads/td/*') {
  return git(remoteDir, 'for-each-ref', '--format=%(refname)', pattern)
    .split('\n')
    .filter(Boolean);
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

test('per-item: TD/D-prefixed legacy segments resolve via legacy-id', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  for (const segment of ['TD26072001', 'D26072001', '26072001']) {
    const r = runRecord(repo, segment);
    assert.strictEqual(r.status, 0, `${segment}: ${r.stderr}`);
    assert.deepStrictEqual(ids(r.stdout), ['TD-PPtest-26072001'], segment);
  }
});

test('per-item: an invalid segment dies without matching', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, 'xyz');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /Invalid ID segment/);
});

test('per-item: --ref with an unknown ref fails loudly', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runRecord(repo, '--ref', 'no-such-ref', '72001');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /Cannot resolve ref/);
});

test('per-item: next-tech-debt-id rejects a malformed date', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t);
  const r = runNextId(repo, '2607');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /Invalid date/);
});

// ---------------------------------------------------------------------------
// reserve-tech-debt-id.pl (atomic allocation against a real origin remote)
// ---------------------------------------------------------------------------

test('reserve: allocates the next free id and pushes its td/<id> branch', { skip: !HAVE_PERL }, (t) => {
  const { remoteDir } = makeRemoteRepo(t);
  const clone = cloneRemote(t, remoteDir, 'w1');
  const r = runReserve(clone, '260720');
  assert.strictEqual(r.status, 0, r.stderr);
  const id = r.stdout.trim();
  assert.strictEqual(id, 'TD-PPtest-26072003');
  assert.deepStrictEqual(remoteBranches(remoteDir, `refs/heads/td/${id}`), [
    `refs/heads/td/${id}`,
  ]);
});

test('reserve: the reservation commit passes the Conventional Commits check', {
  skip: !HAVE_PERL || !HAVE_BASH
    || (!HAVE_COMMIT_FORMAT && 'consumer repo: .githooks/ is this repository\'s own contribution policy'),
}, (t) => {
  // The reservation commit is the base of the filing branch and survives
  // until the filing pull request is squash-merged, so commit-format.yml
  // sees it alongside the filer's own commits: a non-conforming subject
  // would fail every filing made by the documented workflow. Checked
  // through .githooks/check-commit-format.sh, the single place the
  // Conventional Commits pattern is defined.
  const { remoteDir } = makeRemoteRepo(t);
  const clone = cloneRemote(t, remoteDir, 'w1');
  const r = runReserve(clone, '260720');
  assert.strictEqual(r.status, 0, r.stderr);
  const id = r.stdout.trim();

  const subject = git(remoteDir, 'log', '-1', '--format=%s', `refs/heads/td/${id}`).trim();
  const checked = spawnSync('bash', [COMMIT_FORMAT_SCRIPT, subject], {
    env: GIT_ENV,
    encoding: 'utf8',
  });
  assert.strictEqual(checked.status, 0, `${subject}\n${checked.stderr}`);
});

test('reserve: skips ids already reserved by an unmerged td/* branch', { skip: !HAVE_PERL }, (t) => {
  const { remoteDir } = makeRemoteRepo(t);
  const seeder = cloneRemote(t, remoteDir, 'seeder');
  // Reserve TD-PPtest-26072003 (the next free filed id) directly, without
  // ever filing tech-debt/TD-PPtest-26072003.md -- simulating another
  // writer's in-flight, not-yet-merged filing.
  git(seeder, 'push', '-q', 'origin', 'main:refs/heads/td/TD-PPtest-26072003');

  const clone = cloneRemote(t, remoteDir, 'w1');
  const r = runReserve(clone, '260720');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'TD-PPtest-26072004');
});

test('reserve: sequential reservations from independent clones never collide', { skip: !HAVE_PERL }, (t) => {
  const { remoteDir } = makeRemoteRepo(t);
  const ids = [];
  for (const name of ['w1', 'w2', 'w3']) {
    const clone = cloneRemote(t, remoteDir, name);
    const r = runReserve(clone, '260720');
    assert.strictEqual(r.status, 0, r.stderr);
    ids.push(r.stdout.trim());
  }
  assert.deepStrictEqual(ids, [
    'TD-PPtest-26072003',
    'TD-PPtest-26072004',
    'TD-PPtest-26072005',
  ]);
});

test('reserve: a rejected push retries the next NN instead of moving the existing branch', { skip: !HAVE_PERL }, (t) => {
  // Regression test for the collision this item (TD-PPpoet-26080801) exists
  // to fix: pre-create the exact branch a naive scan-then-push would target,
  // pointing at a commit that is an *ancestor* of origin/main (so a plain
  // push would succeed as an ordinary fast-forward and silently steal the
  // reservation). reserve-tech-debt-id.pl must detect the existing branch
  // and move on to the next id instead of overwriting it.
  const { remoteDir } = makeRemoteRepo(t);
  const seeder = cloneRemote(t, remoteDir, 'seeder');
  const collisionId = 'TD-PPtest-26072003';
  git(seeder, 'push', '-q', 'origin', `main:refs/heads/td/${collisionId}`);
  const stolenSha = git(remoteDir, 'rev-parse', `refs/heads/td/${collisionId}`).trim();

  const clone = cloneRemote(t, remoteDir, 'w1');
  const r = runReserve(clone, '260720');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'TD-PPtest-26072004');

  // The pre-existing reservation must be untouched.
  assert.strictEqual(
    git(remoteDir, 'rev-parse', `refs/heads/td/${collisionId}`).trim(),
    stolenSha
  );
});

test('reserve: concurrent reservations for the same date never collide', { skip: !HAVE_PERL }, async (t) => {
  const { remoteDir } = makeRemoteRepo(t, {}, SCOPED_POLICY);
  const N = 6;
  const clones = Array.from({ length: N }, (_, i) => cloneRemote(t, remoteDir, `w${i}`));
  const results = await Promise.all(clones.map((c) => runReserveAsync(c, '260801')));
  for (const r of results) {
    assert.strictEqual(r.status, 0, r.stderr);
  }
  const ids = results.map((r) => r.stdout.trim());
  assert.strictEqual(new Set(ids).size, N, `expected ${N} distinct ids, got: ${ids.join(', ')}`);
  assert.deepStrictEqual([...ids].sort(), remoteBranches(remoteDir).map((ref) => ref.replace('refs/heads/td/', '')).sort());
});

test('reserve: works against a register that has not filed its first item', { skip: !HAVE_PERL }, (t) => {
  const { remoteDir } = makeRemoteRepo(t, {}, SCOPED_POLICY);
  const clone = cloneRemote(t, remoteDir, 'w1');
  const r = runReserve(clone, '260801');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'TD-PPtest-26080101');
});

test('reserve: dies without a git remote named origin', { skip: !HAVE_PERL }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-noorigin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  const r = runReserve(dir, '260801');
  assert.notStrictEqual(r.status, 0);
});

test('reserve: rejects a malformed date and a stray extra argument', { skip: !HAVE_PERL }, (t) => {
  const { remoteDir } = makeRemoteRepo(t);
  const clone = cloneRemote(t, remoteDir, 'w1');

  const badDate = runReserve(clone, '2607');
  assert.notStrictEqual(badDate.status, 0);
  assert.match(badDate.stderr, /Invalid date/);

  const extra = runReserve(clone, '260720', 'extra');
  assert.notStrictEqual(extra.status, 0);
  assert.match(extra.stderr, /Unexpected extra argument/);
});

// ---------------------------------------------------------------------------
// check-tech-debt-open-rewrites.pl
// ---------------------------------------------------------------------------

function makeRewriteRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-rewrite-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'tech-debt'));
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile('TD-PPtest-26080101', {}, 'Original body.\n')
  );
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

test('open-rewrites: flags a body change on an item whose status stays open', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'overwrite');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile('TD-PPtest-26080101', {}, 'A completely different body.\n')
  );
  git(dir, 'commit', '-q', '-am', 'overwrite');

  const r = runOpenRewrites(dir, 'main', 'overwrite');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /BODY REWRITE\s+tech-debt\/TD-PPtest-26080101\.md/);
});

test('open-rewrites: allows a strict append to an open item\'s body', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'append');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile('TD-PPtest-26080101', {}, 'Original body.\nReferenced from: src/foo.js\n')
  );
  git(dir, 'commit', '-q', '-am', 'append');

  const r = runOpenRewrites(dir, 'main', 'append');
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /no open-item body rewrites/);
});

test('open-rewrites: flags a same-length rewrite even though it is not a whole-body swap', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'samelength');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile('TD-PPtest-26080101', {}, 'Original bodz.\n')
  );
  git(dir, 'commit', '-q', '-am', 'samelength');

  const r = runOpenRewrites(dir, 'main', 'samelength');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /BODY REWRITE\s+tech-debt\/TD-PPtest-26080101\.md/);
});

test('open-rewrites: allows a claim (status changes, body unchanged)', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'claim');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile('TD-PPtest-26080101', { status: 'in-progress' }, 'Original body.\n')
  );
  git(dir, 'commit', '-q', '-am', 'claim');

  const r = runOpenRewrites(dir, 'main', 'claim');
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /no open-item body rewrites/);
});

test('open-rewrites: allows a resolution (status changes to resolved)', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'resolve');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080101.md'),
    itemFile(
      'TD-PPtest-26080101',
      { status: 'resolved', resolved: '2026-08-13', ref: '#123' },
      'Original body.\n'
    )
  );
  git(dir, 'commit', '-q', '-am', 'resolve');

  const r = runOpenRewrites(dir, 'main', 'resolve');
  assert.strictEqual(r.status, 0, r.stdout);
});

test('open-rewrites: ignores newly added items', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'addition');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080102.md'),
    itemFile('TD-PPtest-26080102', {}, 'A new item.\n')
  );
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'addition');

  const r = runOpenRewrites(dir, 'main', 'addition');
  assert.strictEqual(r.status, 0, r.stdout);
});

test('open-rewrites: a clean diff exits 0', { skip: !HAVE_PERL }, (t) => {
  const dir = makeRewriteRepo(t);
  git(dir, 'checkout', '-q', '-b', 'noop');
  fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'hi\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'unrelated');

  const r = runOpenRewrites(dir, 'main', 'noop');
  assert.strictEqual(r.status, 0, r.stdout);
});

test('td-check: rejects an open item with an empty body', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    'TD-PPtest-26072601.md': itemFile('TD-PPtest-26072601', {}, ''),
  });
  const r = runCheck(repo, 'tech-debt');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /MISSING FIELD.*TD-PPtest-26072601\.md \(body/);
});

test('td-check: rejects an open item with a whitespace-only body', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    'TD-PPtest-26072701.md': itemFile('TD-PPtest-26072701', {}, '   \n\n  \t  \n'),
  });
  const r = runCheck(repo, 'tech-debt');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /MISSING FIELD.*TD-PPtest-26072701\.md \(body/);
});

test('td-check: allows a resolved item with an empty body (legacy)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    'TD-PPtest-26072801.md': itemFile(
      'TD-PPtest-26072801',
      { status: 'resolved', resolved: '2026-07-28', ref: '#99' },
      ''
    ),
  });
  const r = runCheck(repo, 'tech-debt');
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /consistent/);
});

test('td-check: allows a not-debt item with an empty body (legacy)', { skip: !HAVE_PERL }, (t) => {
  const repo = makeItemRepo(t, {
    ...ITEMS,
    'TD-PPtest-26072901.md': itemFile('TD-PPtest-26072901', { status: 'not-debt', ref: '#98' }, ''),
  });
  const r = runCheck(repo, 'tech-debt');
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /consistent/);
});

// ---------------------------------------------------------------------------
// scripts/td-tooling-manifest (authoritative list for consumer drift checks)
// ---------------------------------------------------------------------------

test('td-tooling-manifest: one real, existing script path per line, no blanks or dupes', {
  skip: !HAVE_TOOLING_MANIFEST
    && 'consumer repo: the manifest is fetched live from poetic main, not mirrored',
}, () => {
  const raw = fs.readFileSync(TOOLING_MANIFEST, 'utf8');
  assert.match(raw, /\n$/, 'manifest must end with a trailing newline');
  const lines = raw.split('\n').slice(0, -1);
  assert.ok(lines.length > 0, 'manifest must not be empty');
  for (const line of lines) {
    assert.match(line, /^scripts\/[\w.-]+$/, `unexpected manifest entry: ${line}`);
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, line)),
      `manifest entry missing on disk: ${line}`
    );
  }
  assert.strictEqual(
    new Set(lines).size,
    lines.length,
    'manifest must not contain duplicate entries'
  );
});

test('open-rewrites: rejects an append when the base body is empty', { skip: !HAVE_PERL }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-rewrite-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'tech-debt'));
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080201.md'),
    itemFile('TD-PPtest-26080201', {}, '')
  );
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base-empty');

  git(dir, 'checkout', '-q', '-b', 'append-to-empty');
  fs.writeFileSync(
    path.join(dir, 'tech-debt', 'TD-PPtest-26080201.md'),
    itemFile('TD-PPtest-26080201', {}, 'New body text.\n')
  );
  git(dir, 'commit', '-q', '-am', 'append');

  const r = runOpenRewrites(dir, 'main', 'append-to-empty');
  assert.strictEqual(r.status, 1, r.stdout);
  assert.match(r.stdout, /BODY REWRITE\s+tech-debt\/TD-PPtest-26080201\.md/);
});

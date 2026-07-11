'use strict';

// End-to-end tests for scripts/sync-framework.sh.
//
// The script hardcodes the upstream URL (https://github.com/warwickallen/poetic.git)
// and always resets the `poetic` remote to it, so we can't just point a remote at a
// local fixture. Instead each test builds a throwaway "upstream" git repo and a
// "consumer" git repo, then sets `url.<upstream-path>.insteadOf <github-url>` in the
// consumer's config. Git rewrites the fetch URL to the local path, so the whole run
// is hermetic — no network, no dependence on the real poetic repo.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const SCRIPT_SRC = path.join(REPO_ROOT, 'scripts', 'sync-framework.sh');
const POETIC_URL = 'https://github.com/warwickallen/poetic.git';

// Isolate git from the developer's global/system config (identity, gpg signing,
// hook paths, existing insteadOf rules) so runs are deterministic everywhere.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Poetic Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Poetic Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
};

function gitSkipReason() {
  try {
    execFileSync('git', ['--version'], { encoding: 'utf8' });
    return undefined;
  } catch {
    return 'git is not installed';
  }
}

const SKIP = gitSkipReason();

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'tag.gpgsign', 'false');
}

function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

// A fresh temp workspace, cleaned up when the test finishes.
function tmpBase(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-framework-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}

// A minimal upstream (single commit) carrying a few framework-owned paths.
function makeUpstream(base) {
  const dir = path.join(base, 'upstream');
  initRepo(dir);
  write(dir, 'docs/GUIDE.md', 'upstream guide v1\n');
  write(dir, 'package.json', '{"name":"upstream"}\n');
  write(dir, 'package-lock.json', '{"name":"upstream","lockfileVersion":3}\n');
  write(dir, 'src/tools/tool.js', '// upstream tool v1\n');
  const commit = commitAll(dir, 'chore: upstream v1');
  return { dir, commit };
}

// A consumer repo wired to fetch from `upstreamDir` in place of GitHub.
function makeConsumer(base, upstreamDir, opts = {}) {
  const {
    versionCommit = '',
    localPackage = '{"name":"consumer-local"}\n',
    config = null,
  } = opts;
  const dir = path.join(base, 'consumer');
  initRepo(dir);
  // The consumer starts with a pristine copy of the script under test.
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'sync-framework.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'sync-framework.sh'), 0o755);
  write(dir, 'docs/GUIDE.md', 'local guide\n');
  write(dir, 'package.json', localPackage);
  write(dir, '.poetic-version', `channel=releases\nref=main\ncommit=${versionCommit}\n`);
  if (config !== null) write(dir, '.poetic-config.yaml', config);
  commitAll(dir, 'chore: initial consumer');
  // Redirect the hardcoded GitHub URL to the local upstream repo.
  git(dir, 'config', `url.${upstreamDir}.insteadOf`, POETIC_URL);
  return { dir };
}

function runSync(consumerDir, args = []) {
  return spawnSync(
    'bash',
    [path.join(consumerDir, 'scripts', 'sync-framework.sh'), ...args],
    { cwd: consumerDir, env: GIT_ENV, encoding: 'utf8' }
  );
}

function readFile(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

test('syncs framework paths and records the ref/commit (default ref from .poetic-version)', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up, commit } = makeUpstream(base);
  const { dir: cons } = makeConsumer(base, up);

  // No --ref: the script should fall back to ref=main from .poetic-version.
  const res = runSync(cons, []);
  assert.strictEqual(res.status, 0, res.stderr);

  assert.strictEqual(readFile(cons, 'docs/GUIDE.md'), 'upstream guide v1\n');
  assert.strictEqual(readFile(cons, 'src/tools/tool.js'), '// upstream tool v1\n');

  // package-lock.json must sync alongside package.json; otherwise a dependency
  // bump upstream leaves the consumer's lockfile stale and `npm ci` fails.
  assert.strictEqual(
    readFile(cons, 'package-lock.json'),
    '{"name":"upstream","lockfileVersion":3}\n'
  );

  const ver = readFile(cons, '.poetic-version');
  assert.match(ver, /^channel=releases$/m, 'channel should be preserved');
  assert.match(ver, /^ref=main$/m);
  assert.match(ver, new RegExp(`^commit=${commit}$`, 'm'));

  // The sync stages changes rather than committing when --commit is absent.
  const staged = git(cons, 'diff', '--staged', '--name-only');
  assert.ok(staged.includes('docs/GUIDE.md'), staged);
  assert.ok(staged.includes('.poetic-version'), staged);
  assert.strictEqual(git(cons, 'log', '-1', '--format=%s'), 'chore: initial consumer',
    'no new commit should be created without --commit');
});

test('honours skip_paths and the awk parser boundary/quote-stripping', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up } = makeUpstream(base);
  // package.json is a quoted skip entry; docs sits under a *different* top-level
  // key and must NOT be treated as skipped (parser stops at the un-indented key).
  const config = 'skip_paths:\n  - "package.json"\nother_section:\n  - docs\n';
  const { dir: cons } = makeConsumer(base, up, { config });

  const res = runSync(cons, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);

  // Skipped: the local override survives untouched.
  assert.strictEqual(readFile(cons, 'package.json'), '{"name":"consumer-local"}\n');
  assert.ok(res.stdout.includes('skipped package.json (local override)'), res.stdout);

  // Not skipped: docs was under a different key, so it still syncs.
  assert.strictEqual(readFile(cons, 'docs/GUIDE.md'), 'upstream guide v1\n');
});

test('--commit creates a commit with the expected subject', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up } = makeUpstream(base);
  const { dir: cons } = makeConsumer(base, up);
  const before = git(cons, 'rev-parse', 'HEAD');

  const res = runSync(cons, ['--ref', 'main', '--commit']);
  assert.strictEqual(res.status, 0, res.stderr);

  const after = git(cons, 'rev-parse', 'HEAD');
  assert.notStrictEqual(after, before, 'a new commit should exist');
  assert.strictEqual(git(cons, 'log', '-1', '--format=%s'),
    'chore: sync framework from poetic main');
});

test('--commit body summarises upstream commits since the last synced commit', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'docs/GUIDE.md', 'upstream guide v1\n');
  write(up, 'package.json', '{"name":"upstream"}\n');
  const c1 = commitAll(up, 'chore: upstream v1');
  write(up, 'docs/GUIDE.md', 'upstream guide v2\n');
  const c2 = commitAll(up, 'feat: improve the guide');

  // Consumer last synced c1; the sync should summarise c1..c2.
  const { dir: cons } = makeConsumer(base, up, { versionCommit: c1 });
  const res = runSync(cons, ['--ref', 'main', '--commit']);
  assert.strictEqual(res.status, 0, res.stderr);

  assert.ok(res.stdout.includes('Upstream changes in this sync:'), res.stdout);
  const body = git(cons, 'log', '-1', '--format=%b');
  assert.ok(body.includes('feat: improve the guide'), `commit body was:\n${body}`);
  assert.match(readFile(cons, '.poetic-version'), new RegExp(`^commit=${c2}$`, 'm'));
});

test('deletes framework files removed upstream between the synced commits', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'docs/GUIDE.md', 'upstream guide v1\n');
  write(up, 'package.json', '{"name":"upstream"}\n');
  write(up, 'src/tools/tool.js', '// upstream tool v1\n');
  write(up, 'src/tools/dead.js', '// dead migration tool\n');
  const c1 = commitAll(up, 'chore: upstream v1');
  // Upstream deletes the dead tool in the next commit.
  fs.rmSync(path.join(up, 'src/tools/dead.js'));
  const c2 = commitAll(up, 'chore: remove dead tool');

  // Consumer last synced c1 and carries the (now-removed) dead tool.
  const dir = path.join(base, 'consumer');
  initRepo(dir);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'sync-framework.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'sync-framework.sh'), 0o755);
  write(dir, 'docs/GUIDE.md', 'local guide\n');
  write(dir, 'package.json', '{"name":"consumer-local"}\n');
  write(dir, 'src/tools/tool.js', '// consumer tool\n');
  write(dir, 'src/tools/dead.js', '// dead migration tool\n');
  write(dir, '.poetic-version', `channel=releases\nref=main\ncommit=${c1}\n`);
  commitAll(dir, 'chore: initial consumer');
  git(dir, 'config', `url.${up}.insteadOf`, POETIC_URL);

  const res = runSync(dir, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);

  // The upstream-removed tool is announced and staged for deletion downstream.
  assert.ok(res.stdout.includes('deleted src/tools/dead.js'), res.stdout);
  const staged = git(dir, 'diff', '--staged', '--name-status');
  assert.match(staged, /^D\s+src\/tools\/dead\.js$/m, staged);
  assert.ok(
    !fs.existsSync(path.join(dir, 'src/tools/dead.js')),
    'the deleted file should be gone from the working tree'
  );

  // A surviving framework file is synced (overlaid), not deleted.
  assert.strictEqual(readFile(dir, 'src/tools/tool.js'), '// upstream tool v1\n');
  assert.match(readFile(dir, '.poetic-version'), new RegExp(`^commit=${c2}$`, 'm'));
});

test('does not delete an upstream-removed file that is in skip_paths', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'src/tools/tool.js', '// upstream tool v1\n');
  write(up, 'src/tools/dead.js', '// dead migration tool\n');
  const c1 = commitAll(up, 'chore: upstream v1');
  fs.rmSync(path.join(up, 'src/tools/dead.js'));
  commitAll(up, 'chore: remove dead tool');

  const dir = path.join(base, 'consumer');
  initRepo(dir);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'sync-framework.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'sync-framework.sh'), 0o755);
  write(dir, 'src/tools/tool.js', '// consumer tool\n');
  write(dir, 'src/tools/dead.js', '// locally-maintained fork of the tool\n');
  // The consumer opts to manage the exact deleted path locally.
  write(dir, '.poetic-config.yaml', 'skip_paths:\n  - src/tools/dead.js\n');
  write(dir, '.poetic-version', `channel=releases\nref=main\ncommit=${c1}\n`);
  commitAll(dir, 'chore: initial consumer');
  git(dir, 'config', `url.${up}.insteadOf`, POETIC_URL);

  const res = runSync(dir, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);

  // The skipped path is announced as kept and survives untouched, unstaged.
  assert.ok(res.stdout.includes('skipped src/tools/dead.js (local override; deleted upstream)'), res.stdout);
  assert.strictEqual(readFile(dir, 'src/tools/dead.js'), '// locally-maintained fork of the tool\n');
  const staged = git(dir, 'diff', '--staged', '--name-status');
  assert.doesNotMatch(staged, /src\/tools\/dead\.js/, staged);
});

test('first sync (no recorded commit) skips deletion and says so', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up } = makeUpstream(base);
  const { dir: cons } = makeConsumer(base, up); // versionCommit defaults to ''

  const res = runSync(cons, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(
    res.stdout.includes('no previously synced commit recorded; skipping deletion'),
    res.stdout
  );
});

test('--ref <tag> checks out the tagged commit, not the branch head', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'docs/GUIDE.md', 'tagged guide\n');
  const tagged = commitAll(up, 'chore: v1');
  git(up, 'tag', 'v1.0.0');
  // Advance main past the tag so the two are distinguishable.
  write(up, 'docs/GUIDE.md', 'newer main guide\n');
  commitAll(up, 'chore: v2');

  const { dir: cons } = makeConsumer(base, up);
  const res = runSync(cons, ['--ref', 'v1.0.0']);
  assert.strictEqual(res.status, 0, res.stderr);

  assert.strictEqual(readFile(cons, 'docs/GUIDE.md'), 'tagged guide\n');
  const ver = readFile(cons, '.poetic-version');
  assert.match(ver, /^ref=v1\.0\.0$/m);
  assert.match(ver, new RegExp(`^commit=${tagged}$`, 'm'));
});

test('re-execs itself when the upstream script differs', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'docs/GUIDE.md', 'upstream guide\n');
  // Upstream carries a modified copy of the script, so the consumer's self-sync
  // detects a change and re-execs the updated version.
  write(up, 'scripts/sync-framework.sh', fs.readFileSync(SCRIPT_SRC, 'utf8') + '\n# upstream marker\n');
  commitAll(up, 'chore: upstream with modified script');

  const { dir: cons } = makeConsumer(base, up);
  const res = runSync(cons, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);

  assert.ok(res.stdout.includes('changed upstream'), res.stdout);
  // The re-exec left the upstream version in place and still completed the sync.
  assert.ok(readFile(cons, 'scripts/sync-framework.sh').includes('# upstream marker'));
  assert.strictEqual(readFile(cons, 'docs/GUIDE.md'), 'upstream guide\n');
});

test('leaves an already-synced, unchanged path untouched (no checkout, no mtime bump)', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const up = path.join(base, 'upstream');
  initRepo(up);
  write(up, 'docs/GUIDE.md', 'same content\n');
  write(up, 'package.json', '{"name":"upstream"}\n');
  write(up, 'src/tools/tool.js', 'same content\n');
  commitAll(up, 'chore: upstream v1');

  const dir = path.join(base, 'consumer');
  initRepo(dir);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'sync-framework.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'sync-framework.sh'), 0o755);
  // The consumer's copy of src/tools/tool.js is already byte-identical to
  // what upstream would sync — a real-world "nothing to do here" sync, the
  // same situation a scheduled auto_sync run hits most of the time.
  write(dir, 'docs/GUIDE.md', 'local guide\n');
  write(dir, 'package.json', '{"name":"consumer-local"}\n');
  write(dir, 'src/tools/tool.js', 'same content\n');
  write(dir, '.poetic-version', 'channel=releases\nref=main\ncommit=\n');
  commitAll(dir, 'chore: initial consumer');
  git(dir, 'config', `url.${up}.insteadOf`, POETIC_URL);

  // Backdate the already-identical file so a spurious checkout (which would
  // rewrite it with identical content, but a fresh mtime) is detectable.
  const toolPath = path.join(dir, 'src/tools/tool.js');
  const past = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(toolPath, past, past);
  const mtimeBefore = fs.statSync(toolPath).mtimeMs;

  const res = runSync(dir, ['--ref', 'main']);
  assert.strictEqual(res.status, 0, res.stderr);

  // src/tools is a directory entry in FRAMEWORK_PATHS, so the "unchanged"
  // report (and the checkout it would otherwise trigger) applies to the
  // whole directory, not the individual file within it.
  assert.ok(res.stdout.includes('unchanged src/tools'), res.stdout);
  assert.strictEqual(
    fs.statSync(toolPath).mtimeMs, mtimeBefore,
    'an unchanged path should not be checked out again (mtime should be preserved)'
  );
  // A genuinely different path still syncs normally.
  assert.strictEqual(readFile(dir, 'docs/GUIDE.md'), 'same content\n');
});

test('rejects an unknown argument', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up } = makeUpstream(base);
  const { dir: cons } = makeConsumer(base, up);

  const res = runSync(cons, ['--bogus']);
  assert.strictEqual(res.status, 1);
  assert.ok(res.stderr.includes('Unknown argument: --bogus'), res.stderr);
});

test('fails clearly when the requested ref does not exist', { skip: SKIP }, (t) => {
  const base = tmpBase(t);
  const { dir: up } = makeUpstream(base);
  const { dir: cons } = makeConsumer(base, up);

  const res = runSync(cons, ['--ref', 'no-such-ref']);
  assert.strictEqual(res.status, 1);
  assert.ok(res.stderr.includes("ref 'no-such-ref' not found"), res.stderr);
});

'use strict';

// End-to-end tests for scripts/assemble-changelog.sh, which folds every
// merged pull-request description since CHANGELOG.md's own
// `<!-- changelog:assembled-through sha=... -->` marker into the file's
// `## [Unreleased]` section (requirement 25c, roadmap decision D27).
//
// The script resolves its own repository root from its *own file's
// location* (`dirname "${BASH_SOURCE[0]}"/..`), never from the working
// directory or an argument, and then runs `git -C "$repo_root" ...` — so,
// following test/sync-framework.test.js's own pattern for a script this
// shaped, each test builds a throwaway git repo, copies the script and its
// lib/changelog-grammar.sh dependency into it at the same relative paths
// they have in this repository (scripts/assemble-changelog.sh,
// lib/changelog-grammar.sh), and commits real history into it — so the run
// is hermetic and never touches this repository's own CHANGELOG.md.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');
const { GIT_ENV } = require('./helpers/changelog-shell');

const SCRIPT_SRC = path.join(REPO_ROOT, 'scripts', 'assemble-changelog.sh');
const LIB_SRC = path.join(REPO_ROOT, 'lib', 'changelog-grammar.sh');

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

let commitSeq = 0;

// Commits with a given subject and body ('%s' / '%b'), returning the new
// commit's full sha. Each call also touches a throwaway, uniquely-named
// file — these tests care only about the commit message (which is all
// assemble-changelog.sh reads), never about real file content, but git
// refuses an empty commit, so something has to actually change.
function commit(dir, subject, body) {
  write(dir, `.commit-seq-${commitSeq++}`, `${subject}\n`);
  git(dir, 'add', '-A');
  const args = ['commit', '-m', subject];
  if (body) args.push('-m', body);
  git(dir, ...args);
  return git(dir, 'rev-parse', 'HEAD');
}

// A fresh git repo carrying the script and its lib dependency at the same
// relative layout as this repository, plus an initial commit establishing
// CHANGELOG.md with the assembled-through marker pointing at that commit.
function makeRepo(t, { changelogBody } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-changelog-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, 'repo');
  initRepo(dir);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(dir, 'scripts', 'assemble-changelog.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'assemble-changelog.sh'), 0o755);
  fs.copyFileSync(LIB_SRC, path.join(dir, 'lib', 'changelog-grammar.sh'));
  write(dir, 'README.md', 'fixture repo\n');
  const initialSha = commit(dir, 'chore: initial commit');
  const body = changelogBody ?? [
    '# Changelog', '',
    'All notable changes to this project are documented in this file.', '',
    `<!-- changelog:assembled-through sha=${initialSha} -->`, '',
  ].join('\n');
  write(dir, 'CHANGELOG.md', body);
  commit(dir, 'chore: seed CHANGELOG.md', '');
  return { dir, initialSha };
}

function runAssemble(dir, args = []) {
  return spawnSync(
    'bash',
    [path.join(dir, 'scripts', 'assemble-changelog.sh'), ...args],
    { cwd: dir, env: GIT_ENV, encoding: 'utf8' }
  );
}

function readFile(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

test('folds one merged PR body into a fresh ## [Unreleased] section, tagged with its PR number', (t) => {
  const { dir } = makeRepo(t);
  const headSha = commit(
    dir,
    'fix: resolve output path (#42)',
    '## Changelog\n\n### Fixed\n\n- the output path was wrong\n'
  );

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /### Fixed/);
  assert.match(changelog, /- the output path was wrong \(#42\)/);
  assert.match(changelog, new RegExp(`assembled-through sha=${headSha}`));
});

test('a commit with "None." contributes nothing', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'docs: fix a typo (#7)', '## Changelog\n\nNone.\n');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.ok(!changelog.includes('## [Unreleased]'), changelog);
});

test('a commit with no ## Changelog section at all contributes nothing', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'chore: bump a dependency (#8)', 'no changelog heading here');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.ok(!changelog.includes('## [Unreleased]'), changelog);
});

test('a commit whose section fails the grammar contributes nothing, not a truncated bullet', (t) => {
  const { dir } = makeRepo(t);
  // LOOSE: an unindented, non-bullet line following a bullet under a
  // category — a fault scripts/check-changelog-section.sh would also raise,
  // so this body could never actually have merged; assemble-changelog.sh
  // must still cope with it rather than ship half a sentence.
  commit(
    dir,
    'fix: a bad body somehow landed (#9)',
    '## Changelog\n\n### Fixed\n\n- a bullet\nthis loose line breaks the grammar\n'
  );

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.ok(!changelog.includes('a bullet'), changelog);
  assert.ok(!changelog.includes('## [Unreleased]'), changelog);
});

test('multiple categories across multiple commits are grouped under Keep a Changelog headings, newest commit first', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'feat: add a thing (#10)', '## Changelog\n\n### Added\n\n- added a thing\n');
  commit(dir, 'fix: fix a thing (#11)', '## Changelog\n\n### Fixed\n\n- fixed a thing\n');
  commit(dir, 'feat: add another thing (#12)', '## Changelog\n\n### Added\n\n- added another thing\n');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  // Keep a Changelog order: Added before Fixed.
  const addedIdx = changelog.indexOf('### Added');
  const fixedIdx = changelog.indexOf('### Fixed');
  assert.ok(addedIdx >= 0 && fixedIdx >= 0 && addedIdx < fixedIdx, changelog);
  // Newest commit first within the Added category.
  const anotherIdx = changelog.indexOf('added another thing');
  const firstIdx = changelog.indexOf('added a thing');
  assert.ok(anotherIdx >= 0 && firstIdx >= 0 && anotherIdx < firstIdx, changelog);
});

test('a bullet that already cites its own PR number is not double-tagged', (t) => {
  const { dir } = makeRepo(t);
  commit(
    dir,
    'fix: resolve output path (#13)',
    '## Changelog\n\n### Fixed\n\n- the output path was wrong, see #13 for context\n'
  );

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.match(changelog, /the output path was wrong, see #13 for context\s*$/m);
});

test('a bullet keeps its indented continuation lines verbatim', (t) => {
  const { dir } = makeRepo(t);
  commit(
    dir,
    'fix: resolve output path (#14)',
    '## Changelog\n\n### Fixed\n\n- the output path was wrong\n  because of a trailing slash\n'
  );

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.match(changelog, /- the output path was wrong\n {2}because of a trailing slash \(#14\)/);
});

test('splices new bullets into an existing [Unreleased] section above the existing ones, leaving the rest untouched', (t) => {
  const { dir, initialSha } = makeRepo(t);
  const existing = [
    '# Changelog', '',
    `<!-- changelog:assembled-through sha=${initialSha} -->`, '',
    '## [Unreleased]', '',
    '### Fixed', '',
    '- an existing bullet (#1)', '',
    '## [1.0.0] — 2026-01-01', '',
    '### Added', '',
    '- the first release', '',
  ].join('\n');
  write(dir, 'CHANGELOG.md', existing);
  commit(dir, 'chore: seed an existing Unreleased section', '');

  commit(dir, 'fix: a new fix (#20)', '## Changelog\n\n### Fixed\n\n- a brand new bullet\n');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  const newIdx = changelog.indexOf('a brand new bullet');
  const existingIdx = changelog.indexOf('an existing bullet');
  const releasedIdx = changelog.indexOf('## [1.0.0]');
  assert.ok(newIdx >= 0 && existingIdx >= 0 && newIdx < existingIdx,
    'the new bullet goes above the existing one of the same category');
  assert.ok(existingIdx < releasedIdx, 'the released section stays below Unreleased');
  assert.match(changelog, /- the first release/, 'the released section is untouched');
});

test('a wholly new category heading takes its Keep a Changelog place among existing headings', (t) => {
  const { dir } = makeRepo(t);
  const initialSha = git(dir, 'rev-parse', 'HEAD');
  const existing = [
    '# Changelog', '',
    `<!-- changelog:assembled-through sha=${initialSha} -->`, '',
    '## [Unreleased]', '',
    '### Fixed', '',
    '- an existing fix (#1)', '',
  ].join('\n');
  write(dir, 'CHANGELOG.md', existing);
  commit(dir, 'chore: seed with a Fixed section', '');

  // Added ranks before Fixed in Keep a Changelog order, so it must be
  // inserted above the existing Fixed heading, not appended after it.
  commit(dir, 'feat: a new feature (#21)', '## Changelog\n\n### Added\n\n- a new feature\n');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  const addedIdx = changelog.indexOf('### Added');
  const fixedIdx = changelog.indexOf('### Fixed');
  assert.ok(addedIdx >= 0 && fixedIdx >= 0 && addedIdx < fixedIdx, changelog);
});

test('--check exits 0 and writes nothing when the file already agrees', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'fix: resolve output path (#30)', '## Changelog\n\n### Fixed\n\n- fixed a thing\n');

  const first = runAssemble(dir);
  assert.strictEqual(first.status, 0, first.stderr);
  const after = readFile(dir, 'CHANGELOG.md');

  const check = runAssemble(dir, ['--check']);
  assert.strictEqual(check.status, 0, check.stderr);
  assert.strictEqual(readFile(dir, 'CHANGELOG.md'), after, '--check must not write the file');
});

test('--check exits 1 when the file is behind HEAD', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'fix: resolve output path (#31)', '## Changelog\n\n### Fixed\n\n- fixed a thing\n');

  const check = runAssemble(dir, ['--check']);
  assert.strictEqual(check.status, 1);
  assert.match(check.stderr, /is behind HEAD/);
});

test('--since <ref> overrides the file\'s own marker as the start of the range', (t) => {
  const { dir } = makeRepo(t);
  // A commit before --since: must NOT be picked up.
  commit(dir, 'fix: should not be included (#40)', '## Changelog\n\n### Fixed\n\n- should not appear\n');
  const sinceSha = git(dir, 'rev-parse', 'HEAD');
  // A commit after --since: must be picked up.
  commit(dir, 'fix: should be included (#41)', '## Changelog\n\n### Fixed\n\n- should appear\n');

  const res = runAssemble(dir, ['--since', sinceSha]);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.ok(changelog.includes('should appear'), changelog);
  assert.ok(!changelog.includes('should not appear'), changelog);
});

test('a file with neither a marker nor --since is an error', (t) => {
  const { dir } = makeRepo(t, { changelogBody: '# Changelog\n\nno marker here\n' });
  commit(dir, 'fix: x (#50)', '## Changelog\n\n### Fixed\n\n- x\n');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /carries no.*marker.*no --since/);
});

test('--help prints the usage header and exits 0', (t) => {
  const { dir } = makeRepo(t);
  const res = runAssemble(dir, ['--help']);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /assemble-changelog\.sh/);
});

test('an unresolvable --since ref fails clearly', (t) => {
  const { dir } = makeRepo(t);
  commit(dir, 'fix: x (#51)', '## Changelog\n\n### Fixed\n\n- x\n');

  const res = runAssemble(dir, ['--since', 'no-such-ref']);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /cannot resolve --since ref/);
});

test('the marker always advances to HEAD, even when no commit in range carried a bullet', (t) => {
  const { dir } = makeRepo(t);
  const headSha = commit(dir, 'chore: no changelog entry (#60)', 'None.');

  const res = runAssemble(dir);
  assert.strictEqual(res.status, 0, res.stderr);

  const changelog = readFile(dir, 'CHANGELOG.md');
  assert.match(changelog, new RegExp(`assembled-through sha=${headSha}`));
});

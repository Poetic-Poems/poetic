'use strict';

// Tests for scripts/check-changelog-section.sh, the CI gate (requirement
// 25c, roadmap decision D27) that decides whether a pull-request
// description's title owes a `## Changelog` section and, if one is
// present, whether its shape is one scripts/assemble-changelog.sh can read.
//
// The script takes the PR body and title as plain argv — never shell-
// interpolated — so each test invokes it directly via spawnSync with an
// args array; no fixture repo or copying is needed, unlike
// test/assemble-changelog.test.js, which has to mutate a real git history.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-changelog-section.sh');

function check(body, title) {
  const args = title === undefined ? [body] : [body, title];
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });
}

test('a well-formed section with a fix title passes', () => {
  const res = check('## Changelog\n\n### Fixed\n\n- fixed a thing\n', 'fix: resolve output path');
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(res.stderr, '');
});

test('"None." with a docs title passes (docs does not owe a section, but one that is present is still checked)', () => {
  const res = check('## Changelog\n\nNone.\n', 'docs: fix a typo');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('a fix title with no ## Changelog heading at all fails, naming the omission', () => {
  const res = check('just a description, no heading', 'fix: resolve output path');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /owes a `## Changelog` section/);
});

test('a chore title with no ## Changelog heading passes (chore does not owe one)', () => {
  const res = check('just a description, no heading', 'chore: bump a dependency');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('a breaking-change marker (!) owes a section regardless of type', () => {
  const res = check('no heading here', 'refactor!: drop the legacy flag');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /owes a `## Changelog` section/);
});

test('a scoped type (type(scope):) is still recognised for the owing rule', () => {
  const res = check('## Changelog\n\n### Fixed\n\n- x\n', 'fix(build): resolve output path');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('a title commit-format itself would reject owes nothing here', () => {
  const res = check('no heading here', 'not a conventional commit title');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('a heading with only blank lines/comments is treated as absent, not empty — a non-owing title passes', () => {
  const res = check('## Changelog\n\n<!-- fill this in -->\n', 'docs: update a doc');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('a heading with only blank lines/comments still fails an owing title (same as no heading)', () => {
  const res = check('## Changelog\n\n<!-- fill this in -->\n', 'fix: resolve output path');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /owes a `## Changelog` section/);
});

test('an invalid category name is faulted', () => {
  const res = check('## Changelog\n\n### NotAKeepAChangelogCategory\n- x\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /not a Keep a Changelog category/);
});

test('a duplicate category heading is faulted', () => {
  const res = check(
    '## Changelog\n\n### Fixed\n- one\n### Added\n- two\n### Fixed\n- three\n',
    'fix: x'
  );
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /appears more than once/);
});

test('a category with no bullet under it is faulted', () => {
  const res = check('## Changelog\n\n### Fixed\n\n### Added\n- x\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /has no bullet under it/);
});

test('"None." plus a category is faulted', () => {
  const res = check('## Changelog\n\nNone.\n### Added\n- oops\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /either list the change under a category or say `None\.` alone/);
});

test('a loose prose line under a category is faulted', () => {
  const res = check('## Changelog\n\n### Fixed\n- a bullet\nloose prose\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /neither a `- ` bullet nor an indented continuation/);
});

test('an orphan indented continuation (no preceding bullet) is faulted', () => {
  const res = check('## Changelog\n\n### Fixed\n  orphan\n- a bullet\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /indented but no bullet precedes it/);
});

test('a first line that is neither None nor a category heading is faulted', () => {
  const res = check('## Changelog\n\njust prose\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /must be a `### <Category>` heading or the line `None\.`/);
});

test('more than one content-bearing ## Changelog section is faulted', () => {
  const res = check(
    '## Changelog\n\n### Fixed\n- one\n\n## Something\n\n## Changelog\n\n### Added\n- two\n',
    'fix: x'
  );
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /more than one `## Changelog` section with content/);
});

test('a fenced example of the heading is not itself a section and does not satisfy the owing rule', () => {
  const res = check('```\n## Changelog\n\nNone.\n```\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /owes a `## Changelog` section/);
});

test('an unclosed fence at the end of the body hints at the fence in the owing fault', () => {
  const res = check('## Changelog\n\n```\nstill open', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /unclosed code fence/);
});

test('an unclosed HTML comment at the end of the body hints at the comment in the owing fault', () => {
  const res = check('## Changelog\n\n<!-- still open', 'fix: x');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /unclosed <!-- comment/);
});

test('with no title argument, nothing is owed and only shape faults can fire', () => {
  const res = check('## Changelog\n\n### Fixed\n\n- x\n');
  assert.strictEqual(res.status, 0, res.stderr);
});

test('with no title argument, a shape fault still fires', () => {
  const res = check('## Changelog\n\n### NotAReal\n- x\n');
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /not a Keep a Changelog category/);
});

test('exits 2 on a usage error (no arguments)', () => {
  const res = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
  assert.strictEqual(res.status, 2);
  assert.match(res.stderr, /^usage: /);
});

test('every fault line is a GitHub Actions ::error:: annotation', () => {
  const res = check('## Changelog\n\njust prose\n', 'fix: x');
  assert.strictEqual(res.status, 1);
  for (const line of res.stderr.trim().split('\n')) {
    assert.match(line, /^::error::/, line);
  }
});

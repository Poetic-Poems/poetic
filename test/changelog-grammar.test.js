'use strict';

// Tests for lib/changelog-grammar.sh's changelog_grammar_walk, the shared
// state machine scripts/check-changelog-section.sh (a PR description) and
// scripts/assemble-changelog.sh (a squashed commit body) both read instead
// of each re-implementing the fence/HTML-comment/heading walk and the
// None/category/bullet classification underneath it.
//
// changelog_grammar_walk is a shell function, not its own script, so each
// test here sources lib/changelog-grammar.sh in a throwaway bash process and
// calls it directly, passing the body through an environment variable
// (never shell-interpolated) so arbitrary content — quotes, backticks,
// newlines — can never be read as anything but data.

const { test } = require('node:test');
const assert = require('node:assert');

const { REPO_ROOT } = require('../src/tools/repo-root');
const { runShellFunction, parseRecords } = require('./helpers/changelog-shell');

const GRAMMAR_LIB = require('path').join(REPO_ROOT, 'lib', 'changelog-grammar.sh');

function walk(body) {
  const res = runShellFunction(GRAMMAR_LIB, 'changelog_grammar_walk "$BODY"', { BODY: body });
  // changelog_grammar_walk's own last statement is `(( flag )) && printf
  // ...`, whose exit status is 1 whenever no UNCLOSED-* record fires — a
  // legitimate outcome, not a failure, so only stderr (a real shell error)
  // is asserted here, never the process's own exit status.
  assert.strictEqual(res.stderr, '', res.stderr);
  return parseRecords(res.stdout);
}

test('a well-formed section with two categories emits CATEGORY/BULLET/CATEGORY-END in order', () => {
  const records = walk([
    '## Changelog',
    '',
    '### Fixed',
    '',
    '- fixed a thing',
    '  with a continuation line',
    '',
    '### Added',
    '',
    '- added a thing',
  ].join('\n'));

  assert.deepStrictEqual(records.map((r) => r[0]), [
    'SECTION-START',
    'CATEGORY', 'BULLET', 'CONTINUATION', 'CATEGORY-END',
    'CATEGORY', 'BULLET', 'CATEGORY-END',
    'SECTION-END',
  ]);

  const fixed = records.find((r) => r[0] === 'CATEGORY' && r[2] === 'Fixed');
  assert.strictEqual(fixed[3], '1', 'Fixed is a valid category');
  assert.strictEqual(fixed[4], '0', 'Fixed is not a duplicate');

  const fixedEnd = records.find((r) => r[0] === 'CATEGORY-END' && r[2] === 'Fixed');
  assert.strictEqual(fixedEnd[3], '1', 'Fixed has exactly one bullet');

  const continuation = records.find((r) => r[0] === 'CONTINUATION');
  assert.strictEqual(continuation[3], '1', 'the continuation is open (a bullet precedes it)');
  assert.strictEqual(continuation[4], '  with a continuation line');
});

test('"None." with nothing else emits only NONE records', () => {
  const records = walk('## Changelog\n\nNone.\n');
  assert.deepStrictEqual(records.map((r) => r[0]), ['SECTION-START', 'NONE', 'SECTION-END']);
});

test('"None." followed by a category is NONE-BAD(category)', () => {
  const records = walk('## Changelog\n\nNone.\n### Added\n- oops\n');
  const bad = records.find((r) => r[0] === 'NONE-BAD');
  assert.ok(bad, 'expected a NONE-BAD record');
  assert.strictEqual(bad[2], 'category');
});

test('"None." followed by a bullet is NONE-BAD(bullet)', () => {
  const records = walk('## Changelog\n\nNone.\n- oops\n');
  const bad = records.find((r) => r[0] === 'NONE-BAD');
  assert.ok(bad, 'expected a NONE-BAD record');
  assert.strictEqual(bad[2], 'bullet');
});

test('a first line that is neither "None" nor a category heading is BAD-FIRST', () => {
  const records = walk('## Changelog\n\njust some prose\n');
  assert.strictEqual(records[1][0], 'BAD-FIRST');
  assert.strictEqual(records[1][2], 'just some prose');
});

test('an invalid category name is flagged valid=0', () => {
  const records = walk('## Changelog\n\n### NotAKeepAChangelogCategory\n- x\n');
  const cat = records.find((r) => r[0] === 'CATEGORY');
  assert.strictEqual(cat[3], '0');
});

test('a repeated category heading is flagged dup=1 on the second occurrence', () => {
  const records = walk([
    '## Changelog', '',
    '### Fixed', '- one',
    '### Added', '- two',
    '### Fixed', '- three',
  ].join('\n'));
  const fixedCats = records.filter((r) => r[0] === 'CATEGORY' && r[2] === 'Fixed');
  assert.strictEqual(fixedCats.length, 2);
  assert.strictEqual(fixedCats[0][4], '0', 'first occurrence is not a dup');
  assert.strictEqual(fixedCats[1][4], '1', 'second occurrence is a dup');
});

test('a category heading with no bullet under it closes with CATEGORY-END bullets=0', () => {
  const records = walk('## Changelog\n\n### Fixed\n\n### Added\n- x\n');
  const fixedEnd = records.find((r) => r[0] === 'CATEGORY-END' && r[2] === 'Fixed');
  assert.strictEqual(fixedEnd[3], '0');
});

test('an indented line with no preceding bullet is a closed CONTINUATION', () => {
  const records = walk('## Changelog\n\n### Fixed\n  orphan continuation\n- a bullet\n');
  const continuation = records.find((r) => r[0] === 'CONTINUATION');
  assert.strictEqual(continuation[3], '0', 'no bullet precedes it, so it is not open');
});

test('an unindented, non-bullet line under a category is LOOSE', () => {
  const records = walk('## Changelog\n\n### Fixed\n- a bullet\nloose prose line\n');
  const loose = records.find((r) => r[0] === 'LOOSE');
  assert.ok(loose, 'expected a LOOSE record');
  assert.strictEqual(loose[2], 'Fixed');
  assert.strictEqual(loose[3], 'loose prose line');
});

test('a fenced example of the heading is not itself a section', () => {
  const records = walk([
    '## Changelog', '',
    '### Fixed', '- real bullet',
    '',
    '```',
    '## Changelog',
    '### Added',
    '- not real',
    '```',
  ].join('\n'));
  // Exactly one SECTION-START: the fenced copy never opens a second section.
  assert.strictEqual(records.filter((r) => r[0] === 'SECTION-START').length, 1);
  assert.ok(!records.some((r) => r[0] === 'CATEGORY' && r[2] === 'Added'));
});

test('an HTML comment hides a heading and content inside it', () => {
  const records = walk([
    '## Changelog', '',
    '### Fixed',
    '- real bullet',
    '<!-- ### Added',
    '- hidden bullet -->',
  ].join('\n'));
  assert.ok(!records.some((r) => r[0] === 'CATEGORY' && r[2] === 'Added'));
  assert.ok(!records.some((r) => r[0] === 'BULLET' && r[2] === '- hidden bullet -->'));
});

test('a section with content that is only blank lines and comments closes with content-lines=0', () => {
  const records = walk('## Changelog\n\n<!-- nothing here yet -->\n\n');
  const end = records.find((r) => r[0] === 'SECTION-END');
  assert.strictEqual(end[2], '0');
});

test('a second ## Changelog heading starts a new, independently numbered section', () => {
  const records = walk([
    '## Changelog', '', '### Fixed', '- one', '',
    '## Something else', 'prose that closes the first section', '',
    '## Changelog', '', 'None.',
  ].join('\n'));
  const starts = records.filter((r) => r[0] === 'SECTION-START');
  assert.deepStrictEqual(starts.map((r) => r[1]), ['1', '2']);
  const none = records.find((r) => r[0] === 'NONE');
  assert.strictEqual(none[1], '2', 'the None belongs to the second section');
});

test('an unclosed fence at end of body is reported', () => {
  const res = runShellFunction(GRAMMAR_LIB, 'changelog_grammar_walk "$BODY"', {
    BODY: '## Changelog\n\n```\nstill open\n',
  });
  assert.strictEqual(res.stderr, '', res.stderr);
  assert.ok(res.stdout.includes('UNCLOSED-FENCE\n'), res.stdout);
});

test('an unclosed HTML comment at end of body is reported', () => {
  const res = runShellFunction(GRAMMAR_LIB, 'changelog_grammar_walk "$BODY"', {
    BODY: '## Changelog\n\n<!-- still open\n',
  });
  assert.strictEqual(res.stderr, '', res.stderr);
  assert.ok(res.stdout.includes('UNCLOSED-COMMENT\n'), res.stdout);
});

test('a line carrying its own leading tab survives verbatim in a BULLET record', () => {
  // BULLET lines cannot begin with whitespace, so a tab *inside* a bullet
  // (not leading/trailing) is the safe case documented in the script's own
  // header; this pins that a literal tab character round-trips at all.
  const records = walk('## Changelog\n\n### Fixed\n- a bullet\twith an embedded tab\n');
  const bullet = records.find((r) => r[0] === 'BULLET');
  assert.strictEqual(bullet[2], '- a bullet\twith an embedded tab');
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');

// Convenience: parse a minimal poem body and return the first version's segments.
function parseSegments(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse().versions[0].segments;
}

// ── Trailing-backslash line continuation ────────────────────────────────────

test('title: a single trailing backslash joins the next physical line', () => {
  const result = new PoemParser(
    'A Very \\\nLong Title\n2020-01-01\n\nverse line\n'
  ).parse();
  assert.strictEqual(result.title, 'A Very Long Title');
});

test('body: `\\\\` (even run) before newline keeps the newline, one literal backslash', () => {
  const segments = parseSegments(['{Verse}', 'foo\\\\', 'bar']);
  const lines = segments[0].lines;
  // Exactly one backslash between "foo" and the line break, and the two
  // words remain on separate lines (not joined into "foobar").
  assert.match(lines, /foo\\(\r?\n)bar/);
  assert.doesNotMatch(lines, /foo\\\\/, 'should not retain two backslashes');
  assert.doesNotMatch(lines, /foobar/, 'should not have joined into one word');
});

test('body: `\\\\\\` (odd run of 3) before newline leaves one literal backslash and joins', () => {
  const segments = parseSegments(['{Verse}', 'foo\\\\\\', 'bar']);
  // floor(3/2) = 1 literal backslash, then the newline is nullified so the
  // next physical line is joined directly onto it: "foo\bar".
  assert.strictEqual(segments[0].lines, 'foo\\bar\n');
});

test('body: a backslash followed by trailing whitespace is not a continuation', () => {
  const segments = parseSegments(['{Verse}', 'foo\\ ', 'bar']);
  const lines = segments[0].lines;
  // The backslash stays literal and the line is NOT joined onto "bar" - the
  // two words must not appear concatenated with only the escaped space
  // between them and no line break.
  assert.doesNotMatch(lines, /foo\\ bar/);
  assert.match(lines, /bar/);
});

test('no continuation inside a raw <<< ... >>> block: trailing backslash preserved, newline kept', () => {
  const src = [
    'Title', '1970-01-01', '',
    '{Verse}',
    '<<<',
    'line one\\',
    'line two',
    '>>>',
    '',
  ].join('\n');
  const result = new PoemParser(src).parse();
  const segment = result.versions[0].segments[0];
  assert.ok(segment.parts, 'segment should have parts when a block is present');
  const htmlPart = segment.parts.find((p) => p.type === 'html');
  assert.ok(htmlPart, 'should find an html part');
  assert.strictEqual(htmlPart.html, 'line one\\\nline two');
});

test('EOF dangling continuation: odd run on the very last line keeps floor(N/2) backslashes, joins nothing', () => {
  // 3 trailing backslashes at true end-of-file (no following physical line).
  const segments = parseSegments(['{Verse}', 'tail\\\\\\']);
  assert.strictEqual(segments[0].lines, 'tail\\\n');
});

test('a long backslash run not at end-of-line does not hang (ReDoS guard)', () => {
  // Regression guard for CodeQL js/polynomial-redos: joinContinuedLines() used
  // to locate the trailing run with /(\\+)(\r?)$/, which backtracks
  // polynomially when a long backslash run turns out not to be anchored at
  // the string end (~8.5s for 100,000 backslashes pre-fix; must now be
  // near-instant). Exercised directly, bypassing convertMarkup, so this test
  // is specific to the trailing-run scan.
  const parser = new PoemParser('T\n1970-01-01\n\n{V}\nline\n');
  parser.lines = ['xx' + '\\'.repeat(100000) + ' trailing'];
  const t0 = Date.now();
  parser.joinContinuedLines();
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(parser.lines.length, 1);
  assert.match(parser.lines[0], / trailing$/);
});

test('CRLF input: a trailing backslash before \\r\\n still continues the line', () => {
  const src = 'A Very \\\r\nLong Title\r\n2020-01-01\r\n\r\nverse line\r\n';
  const result = new PoemParser(src).parse();
  assert.strictEqual(result.title, 'A Very Long Title');
});

test('CRLF input: continuation joins a body line split with \\r\\n', () => {
  const src = [
    'Title', '1970-01-01', '',
    '{Verse}',
    'foo\\',
    'bar',
    '',
  ].join('\r\n');
  const result = new PoemParser(src).parse();
  const segment = result.versions[0].segments[0];
  // The two words are joined with no line break between them; a trailing \r
  // may remain on the logical line since this poem is CRLF end-to-end and
  // nothing besides continuation-folding strips \r from body content.
  assert.match(segment.lines, /^foobar\r?\n$/);
});

test('label + parameter list: continuation across `{Verse}(color=\\` and `blue)`', () => {
  const segments = parseSegments(['{Verse}(color=\\', 'blue)', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.deepStrictEqual(segments[0].params, { color: 'blue' });
});

// ── Audio: multi-line param list joined via continuation ───────────────────

test('audio: a Mega line split across continued lines parses value + ratio + height', () => {
  const src = [
    'Title', '1970-01-01', '',
    '{Verse}', 'a line',
    '====', '',
    'Mega: \\',
    '  <ID> ( \\',
    '    ratio=21:9, \\',
    '    height=400 \\',
    '  )',
    '====', '',
  ].join('\n');
  const result = new PoemParser(src).parse();
  assert.deepStrictEqual(result.audio.mega, { value: '<ID>', ratio: '21:9', height: '400' });
});

// ── Reserved `\?` ────────────────────────────────────────────────────────────

test('`\\?` (odd count) throws in the poem body', () => {
  assert.throws(
    () => new PoemParser('T\n2020-01-01\n\n{V}\nwhat\\?\n').parse(),
    /Reserved syntax: '\\\?' is reserved/
  );
});

test('`\\?` (odd count) throws in a segment label', () => {
  assert.throws(
    () => new PoemParser('T\n2020-01-01\n\n{Ver\\?se}\nline\n').parse(),
    /Reserved syntax/
  );
});

test('`\\?` (odd count) throws in a parameter value', () => {
  assert.throws(
    () => new PoemParser('T\n2020-01-01\n\n{Verse}(a=what\\?)\nline\n').parse(),
    /Reserved syntax/
  );
});

test('`\\\\?` (even count) does NOT throw and decodes to a literal backslash then "?"', () => {
  const result = new PoemParser('T\n2020-01-01\n\n{V}\nwhat\\\\?\n').parse();
  assert.match(result.versions[0].segments[0].lines, /what\\\?/);
});

test('`\\\\?` (even count) does NOT throw in a parameter value either', () => {
  const segments = parseSegments(['{Verse}(a=what\\\\?)', 'line']);
  assert.strictEqual(segments[0].params.a, 'what\\?');
});

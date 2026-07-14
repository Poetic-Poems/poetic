'use strict';

/**
 * Tests for the Metadata section (labels + directives), the bottom
 * `====`-delimited section that follows Analysis. See poem-syntax.ebnf
 * (METADATA SECTION) and docs/YAML-SCHEMA.md for the authoritative spec.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');

// Convenience: parse a poem whose Metadata section contains `metadataLines`.
// Reaching Metadata requires the end-of-poem, end-of-audio, end-of-postscript,
// and end-of-analysis markers, even though audio/postscript/analysis are all
// empty here.
function parseMetadataFrom(metadataLines) {
  const src = [
    'Title', '1970-01-01', '', '{Verse}', 'a line',
    '====', '',
    '====', '',
    '====', '',
    '====', '',
    ...metadataLines,
  ].join('\n');
  return new PoemParser(src).parse();
}

// Convenience: parse a poem whose Preamble (section 0, above the title) contains
// `preambleLines`, with an optional Metadata section carrying `metadataLines`.
function parseWithPreamble(preambleLines, metadataLines = []) {
  const src = [
    ...preambleLines,
    'Title', '1970-01-01', '', '{Verse}', 'a line',
    '====', '',
    '====', '',
    '====', '',
    '====', '',
    ...metadataLines,
  ].join('\n');
  return new PoemParser(src).parse();
}

// ── Labels ──────────────────────────────────────────────────────────────────

test('labels are parsed into result.labels in order, de-duplicated', () => {
  const result = parseMetadataFrom(['#nature', '#solitude', '#nature']);
  assert.deepStrictEqual(result.labels, ['nature', 'solitude']);
});

test('a "# comment" line (hash + space) is ignored, not treated as a label', () => {
  const result = parseMetadataFrom([
    '# this is a comment, not a label',
    '#realtag',
  ]);
  assert.deepStrictEqual(result.labels, ['realtag']);
});

test('a bare "#" line (hash + end-of-line) is a comment, not a label', () => {
  const result = parseMetadataFrom(['#', '#realtag']);
  assert.deepStrictEqual(result.labels, ['realtag']);
});

// ── Directives ──────────────────────────────────────────────────────────────

test('directives are parsed into result.directives with { name, attributes }', () => {
  const result = parseMetadataFrom(['%example.directive key:value']);
  assert.deepStrictEqual(result.directives, [
    { name: 'example.directive', attributes: { key: 'value' } },
  ]);
});

test('a directive with no attributes omits the attributes field', () => {
  const result = parseMetadataFrom(['%bare.directive']);
  assert.deepStrictEqual(result.directives, [{ name: 'bare.directive' }]);
  assert.ok(!('attributes' in result.directives[0]), 'must omit attributes key entirely');
});

test('a directive line with multiple key:value attribute tokens', () => {
  const result = parseMetadataFrom(['%multi.directive a:1 b:2']);
  assert.deepStrictEqual(result.directives, [
    { name: 'multi.directive', attributes: { a: '1', b: '2' } },
  ]);
});

test('directives are collected in source order, duplicates allowed', () => {
  const result = parseMetadataFrom(['%d k:1', '%d k:2']);
  assert.deepStrictEqual(result.directives, [
    { name: 'd', attributes: { k: '1' } },
    { name: 'd', attributes: { k: '2' } },
  ]);
});

// ── ReDoS guards ─────────────────────────────────────────────────────────────
//
// Regression guards for CodeQL js/polynomial-redos alerts 11 (directive
// lines) and 12 (label lines): parseDirectiveLine() and the Metadata
// section's label matching used to be
// /^\s*%([\w.-]+)((?:\s+[\w.]+:[\w.-]+)*)(\s+#.*)?\s*$/i and
// /^\s*#([^&<>\\#\s]+?)(\s+#.*)?\s*$/i respectively. Neither reproduces a
// measurable hang against quick local adversarial input (their repeated/lazy
// groups don't overlap with disjoint tail character classes enough to force
// real backtracking), but CodeQL flags both structurally; both are now
// scanned by hand instead, which removes the flagged construct regardless.
// These guards just confirm a large adversarial line is still rejected
// promptly, not that a hang was ever reproduced.

test('a directive line with many attribute tokens and invalid trailing content is rejected promptly', () => {
  const line = '%name' + ' a:a'.repeat(50000) + ' !';
  const parser = new PoemParser('');
  const t0 = Date.now();
  const directive = parser.parseDirectiveLine(line);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(directive, null);
});

test('a directive line with many valid attribute tokens parses them all promptly', () => {
  const line = '%name' + ' a:a'.repeat(50000);
  const parser = new PoemParser('');
  const t0 = Date.now();
  const directive = parser.parseDirectiveLine(line);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(directive.name, 'name');
  assert.strictEqual(Object.keys(directive.attributes).length, 1); // same key repeated
  assert.strictEqual(directive.attributes.a, 'a');
});

test('a label line with a long run of label characters and invalid trailing content is rejected promptly', () => {
  const line = '#' + 'a'.repeat(100000) + '<';
  const parser = new PoemParser('');
  const t0 = Date.now();
  const label = parser.matchLabelLine(line);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(label, null);
});

test('a label line with a long run of valid label characters is parsed promptly', () => {
  const line = '#' + 'a'.repeat(100000);
  const parser = new PoemParser('');
  const t0 = Date.now();
  const label = parser.matchLabelLine(line);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(label, 'a'.repeat(100000));
});

// ── Inline comments ──────────────────────────────────────────────────────────

test('inline comments on label and directive lines are stripped', () => {
  const result = parseMetadataFrom([
    '#tag  # note',
    '%d k:v  # note',
  ]);
  assert.deepStrictEqual(result.labels, ['tag']);
  assert.deepStrictEqual(result.directives, [{ name: 'd', attributes: { k: 'v' } }]);
});

// ── Absence ──────────────────────────────────────────────────────────────────

test('labels and directives keys are absent when the Metadata section is present but empty', () => {
  const result = parseMetadataFrom([]);
  assert.ok(!('labels' in result), 'labels must be absent, not an empty array');
  assert.ok(!('directives' in result), 'directives must be absent, not an empty array');
});

test('labels and directives keys are absent when the Metadata section is entirely absent (EOF beforehand)', () => {
  const src = ['Title', '1970-01-01', '', '{Verse}', 'a line'].join('\n');
  const result = new PoemParser(src).parse();
  assert.ok(!('labels' in result));
  assert.ok(!('directives' in result));
});

// ── Unrecognised lines ────────────────────────────────────────────────────────

test('an unrecognised metadata line is skipped without throwing and without being added to labels/directives', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const result = parseMetadataFrom(['not a valid metadata line', '#realtag']);
    assert.deepStrictEqual(result.labels, ['realtag']);
    assert.ok(!('directives' in result));
    assert.ok(
      warnings.some((w) => /unrecognised metadata line/.test(w)),
      'expected a warning about the unrecognised line'
    );
  } finally {
    console.warn = originalWarn;
  }
});

// ── Directives declared in the Preamble ───────────────────────────────────────

test('a directive in the Preamble is parsed into result.directives, title still parses', () => {
  const result = parseWithPreamble(['%example.directive key:value']);
  assert.deepStrictEqual(result.directives, [
    { name: 'example.directive', attributes: { key: 'value' } },
  ]);
  assert.strictEqual(result.title, 'Title');
});

test('a Preamble directive with no attributes omits the attributes field', () => {
  const result = parseWithPreamble(['%bare.directive']);
  assert.deepStrictEqual(result.directives, [{ name: 'bare.directive' }]);
  assert.ok(!('attributes' in result.directives[0]), 'must omit attributes key entirely');
});

test('directives in both the Preamble and the Metadata section merge, preamble first', () => {
  const result = parseWithPreamble(['%pre a:1'], ['%meta b:2']);
  assert.deepStrictEqual(result.directives, [
    { name: 'pre', attributes: { a: '1' } },
    { name: 'meta', attributes: { b: '2' } },
  ]);
});

test('a Preamble directive interspersed with a variable definition and blank lines is still extracted', () => {
  const result = parseWithPreamble([
    '',
    '={who}=World',
    '%pre.directive k:v',
    '',
  ]);
  assert.deepStrictEqual(result.directives, [
    { name: 'pre.directive', attributes: { k: 'v' } },
  ]);
  assert.strictEqual(result.title, 'Title');
});

// ── Title `\%` escape (a title may begin with a literal `%`) ───────────────────

test('title \\%Intro decodes to "%Intro" and is not swallowed as a directive', () => {
  const src = ['\\%Intro', '1970-01-01', '', '{Verse}', 'a line'].join('\n');
  const result = new PoemParser(src).parse();
  assert.strictEqual(result.title, '%Intro');
  assert.ok(!('directives' in result), 'the escaped line is the title, not a directive');
});

test('title \\%chapter one:two is a title (not a directive it would resemble unescaped)', () => {
  const src = ['\\%chapter one:two', '1970-01-01', '', '{Verse}', 'a line'].join('\n');
  const result = new PoemParser(src).parse();
  assert.strictEqual(result.title, '%chapter one:two');
  assert.ok(!('directives' in result), 'must not be parsed as a directive');
});

test('title \\%{slug} keeps its backslash through the parse stage (render-time escape)', () => {
  const src = ['\\%{slug}', '1970-01-01', '', '{Verse}', 'a line'].join('\n');
  const result = new PoemParser(src).parse();
  assert.strictEqual(result.title, '\\%{slug}');
});

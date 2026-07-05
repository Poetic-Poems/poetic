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

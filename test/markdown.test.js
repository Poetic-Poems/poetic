'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { renderGfm } = require('../src/tools/markdown');
const { PoemParser } = require('../src/tools/poem-to-yaml');

// Convenience: parse a minimal poem body and return the first version's segments.
function parseSegments(bodyLines) {
  const src = ['Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse().versions[0].segments;
}

test('renderGfm offsets heading levels by +2 (clamped at h6)', () => {
  assert.match(renderGfm('# A'), /<h3>A<\/h3>/);
  assert.match(renderGfm('## A'), /<h4>A<\/h4>/);
  assert.match(renderGfm('### A'), /<h5>A<\/h5>/);
  assert.match(renderGfm('#### A'), /<h6>A<\/h6>/);
  assert.match(renderGfm('##### A'), /<h6>A<\/h6>/); // clamped
  assert.doesNotMatch(renderGfm('# A'), /<h1>/);
});

test('renderGfm supports GFM lists, tables and strikethrough', () => {
  assert.match(renderGfm('- a\n- b'), /<ul>\s*<li>a<\/li>/);
  assert.match(renderGfm('| x | y |\n|---|---|\n| 1 | 2 |'), /<table>[\s\S]*<th>x<\/th>/);
  assert.match(renderGfm('~~gone~~'), /<s>gone<\/s>/);
});

test('span /.class{} — a single class is emitted as-is', () => {
  assert.match(parseSegments(['{V}', '/.highlight{x}'])[0].lines, /<span class="highlight">x<\/span>/);
  assert.match(parseSegments(['{V}', '/.25{x}'])[0].lines, /<span class="25">x<\/span>/);
});

test('span /.a.b{} — dots separate multiple classes, hyphens are kept', () => {
  assert.match(parseSegments(['{V}', '/.red.bold{x}'])[0].lines, /<span class="red bold">x<\/span>/);
  assert.match(
    parseSegments(['{V}', '/.poetic-alternatives.25{x}'])[0].lines,
    /<span class="poetic-alternatives 25">x<\/span>/
  );
  assert.match(parseSegments(['{V}', '/.text-highlight{x}'])[0].lines, /<span class="text-highlight">x<\/span>/);
});

test('renderGfm typographer converts dashes and quotes', () => {
  assert.match(renderGfm('a -- b'), /–/);  // en dash
  assert.match(renderGfm('a --- b'), /—/); // em dash
});

test('convertMarkup uses Markdown emphasis (* = em, ** = strong)', () => {
  const p = new PoemParser('');
  assert.strictEqual(p.convertMarkup('*a*'), '<em>a</em>');
  assert.strictEqual(p.convertMarkup('_a_'), '<em>a</em>');
  assert.strictEqual(p.convertMarkup('**a**'), '<strong>a</strong>');
  assert.strictEqual(p.convertMarkup('__a__'), '<strong>a</strong>');
});

test('convertMarkup decodes \\% to a literal % (body/label escape)', () => {
  const p = new PoemParser('');
  assert.strictEqual(p.convertMarkup('\\%foo'), '%foo');
  assert.strictEqual(p.convertMarkup('a \\% b'), 'a % b');
});

test('convertMarkup leaves \\%{...} untouched (render-time context-var escape survives)', () => {
  const p = new PoemParser('');
  // The backslash MUST survive so substituteContextVars() can decode \%{slug}
  // later; only \% NOT followed by { is decoded here.
  assert.strictEqual(p.convertMarkup('\\%{slug}'), '\\%{slug}');
});

test('a body line \\%foo decodes to %foo through the segment pipeline', () => {
  const segments = parseSegments(['{Verse}', '\\%foo']);
  assert.strictEqual(segments[0].lines, '%foo\n');
});

test('a long backslash run with no "?" does not hang (ReDoS guard)', () => {
  // Regression guard for CodeQL js/polynomial-redos (code-scanning-alert-13):
  // checkReservedEscape() (called by convertMarkup()) used to detect the
  // reserved "\?" escape with the unanchored /(\\+)\?/g, which — since a
  // `?` need not exist anywhere in the text — backtracks polynomially
  // trying every start position within a long backslash run (empirically
  // ~33s for a 200,000-backslash input pre-fix; must now be near-instant).
  // Exercised directly, bypassing convertMarkup(), to isolate this guard from
  // the escape-restoration pass tested separately below.
  const p = new PoemParser('');
  const t0 = Date.now();
  p.checkReservedEscape('\\'.repeat(200000));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test('convertMarkup restores a large number of escapes without quadratic slowdown', () => {
  // Regression guard for TD26071502: escape restoration used to call
  // String.prototype.replace() once per escape inside a loop, each call
  // rescanning the whole placeholder-laden string from the start —
  // O(N^2) for N escapes (empirically ~900ms for 50,000 escapes pre-fix,
  // tens of seconds projected for 200,000). Must now be near-instant.
  const p = new PoemParser('');
  const input = '\\'.repeat(400000); // 200,000 escaped backslash pairs
  const t0 = Date.now();
  const result = p.convertMarkup(input);
  const elapsed = Date.now() - t0;
  assert.strictEqual(result, '\\'.repeat(200000));
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test('convertMarkup decodes a long even backslash run to half as many literal backslashes', () => {
  const p = new PoemParser('');
  assert.strictEqual(p.convertMarkup('\\'.repeat(2000)), '\\'.repeat(1000));
});

test('<<<markdown>>> block in a segment renders GFM with variable substitution', () => {
  const segments = parseSegments([
    '={who}=World',
    '{Verse}',
    'plain line',
    '<<<markdown',
    '- item for ${who}',
    '>>>',
    'after the block',
  ]);
  const verse = segments[0];
  assert.ok(verse.parts, 'segment should use parts when a block is present');
  const types = verse.parts.map((p) => p.type);
  assert.deepStrictEqual(types, ['lines', 'html', 'lines']);
  assert.match(verse.parts[1].html, /<ul>\s*<li>item for World<\/li>/);
  assert.match(verse.parts[0].lines, /plain line/);
  assert.match(verse.parts[2].lines, /after the block/);
});

test('bare <<< block passes raw HTML through without Markdown, but substitutes variables', () => {
  const segments = parseSegments([
    '={who}=World',
    '{Verse}',
    'before',
    '<<<',
    '<div class="x">raw ${who}</div>',
    '>>>',
  ]);
  const htmlPart = segments[0].parts.find((p) => p.type === 'html');
  // A block suppresses Markdown rendering, not variable substitution.
  assert.strictEqual(htmlPart.html, '<div class="x">raw World</div>');
});

test('segments without blocks keep the simple `lines` shape', () => {
  const segments = parseSegments(['{Verse}', 'one', 'two']);
  assert.strictEqual(segments[0].parts, undefined);
  assert.strictEqual(segments[0].lines, 'one\ntwo\n');
});

test('blank lines still separate unlabelled segments', () => {
  const segments = parseSegments(['stanza one', '', 'stanza two']);
  assert.strictEqual(segments.length, 2);
});

test('trailing text after line-anchored tokens is ignored', () => {
  const segments = parseSegments(['{Verse}  # a comment', 'a line']);
  assert.strictEqual(segments[0].label, 'Verse');
});

test('analysis content is rendered as GFM', () => {
  const src = [
    'Title', '1970-01-01', '', '{Verse}', 'x', '====', '====', '====',
    '{Full}', '', '# Heading', '', '- a', '- b',
  ].join('\n');
  const result = new PoemParser(src).parse();
  assert.match(result.analysis.full, /<h3>Heading<\/h3>/);
  assert.match(result.analysis.full, /<ul>\s*<li>a<\/li>/);
});

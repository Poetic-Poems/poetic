'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { convertMarkup, convertSpacesToNbsp, checkReservedEscape, reservedEscapeError } =
  require('../src/tools/poem-markup');

test('convertMarkup uses Markdown emphasis (* = em, ** = strong)', () => {
  assert.strictEqual(convertMarkup('*a*'), '<em>a</em>');
  assert.strictEqual(convertMarkup('_a_'), '<em>a</em>');
  assert.strictEqual(convertMarkup('**a**'), '<strong>a</strong>');
  assert.strictEqual(convertMarkup('__a__'), '<strong>a</strong>');
});

test('convertMarkup renders strikethrough, dashes, and smart quotes', () => {
  assert.strictEqual(convertMarkup('~~gone~~'), '<s>gone</s>');
  assert.strictEqual(convertMarkup('a -- b'), 'a &#8211; b');
  assert.strictEqual(convertMarkup('a --- b'), 'a &#8212; b');
  assert.strictEqual(convertMarkup('`x`'), '&#8216;x&#8217;');
  assert.strictEqual(convertMarkup('"x"'), '&#8220;x&#8221;');
});

test('convertMarkup renders links and span elements', () => {
  assert.strictEqual(convertMarkup('[text|example.com]'), '<a href="https://example.com">text</a>');
  assert.strictEqual(convertMarkup('/.highlight{x}'), '<span class="highlight">x</span>');
  assert.strictEqual(convertMarkup('/.a.b{x}'), '<span class="a b">x</span>');
});

test('convertMarkup decodes \\% to a literal % (body/label escape)', () => {
  assert.strictEqual(convertMarkup('\\%foo'), '%foo');
  assert.strictEqual(convertMarkup('a \\% b'), 'a % b');
});

test('convertMarkup leaves \\%{...} untouched (render-time context-var escape survives)', () => {
  // The backslash MUST survive so substituteContextVars() can decode \%{slug}
  // later; only \% NOT followed by { is decoded here.
  assert.strictEqual(convertMarkup('\\%{slug}'), '\\%{slug}');
});

test('convertMarkup throws the reserved-escape error for an odd backslash run before "?"', () => {
  assert.throws(() => convertMarkup('a \\? b'), /Reserved syntax/);
  assert.doesNotThrow(() => convertMarkup('a \\\\? b'));
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
  const t0 = Date.now();
  checkReservedEscape('\\'.repeat(200000));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test('convertMarkup restores a large number of escapes without quadratic slowdown', () => {
  // Regression guard for TD26071502: escape restoration used to call
  // String.prototype.replace() once per escape inside a loop, each call
  // rescanning the whole placeholder-laden string from the start —
  // O(N^2) for N escapes (empirically ~900ms for 50,000 escapes pre-fix,
  // tens of seconds projected for 200,000). Must now be near-instant.
  const input = '\\'.repeat(400000); // 200,000 escaped backslash pairs
  const t0 = Date.now();
  const result = convertMarkup(input);
  const elapsed = Date.now() - t0;
  assert.strictEqual(result, '\\'.repeat(200000));
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test('convertMarkup decodes a long even backslash run to half as many literal backslashes', () => {
  assert.strictEqual(convertMarkup('\\'.repeat(2000)), '\\'.repeat(1000));
});

test('convertSpacesToNbsp converts leading indentation to &nbsp;', () => {
  assert.strictEqual(convertSpacesToNbsp('  x'), '&nbsp;&nbsp;x');
});

test('convertSpacesToNbsp keeps the first space of a run and nbsp-fills the rest', () => {
  assert.strictEqual(convertSpacesToNbsp('a   b'), 'a &nbsp;&nbsp;b');
});

test('convertSpacesToNbsp leaves single internal spaces untouched', () => {
  assert.strictEqual(convertSpacesToNbsp('a b c'), 'a b c');
});

test('reservedEscapeError returns an Error describing the reserved "\\?" syntax', () => {
  const err = reservedEscapeError();
  assert.ok(err instanceof Error);
  assert.match(err.message, /\\\?.*reserved/);
});

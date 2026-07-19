'use strict';

/**
 * Strikethrough is a two-character delimiter pair, `~~text~~` -> `<s>text</s>`,
 * exactly like strong's `**text**`/`__text__` -- in both the poem-body WYSIWYG
 * dialect (convertMarkup() in poem-parser.js) and the restricted title-markup
 * subset (renderTitleMarkup() in render-core.js). A single `~` is never itself
 * markup: it is plain literal text, deliberately left unassigned and reserved
 * for a possible future subscript syntax. `\~` still decodes to a literal `~`.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');
const { renderTitleMarkup } = require('../src/tools/render-core');
const { YamlToPoemConverter } = require('../src/tools/yaml-to-poem');

// Convenience: parse a minimal poem body and return the first version's segments.
function parseSegments(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse().versions[0].segments;
}

// ── Body WYSIWYG dialect (convertMarkup) ────────────────────────────────────

test('body: ~~word~~ becomes <s>word</s>', () => {
  const segments = parseSegments(['{Verse}', 'a ~~struck~~ word']);
  assert.match(segments[0].lines, /a <s>struck<\/s> word/);
});

test('body: a single ~word~ is left literal (reserved for a future subscript syntax)', () => {
  const segments = parseSegments(['{Verse}', 'a ~word~ b']);
  assert.match(segments[0].lines, /a ~word~ b/);
  assert.doesNotMatch(segments[0].lines, /<s>/);
});

test('body: unmatched ~~ stays literal', () => {
  const segments = parseSegments(['{Verse}', 'a ~~word with no closing pair']);
  assert.match(segments[0].lines, /a ~~word with no closing pair/);
  assert.doesNotMatch(segments[0].lines, /<s>/);
});

test('body: \\~ escapes a literal ~, including writing two adjacent literal tildes', () => {
  const segments = parseSegments(['{Verse}', 'a \\~\\~word\\~\\~ b']);
  assert.match(segments[0].lines, /a ~~word~~ b/);
  assert.doesNotMatch(segments[0].lines, /<s>/);
});

test('body: ~~ pairs match across lines within a paragraph but not across paragraph boundaries', () => {
  const spanning = parseSegments(['{Verse}', 'a ~~word', 'continued~~ b']);
  assert.match(spanning[0].lines, /<s>word\ncontinued<\/s>/);

  const acrossParagraphs = parseSegments(['{Verse}', 'a ~~word', '', 'continued~~ b']);
  assert.doesNotMatch(acrossParagraphs[0].lines, /<s>/);
});

// ── Title-markup subset (renderTitleMarkup) ─────────────────────────────────

test('title: ~~word~~ becomes <s>word</s>', () => {
  assert.strictEqual(renderTitleMarkup('a ~~struck~~ word'), 'a <s>struck</s> word');
});

test('title: a single ~word~ is left literal (reserved for a future subscript syntax)', () => {
  assert.strictEqual(renderTitleMarkup('a ~word~ b'), 'a ~word~ b');
});

test('title: unmatched ~~ stays literal', () => {
  assert.strictEqual(renderTitleMarkup('a ~~word with no closing pair'), 'a ~~word with no closing pair');
});

test('title: \\~ escapes a literal ~, including writing two adjacent literal tildes', () => {
  assert.strictEqual(renderTitleMarkup('a \\~\\~word\\~\\~ b'), 'a ~~word~~ b');
});

// ── YAML -> .poem reverse conversion (stripHtmlTags) ────────────────────────
// yaml-to-poem.js converts HTML back to WYSIWYG-dialect markup (the inverse
// of convertMarkup), e.g. when a poem's YAML is edited and written back out.

test('yaml-to-poem: <s>text</s> becomes ~~text~~ (matching convertMarkup\'s pairing)', () => {
  const converter = new YamlToPoemConverter({});
  assert.strictEqual(converter.stripHtmlTags('a <s>struck</s> word'), 'a ~~struck~~ word');
});

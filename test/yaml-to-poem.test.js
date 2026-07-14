'use strict';

/**
 * Tests for yaml-to-poem.js's entity handling. See CHANGELOG.md's Security
 * entry for code-scanning-alert-2 (js/double-escaping) for the bug these
 * regression cases guard against.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { YamlToPoemConverter } = require('../src/tools/yaml-to-poem');

// convertEntitiesToMarkup only reads `this.data`, so an empty converter
// instance is enough to exercise it directly.
const converter = new YamlToPoemConverter({});
const convert = (text) => converter.convertEntitiesToMarkup(text);

// ── smart quotes / dashes / named entities ──────────────────────────────────

test('convertEntitiesToMarkup: paired smart double quotes become markup quotes', () => {
  assert.strictEqual(convert('&#8220;Hello&#8221;'), '"Hello"');
});

test('convertEntitiesToMarkup: paired smart single quotes become backtick markup', () => {
  assert.strictEqual(convert('&#8216;Hello&#8217;'), '`Hello`');
});

test('convertEntitiesToMarkup: unpaired smart quotes fall back to plain quote chars', () => {
  assert.strictEqual(convert('&#8220;Hello'), '"Hello');
  assert.strictEqual(convert('Hello&#8217;'), 'Hello`');
});

test('convertEntitiesToMarkup: em/en dashes become markup dashes', () => {
  assert.strictEqual(convert('a &#8212; b &#8211; c'), 'a --- b -- c');
});

test('convertEntitiesToMarkup: named entities decode to their plain characters', () => {
  assert.strictEqual(convert('&ldquo;Hi&rdquo;&mdash;&nbsp;there'), '"Hi"--- there');
});

test('convertEntitiesToMarkup: basic character entities decode to plain characters', () => {
  assert.strictEqual(convert('&#39; &#34; &#60; &#62; &#38;'), "' \" < > &");
});

// ── double-escaping regression (code-scanning-alert-2) ──────────────────────
//
// &#38; is the numeric entity for a literal "&". Decoding it before every
// other entity pattern has run lets the "&" it produces combine with
// left-over digits/punctuation into a *new* entity-shaped sequence -- e.g.
// "&#38;#8220;" is literally the text "&#8220;", but decoding &#38; first
// reconstitutes "&#8220;" mid-pipeline, which a still-pending replace then
// decodes a second time into a curly quote. Literal text that merely
// mentions an entity must survive unmangled.

test('convertEntitiesToMarkup: literal text about smart-quote entities is not double-decoded', () => {
  assert.strictEqual(
    convert('&#38;#8220;Hello&#38;#8221;'),
    '&#8220;Hello&#8221;'
  );
});

test('convertEntitiesToMarkup: literal text about an apostrophe entity is not double-decoded', () => {
  assert.strictEqual(convert('&#38;#39;'), '&#39;');
});

test('convertEntitiesToMarkup: literal text about a dash entity is not double-decoded', () => {
  assert.strictEqual(convert('&#38;#8211;'), '&#8211;');
});

test('convertEntitiesToMarkup: a genuine standalone ampersand still decodes', () => {
  assert.strictEqual(convert('Tom &#38; Jerry'), 'Tom & Jerry');
});

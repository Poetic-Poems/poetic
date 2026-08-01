'use strict';

/**
 * Tests for yaml-to-poem.js's entity handling, plus corpus-wide `====`
 * end-marker stability (TD-PPpoet-26080102) at the bottom of the file. See
 * CHANGELOG.md's Security entry for code-scanning-alert-2 (js/double-escaping)
 * for the bug the entity-handling regression cases guard against.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { YamlToPoemConverter } = require('../src/tools/yaml-to-poem');
const { PoemParser } = require('../src/tools/poem-parser');
const { parsePoemFile } = require('../src/tools/poem-to-yaml');

// convertEntitiesToMarkup operates purely on its `text` argument and reads no
// instance state, so a bare converter instance is enough to exercise it.
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

test('convertEntitiesToMarkup: an entity nested inside a paired smart quote still decodes', () => {
  assert.strictEqual(convert('&#8220;Tom &#38; Jerry&#8221;'), '"Tom & Jerry"');
});

// ── Corpus-wide `====` end-marker stability (TD-PPpoet-26080102) ────────────
//
// writeVersions()/writeAudio()/writePostscript() used to emit their `====`
// section terminator unconditionally, even when every later section was
// empty -- so `yaml-to-poem.js --all` could never be a clean no-op: each run
// appended more trailing markers to a poem with no audio/postscript/analysis/
// metadata of its own. POEM-SYNTAX.md's rule is that a divider is written
// "only if there is subsequent non-empty content" (§1, and see the Metadata
// section's own worked example needing all four end markers only because
// Metadata itself has content). These tests exercise that rule against this
// repo's actual `.poem` corpus, so a regression here is caught by the test
// suite rather than showing up as unexplained diff noise in a consumer repo.

const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');
const SHARED_POEM_PATH = path.join(POEM_DIR, '.shared.poem');
const SHARED_POEM_PREFIX = fs.existsSync(SHARED_POEM_PATH) ? fs.readFileSync(SHARED_POEM_PATH, 'utf8') : '';

// Parse regenerated .poem *text* (as opposed to a file on disk) the same way
// parsePoemFile() parses a real corpus file: with src/poems/poem/.shared.poem's
// variable definitions (e.g. `${author}`) prepended. Needed because a second
// round-trip pass has no file of its own to look the shared poem up next to.
function parsePoemText(text) {
  return new PoemParser(SHARED_POEM_PREFIX + text).parse();
}

// Regenerate a corpus .poem file's text by parsing it into a poem-data
// object and writing it straight back out -- mirrors the real
// `poem-to-yaml.js --all` + `yaml-to-poem.js --all` pipeline (parse, then
// convert), without needing to round-trip through actual YAML files on disk
// (src/poems/yaml/*.yaml is generated/gitignored, see .gitignore).
function regenerate(poemPath) {
  const data = parsePoemFile(poemPath);
  return new YamlToPoemConverter(data).convert();
}

test('a-poem-kept.poem (the tech-debt item\'s own regression case) round-trips byte-for-byte through .poem -> YAML -> .poem', () => {
  const poemPath = path.join(POEM_DIR, 'a-poem-kept.poem');
  const original = fs.readFileSync(poemPath, 'utf8');
  assert.strictEqual(
    regenerate(poemPath),
    original,
    'a-poem-kept.poem has no audio/postscript/analysis/metadata, so converting it to YAML and back ' +
      'must reproduce it exactly, with no appended `====` markers'
  );
});

test('every poem in the corpus is stable under a second round-trip (yaml-to-poem --all is idempotent)', () => {
  const files = fs
    .readdirSync(POEM_DIR)
    .filter((f) => f.endsWith('.poem') && f !== '.shared.poem');
  assert.ok(files.length > 0, 'expected at least one .poem file');

  for (const file of files) {
    const poemPath = path.join(POEM_DIR, file);
    const firstPass = regenerate(poemPath);

    // Re-parse the regenerated text (rather than re-reading from disk) and
    // convert it again -- this is what a second `--all` run over the same
    // corpus does once the first run's output has landed.
    const secondPass = new YamlToPoemConverter(parsePoemText(firstPass)).convert();

    assert.strictEqual(
      secondPass,
      firstPass,
      `${file} changed on a second .poem -> YAML -> .poem round-trip -- ` +
        '--all would keep rewriting it on every run instead of reaching a stable fixed point'
    );
  }
});

test('a poem-data object exercising every optional section (audio, postscript, analysis, metadata) ' +
  'writes exactly one `====` between each and none once nothing follows', () => {
  const data = {
    title: 'Every Section',
    author: 'Test Author',
    date: '1970-01-01',
    versions: [{ segments: [{ lines: 'a line\n' }] }],
    audio: { audiomack: true },
    postscript: [{ content: '<p>A note.</p>\n' }],
    analysis: { full: '<p>Full analysis.</p>\n' },
    labels: ['nature'],
  };
  const text = new YamlToPoemConverter(data).convert();
  const markerLines = text.split('\n').filter((line) => line === '====');
  // Every optional section has content here, so each of the four boundaries
  // (Versions|Audio, Audio|Postscript, Postscript|Analysis, Analysis|Metadata)
  // needs exactly one marker -- never zero (content would run together) and
  // never more than one (POEM-SYNTAX.md's dividers are exactly 4 "=" once,
  // not repeated).
  assert.strictEqual(markerLines.length, 4);
  assert.deepStrictEqual(new PoemParser(text).parse(), data);
});

test('a poem-data object with only Versions writes no `====` markers at all', () => {
  const data = {
    title: 'Versions Only',
    date: '1970-01-01',
    versions: [{ segments: [{ lines: 'a line\n' }] }],
  };
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(!text.includes('===='), `expected no end markers, got: ${JSON.stringify(text)}`);
});

test('a poem-data object with only Metadata content writes four consecutive bare `====` markers, ' +
  'matching POEM-SYNTAX.md\'s worked example', () => {
  const data = {
    title: 'Metadata Only',
    date: '1970-01-01',
    versions: [{ segments: [{ lines: 'a line\n' }] }],
    directives: [{ name: 'some-directive', attributes: { key: 'value' } }],
    labels: ['nature', 'reflection'],
  };
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(
    text.includes('a line\n\n====\n====\n====\n====\n\n%some-directive key:value'),
    `expected four consecutive bare end markers before Metadata, got: ${JSON.stringify(text)}`
  );
});

test('convertPoemToYaml + YamlToPoemConverter agree with the direct data-object path (yaml.dump/load round-trip)', () => {
  const poemPath = path.join(POEM_DIR, 'a-poem-kept.poem');
  const data = parsePoemFile(poemPath);
  const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true });
  const viaYaml = new YamlToPoemConverter(yaml.load(yamlText)).convert();
  assert.strictEqual(viaYaml, regenerate(poemPath));
});

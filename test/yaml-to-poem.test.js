'use strict';

/**
 * Tests for yaml-to-poem.js's entity handling, plus `====` end-marker
 * stability (TD-PPpoet-26080102) at the bottom of the file. See CHANGELOG.md's
 * Security entry for code-scanning-alert-2 (js/double-escaping) for the bug
 * the entity-handling regression cases guard against.
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

// ── `====` end-marker stability (TD-PPpoet-26080102) ────────────────────────
//
// writeVersions()/writeAudio()/writePostscript() used to emit their `====`
// section terminator unconditionally, even when every later section was
// empty -- so `yaml-to-poem.js --all` could never be a clean no-op: each run
// appended more trailing markers to a poem with no audio/postscript/analysis/
// metadata of its own. POEM-SYNTAX.md's rule is that a divider is written
// "only if there is subsequent non-empty content" (§1, and see the Metadata
// section's own worked example needing all four end markers only because
// Metadata itself has content).
//
// The file-level cases below run against test/fixtures/round-trip/ rather
// than src/poems/poem/, because `test` is synced into consumer repos verbatim
// (scripts/sync-framework.sh's FRAMEWORK_PATHS) while a consumer's poem corpus
// is its own: the fixtures travel with the test, a consumer's poems do not.
// Each fixture is written exactly as the converter emits it, so it doubles as
// a readable worked example of where the markers do and do not belong.

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'round-trip');
const FIXTURES = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.poem'));

// Regenerate a .poem file's text by parsing it into a poem-data object and
// writing it straight back out -- mirrors the real `poem-to-yaml.js --all` +
// `yaml-to-poem.js --all` pipeline (parse, then convert), without needing to
// round-trip through actual YAML files on disk (src/poems/yaml/*.yaml is
// generated/gitignored, see .gitignore).
//
// `sharedPoemPath` selects the variable definitions prepended before parsing:
// the fixtures pass null (nothing to prepend, so they stay hermetic and do not
// depend on whichever .shared.poem the repo they were synced into happens to
// have), while the framework-corpus test below lets it default to the poem's
// own directory, as the real pipeline does.
function regenerate(poemPath, options = { sharedPoemPath: null }) {
  return new YamlToPoemConverter(parsePoemFile(poemPath, options)).convert();
}

test('every round-trip fixture regenerates byte-for-byte through .poem -> YAML -> .poem', () => {
  assert.ok(FIXTURES.length > 0, `expected at least one fixture in ${FIXTURE_DIR}`);

  for (const file of FIXTURES) {
    const poemPath = path.join(FIXTURE_DIR, file);
    assert.strictEqual(
      regenerate(poemPath),
      fs.readFileSync(poemPath, 'utf8'),
      `${file} did not survive .poem -> YAML -> .poem unchanged -- each fixture is stored exactly ` +
        'as the converter emits it, so any difference is the converter adding or dropping content ' +
        '(a stray `====` marker being the regression this guards)'
    );
  }
});

test('every round-trip fixture is stable under a second round-trip (yaml-to-poem --all is idempotent)', () => {
  for (const file of FIXTURES) {
    const firstPass = regenerate(path.join(FIXTURE_DIR, file));

    // Re-parse the regenerated text (rather than re-reading from disk) and
    // convert it again -- this is what a second `--all` run over the same
    // corpus does once the first run's output has landed.
    const secondPass = new YamlToPoemConverter(new PoemParser(firstPass).parse()).convert();

    assert.strictEqual(
      secondPass,
      firstPass,
      `${file} changed on a second .poem -> YAML -> .poem round-trip -- ` +
        '--all would keep rewriting it on every run instead of reaching a stable fixed point'
    );
  }
});

// The framework's own corpus is worth the same check, but only where "the
// corpus" means the poems this repo ships. In a consumer, src/poems/poem/ holds
// the user's collection alongside a user-owned .shared.poem, and the converter
// has known fidelity gaps on real-world poems (TD-PPpoet-26080201) that would
// fail this assertion for reasons a consumer cannot act on. `.poetic-version`
// is written by scripts/sync-framework.sh and is absent from the framework
// itself, so it distinguishes the two.
const IS_CONSUMER_REPO = fs.existsSync(path.join(__dirname, '..', '.poetic-version'));
const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');

test("the framework's own poem corpus is stable under a second round-trip", {
  skip: IS_CONSUMER_REPO && 'consumer repo: src/poems/poem/ holds the user\'s poems, not the framework\'s',
}, () => {
  const sharedPoemPath = path.join(POEM_DIR, '.shared.poem');
  const sharedPrefix = fs.existsSync(sharedPoemPath) ? fs.readFileSync(sharedPoemPath, 'utf8') : '';
  const files = fs.readdirSync(POEM_DIR).filter((f) => f.endsWith('.poem') && f !== '.shared.poem');
  assert.ok(files.length > 0, 'expected at least one .poem file');

  for (const file of files) {
    // Let parsePoemFile() find .shared.poem next to the poem, as the real
    // pipeline does; the second pass has no file of its own to look it up
    // beside, so prepend the same definitions by hand.
    const firstPass = regenerate(path.join(POEM_DIR, file), {});
    const secondPass = new YamlToPoemConverter(new PoemParser(sharedPrefix + firstPass).parse()).convert();

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
  for (const file of FIXTURES) {
    const poemPath = path.join(FIXTURE_DIR, file);
    const data = parsePoemFile(poemPath, { sharedPoemPath: null });
    const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true });
    const viaYaml = new YamlToPoemConverter(yaml.load(yamlText)).convert();
    assert.strictEqual(
      viaYaml,
      regenerate(poemPath),
      `${file} converts differently when the poem data has been through YAML on disk than when ` +
        'it is handed straight to the converter'
    );
  }
});

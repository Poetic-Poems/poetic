'use strict';

/**
 * Tests for parsing the Audio section, including the optional trailing player
 * size parameter list on a song-service line
 * (e.g. `Mega: id#key (video, ratio=21:9)`). See parseAudio /
 * parseAudioParams in src/tools/poem-to-yaml.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');

// Parse a minimal poem whose Audio section holds the given lines, and return
// the resulting `audio` map (or undefined when the section is empty).
function parseAudio(audioLines) {
  const src = [
    'Title', '1970-01-01', '',
    '{Verse}', 'a line', '',
    '====', '',
    ...audioLines, '',
    '====', '',
  ].join('\n');
  return new PoemParser(src).parse().audio;
}

// Capture console.warn output produced while running `fn`.
function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test('bare value (no params) stays a plain string', () => {
  const audio = parseAudio(['Mega: id0#key0']);
  assert.strictEqual(audio.mega, 'id0#key0');
});

test('bare service line (no colon, no params) stays true', () => {
  const audio = parseAudio(['Audiomack']);
  assert.strictEqual(audio.audiomack, true);
});

test('(audio) token → object with media: audio', () => {
  const audio = parseAudio(['Mega: id0#key0 (audio)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', media: 'audio' });
});

test('(video) token → object with media: video', () => {
  const audio = parseAudio(['Mega: id0#key0 (video)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', media: 'video' });
});

test('(ratio=16/9) → object with raw ratio (slash separator)', () => {
  const audio = parseAudio(['Mega: id0#key0 (ratio=16/9)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', ratio: '16/9' });
});

test('(ratio=16:9) → object with raw ratio (colon separator, not yet normalised)', () => {
  const audio = parseAudio(['Mega: id0#key0 (ratio=16:9)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', ratio: '16:9' });
});

test('(video, ratio=21:9) → media token AND ratio both recorded', () => {
  const audio = parseAudio(['Mega: id0#key0 (video, ratio=21:9)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', media: 'video', ratio: '21:9' });
});

test('(height=360) → object with raw height', () => {
  const audio = parseAudio(['Mega: id0#key0 (height=360)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', height: '360' });
});

test('a value containing "#" is preserved verbatim', () => {
  const audio = parseAudio(['Mega: AbC1dEfG#h1JkLmN0pQ (audio)']);
  assert.strictEqual(audio.mega.value, 'AbC1dEfG#h1JkLmN0pQ');
});

test('a "(" not preceded by whitespace stays part of the value', () => {
  const audio = parseAudio(['Mega: id0#key0(notparams)']);
  assert.strictEqual(audio.mega, 'id0#key0(notparams)');
});

test('malformed ratio value is stored raw (validation is deferred to render)', () => {
  const audio = parseAudio(['Mega: id0#key0 (ratio=not-a-ratio)']);
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0', ratio: 'not-a-ratio' });
});

test('unknown bare token warns and is ignored', () => {
  let audio;
  const warnings = captureWarnings(() => { audio = parseAudio(['Mega: id0#key0 (bogus)']); });
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0' });
  assert.ok(warnings.some((w) => /unknown media token/.test(w)), 'should warn about the unknown token');
});

test('unknown parameter key warns and is ignored', () => {
  let audio;
  const warnings = captureWarnings(() => { audio = parseAudio(['Mega: id0#key0 (colour=blue)']); });
  assert.deepStrictEqual(audio.mega, { value: 'id0#key0' });
  assert.ok(warnings.some((w) => /unknown parameter/.test(w)), 'should warn about the unknown key');
});

test('bare service line with a param list records media on a true value', () => {
  const audio = parseAudio(['Audiomack (video)']);
  assert.deepStrictEqual(audio.audiomack, { value: true, media: 'video' });
});

test('a long unterminated "(...)"-like run does not hang (ReDoS guard)', () => {
  // Regression guard for CodeQL js/polynomial-redos: parseAudio() used to
  // locate the trailing param list with
  // /^([A-Za-z][\w-]*)\s*(?::\s*(.*?))?(?:\s+(\(.*\)))?$/, whose lazy value
  // capture and optional trailing "(...)" group overlap, causing polynomial
  // backtracking on input that repeatedly looks like it might open a param
  // list but never closes one (~4.2s for a 100,000-char adversarial input
  // pre-fix; must now be near-instant).
  const line = 'Suno:' + ' ('.repeat(50000) + 'b';
  const t0 = Date.now();
  const audio = parseAudio([line]);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
  assert.strictEqual(audio.suno, line.slice('Suno:'.length).trim());
});

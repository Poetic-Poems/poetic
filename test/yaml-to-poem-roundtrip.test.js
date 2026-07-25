'use strict';

/**
 * Round-trip tests for yaml-to-poem.js: poem-data object -> .poem text ->
 * poem-data object, asserting the two objects match (TD26072109). Mirrors
 * test/browser-render.test.js's parity approach, but drives it from
 * hand-built poem-data objects (poem-parser.js's own output shape) rather
 * than a `.poem` corpus, so each shape yaml-to-poem.js must not drop --
 * object-form audio params, `segment.parts`, labels, directives, and
 * version/segment/postscript label params -- is exercised directly and in
 * combination.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { YamlToPoemConverter } = require('../src/tools/yaml-to-poem');
const { PoemParser } = require('../src/tools/poem-parser');

// Round-trip a poem-data object through YamlToPoemConverter -> PoemParser and
// return the reparsed object.
function roundTrip(data) {
  const text = new YamlToPoemConverter(data).convert();
  return new PoemParser(text).parse();
}

// Minimal valid poem-data, so each focused test below only needs to specify
// the field it's exercising.
function baseData(overrides = {}) {
  return {
    title: 'Round Trip Poem',
    author: 'Test Author',
    date: '1970-01-01',
    versions: [{ segments: [{ lines: 'a plain line\n' }] }],
    ...overrides,
  };
}

// ── The whole shape, combined (mirrors the corpus-wide parity check) ────────

test('a poem exercising every gap at once (audio object-form, segment.parts, label params, labels, directives) round-trips exactly', () => {
  const data = {
    title: 'Round Trip Poem',
    author: 'Test Author',
    date: '1970-01-01',
    versions: [
      {
        label: 'Version 1',
        params: { color: 'blue', icon: 'star' },
        segments: [
          {
            label: 'Plain Verse',
            params: { 'preview-lines': '8' },
            lines: 'a plain line\nanother plain line\n',
          },
          {
            label: 'Mixed Verse',
            parts: [
              { type: 'lines', lines: 'before the block\n' },
              { type: 'html', html: '<table>\n<tr><td>x</td></tr>\n</table>\n' },
              { type: 'lines', lines: 'after the block\n' },
              { type: 'html', html: '<button type="button">Press me</button>' },
            ],
          },
        ],
      },
      { segments: [{ lines: 'second version line\n' }] },
    ],
    audio: {
      audiomack: true,
      suno: 's/SongLink12345678',
      mega: {
        value: 'ExampleFileId1#ExampleDecryptionKey1234567890',
        media: 'video',
        ratio: '21:9',
        height: '400',
      },
      example: { value: 'raw-id', ratio: '16/9' },
    },
    postscript: [
      { label: 'Note One', params: { preview: 'false' }, content: '<p>Some text.</p>\n' },
      { $ref: '_shared.yaml#/disclaimer' },
    ],
    labels: ['reflection', 'nature'],
    directives: [
      { name: 'example.preamble', attributes: { key: 'value' } },
      { name: 'bare.directive' },
      { name: 'multi.directive', attributes: { a: '1', b: '2' } },
    ],
  };

  assert.deepStrictEqual(roundTrip(data), data);
});

// ── Audio object-form params ─────────────────────────────────────────────────

test('audio object-form params (media, ratio, height) round-trip', () => {
  const data = baseData({
    audio: {
      mega: { value: 'AbC1dEfG#h1Jk', media: 'video', ratio: '21:9', height: '400' },
    },
  });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form with only a ratio param round-trips', () => {
  const data = baseData({ audio: { mega: { value: 'id0#key0', ratio: '16/9' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form on a bare (true) value round-trips', () => {
  const data = baseData({ audio: { audiomack: { value: true, media: 'video' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form with no recognised param (bare "value" only) round-trips', () => {
  // Produced when the source line carried a trailing "(...)" whose contents
  // parseAudioParams() didn't recognise (see poem-to-yaml-audio.test.js's
  // "unknown parameter key" case) -- still an object, just with no
  // media/ratio/height key.
  const data = baseData({ audio: { mega: { value: 'id0#key0' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('plain bare and string-valued audio entries still round-trip alongside object-form ones', () => {
  const data = baseData({
    audio: { audiomack: true, suno: 's/SongLink12345678', mega: { value: 'id0#key0', media: 'audio' } },
  });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

// ── segment.parts (mixed WYSIWYG runs + embedded blocks) ────────────────────

test('segment.parts alternating lines/html round-trips, including a part with no trailing newline', () => {
  const data = baseData({
    versions: [
      {
        segments: [
          {
            parts: [
              { type: 'lines', lines: 'before\n' },
              { type: 'html', html: '<table>\n<tr><td>1</td></tr>\n</table>\n' },
              { type: 'lines', lines: 'after\n' },
              { type: 'html', html: '<button type="button">Press</button>' },
            ],
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('a segment.parts html block whose content is not a valid literal block errors clearly', () => {
  const data = baseData({
    versions: [{ segments: [{ parts: [{ type: 'html', html: '<<<\nnested\n>>>' }] }] }],
  });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /block marker/);
});

test('an unrecognised segment.parts part type errors clearly rather than being silently dropped', () => {
  const data = baseData({
    versions: [{ segments: [{ parts: [{ type: 'weird', payload: 1 }] }] }],
  });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported segment part type/);
});

// ── Labels ────────────────────────────────────────────────────────────────

test('labels round-trip in order', () => {
  const data = baseData({ labels: ['reflection', 'nature', 'solitude'] });
  assert.deepStrictEqual(roundTrip(data).labels, data.labels);
});

test('a label containing a syntax-reserved character errors clearly rather than corrupting on reparse', () => {
  const data = baseData({ labels: ['has space'] });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported Metadata label/);
});

// ── Directives ────────────────────────────────────────────────────────────

test('directives round-trip in order, with and without attributes, duplicates allowed', () => {
  const data = baseData({
    directives: [
      { name: 'example.preamble', attributes: { key: 'value' } },
      { name: 'bare.directive' },
      { name: 'd', attributes: { k: '1' } },
      { name: 'd', attributes: { k: '2' } },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).directives, data.directives);
});

test('a directive attribute value outside the unquoted character class errors clearly', () => {
  const data = baseData({ directives: [{ name: 'd', attributes: { key: 'has space' } }] });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported Metadata directive attribute value/);
});

// ── Version/segment/postscript label params ──────────────────────────────────

test('version, segment, and postscript label params round-trip, including values needing quoting', () => {
  const data = baseData({
    versions: [
      {
        label: 'Version 1',
        params: { color: 'blue' },
        segments: [{ label: 'Verse', params: { note: 'a "quoted" $value' }, lines: 'a line\n' }],
      },
    ],
    postscript: [{ label: 'Note', params: { preview: 'false' }, content: '<p>Text.</p>\n' }],
  });
  const reparsed = roundTrip(data);
  assert.deepStrictEqual(reparsed.versions, data.versions);
  assert.deepStrictEqual(reparsed.postscript, data.postscript);
});

// ── Absence: nothing is written when a poem has no Metadata content ─────────

test('no Metadata section is written when labels and directives are both absent', () => {
  const data = baseData();
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(!/^[#%]/m.test(text), 'expected no label/directive lines in the output');
  const reparsed = roundTrip(data);
  assert.ok(!('labels' in reparsed));
  assert.ok(!('directives' in reparsed));
});

// ── Segment lines: writeVersions()/writeSegmentParts() no longer write HTML
// raw (TD26072401) ──────────────────────────────────────────────────────────

test('segment lines: characters left bare by an original `\\`-escape are re-escaped, not mistaken for new markup', () => {
  // `*asterisks*`/`---` here are what a poem author's `\*asterisks\*`/`\-\-\-`
  // decode to: convertMarkup()'s escape handling leaves them as plain
  // characters with no wrapping tag or entity. Writing them back unescaped
  // would double-encode them into `<em>`/an em-dash entity on the next parse.
  const data = baseData({
    versions: [
      { segments: [{ lines: 'literal *asterisks*, a --- triple-hyphen, and a % percent sign.\n' }] },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment lines: <em>/<strong>/<s>/<a>/<span> tags round-trip back to themselves', () => {
  const data = baseData({
    versions: [
      {
        segments: [
          {
            lines:
              'A <a href="https://example.com">link</a> and a <span class="highlight">span</span>, ' +
              'with <em>emphasis</em>, <strong>strong</strong>, and <s>struck</s> words.\n',
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment lines: a hard line break (<br/>) and a blockquote in the same run round-trip', () => {
  const data = baseData({
    versions: [
      {
        segments: [
          {
            lines:
              'First line, with a break here,<br/>\nand the line that follows it.\n' +
              '<blockquote>A block-quoted couplet,<br/>two lines within one quote.</blockquote>\n',
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment lines: leading/embedded &nbsp; (indentation and multi-space runs) round-trip', () => {
  const data = baseData({
    versions: [
      { segments: [{ lines: '&nbsp;&nbsp;indented line\nA line with a &nbsp;double space.\n' }] },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment lines: a bare `&`/`\'`/`"` left over from an original `\\`-escape re-escapes, ' +
  'rather than being re-encoded as an entity on the next parse', () => {
  // `Rock \& Roll`, `isn\'t`, and `she said \"hi\"` all decode to a bare `&`/`'`/`"`
  // with no wrapping entity (unlike an unescaped `&`/`'`, which convertMarkup()
  // always turns into `&#38;`/`&#39;`, or an unescaped `"..."` pair, which it
  // turns into smart-quote entities). Writing these bare characters straight to
  // `.poem` output would let the next parse re-encode them for real.
  const data = baseData({
    versions: [
      {
        segments: [
          { lines: 'Rock & Roll, she said "hi" and it isn\'t fake markup.\n' },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment lines: a literal `&` and an `&nbsp;` entity in the same run both round-trip', () => {
  // Guards against escaping the literal `&` so eagerly that it also consumes the
  // `&nbsp;` produced by convertSpacesToNbsp() for this run's own indentation --
  // convertEntitiesToMarkup() needs the whole "&nbsp;" text intact to decode it.
  const data = baseData({
    versions: [
      { segments: [{ lines: '&nbsp;&nbsp;Rock & Roll, indented.\n' }] },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('segment.parts\' "lines" entries get the same HTML-to-markup conversion as segment.lines', () => {
  const data = baseData({
    versions: [
      {
        segments: [
          {
            parts: [
              { type: 'lines', lines: 'literal *asterisks*\n' },
              { type: 'html', html: '<table></table>' },
            ],
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

// ── Postscript/analysis: raw-HTML-block trailing newline (TD26072401) ───────

test('postscript: prose followed by a blank-line-isolated raw block preserves exact newline structure', () => {
  // Mirrors what parsePostscriptNote() produces for prose followed by a
  // `<<< >>>` block: renderGfm()'s own trailing '\n' on the prose plus the
  // block-append's leading '\n' isolate the block behind a blank line.
  const data = baseData({
    postscript: [{ content: '<p>Some text.</p>\n\n<ul>\n<li>Item</li>\n</ul>' }],
  });
  assert.deepStrictEqual(roundTrip(data).postscript, data.postscript);
});

test('postscript: content with no blank-line-isolated block is left as plain text, not wrapped as a literal block', () => {
  // A single block-level chunk of HTML (a real Markdown paragraph + list
  // rendered by one renderGfm() call, joined with a single '\n' throughout --
  // markdown-it never inserts a blank line between sibling elements) must not
  // be rewrapped in `<<< >>>`: doing so would misrepresent genuine prose as a
  // literal block, corrupting it on the next parse.
  const data = baseData({ postscript: [{ content: '<p>Text.</p>\n<ul>\n<li>a</li>\n</ul>' }] });
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(!/<<</.test(text), 'expected no literal block markers for single-block content');
});

// ── Postscript/analysis: single-block trailing list/fenced-code newline
// (TD26072502) ────────────────────────────────────────────────────────────

test('postscript: a paragraph immediately followed by a list (single block, no blank line) round-trips exactly', () => {
  // markdown-it never inserts a blank line between sibling block-level
  // elements, so this is `blocks.length === 1` in convertHtmlToPlainText()
  // even though it holds two elements -- the gap TD26072401 left open.
  const data = baseData({
    postscript: [{ content: '<p>Some text.</p>\n<ul>\n<li>Item</li>\n</ul>\n' }],
  });
  assert.deepStrictEqual(roundTrip(data).postscript, data.postscript);
});

test('analysis: a fenced code block preceded by other content in the same run round-trips exactly, including its trailing newline', () => {
  const data = baseData({
    analysis: {
      full: '<p>Some prose.</p>\n<pre><code class="language-js">const x = 1;\n</code></pre>\n',
    },
  });
  assert.deepStrictEqual(roundTrip(data).analysis, data.analysis);
});

test('analysis: an ordered list preceded by other content in the same run round-trips exactly', () => {
  const data = baseData({
    analysis: { synopsis: '<p>Steps:</p>\n<ol>\n<li>First</li>\n<li>Second</li>\n</ol>\n' },
  });
  assert.deepStrictEqual(roundTrip(data).analysis, data.analysis);
});

test('analysis: a nested list at the end of a run is left as plain text, not corrupted by a partial list match', () => {
  // The strict single-line-per-<li> pattern must not match a nested list --
  // falling through to the existing plain-text (verbatim raw HTML) fallback
  // is correct here; only the reconstructed-Markdown path is new.
  const html = '<p>Nested:</p>\n<ul>\n<li>alpha</li>\n<li>bravo\n<ul>\n<li>bravo-one</li>\n</ul>\n</li>\n</ul>';
  const data = baseData({ analysis: { full: html } });
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(!/<<</.test(text), 'expected no literal block markers');
  assert.ok(text.includes('<ul>'), 'expected the nested list to be passed through as raw HTML');
});

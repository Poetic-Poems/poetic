'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');
const {
  htmlToPlainText,
  decodeEntities,
  collapseAlternatives,
  renderPoemText,
  buildIndex,
} = require('../src/tools/poem-to-raw');

// Build a poem-data object from body lines + optional preamble (variable defs),
// exactly as the real converter parses a .poem file.
function parse(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse();
}

// Render a poem's raw plain text from body lines + preamble.
function raw(bodyLines, preamble = [], slug = 'title') {
  return renderPoemText(parse(bodyLines, preamble), slug);
}

// ── decodeEntities / htmlToPlainText ────────────────────────────────────────

test('decodeEntities: named and numeric references become Unicode', () => {
  assert.strictEqual(decodeEntities('a&nbsp;b'), 'a b');
  assert.strictEqual(decodeEntities('&amp;&lt;&gt;'), '&<>');
  assert.strictEqual(decodeEntities('&#8212;&#8211;'), '—–');
  assert.strictEqual(decodeEntities('&#x2026;'), '…');
  assert.strictEqual(decodeEntities('&#38;'), '&');
});

test('decodeEntities: an out-of-range code point is left literal (no crash)', () => {
  assert.strictEqual(decodeEntities('&#99999999;'), '&#99999999;');
  assert.strictEqual(decodeEntities('&#x110000;'), '&#x110000;');
});

test('htmlToPlainText: strips inline tags, keeps text', () => {
  assert.strictEqual(
    htmlToPlainText('a <em>b</em> <strong>c</strong> <s>d</s>'),
    'a b c d'
  );
  assert.strictEqual(
    htmlToPlainText('<a href="https://x.test">link</a> and <span class="highlight">span</span>'),
    'link and span'
  );
});

test('htmlToPlainText: a hard break absorbs an adjacent newline', () => {
  assert.strictEqual(htmlToPlainText('one<br/>\ntwo'), 'one\ntwo');
});

test('htmlToPlainText: literal <<< / >>> runs in text are preserved', () => {
  assert.strictEqual(
    htmlToPlainText('bare <<< and >>> stays'),
    'bare <<< and >>> stays'
  );
});

test('htmlToPlainText: a nested tag does not reconstitute after stripping', () => {
  // A single-pass strip would remove only the inner `<script>`, leaving the
  // outer `<script`/`ipt>` fragments to rejoin into a literal `<script>` tag.
  assert.strictEqual(
    htmlToPlainText('<scr<script>ipt>alert(1)</scr<script>ipt>'),
    'alert(1)'
  );
  assert.strictEqual(
    htmlToPlainText('<img src=x on<script>error=alert(1)>'),
    ''
  );
});

// ── poetic-alternatives (plain text keeps the last option) ──────────────────

const altSpan = (cls, text) => `<span class="poetic-alternatives ${cls}">${text}</span>`;

test('collapseAlternatives: an adjacent pair keeps the last option', () => {
  const html = altSpan('a', 'first') + altSpan('b', 'second');
  assert.strictEqual(htmlToPlainText(collapseAlternatives(html)), 'second');
});

test('collapseAlternatives: three or more adjacent options keep the last', () => {
  const html = altSpan('a', 'one') + altSpan('b', 'two') + altSpan('c', 'three');
  assert.strictEqual(htmlToPlainText(html), 'three');
});

test('collapseAlternatives: options separated by whitespace are NOT a group', () => {
  const html = altSpan('a', 'first') + ' ' + altSpan('b', 'second');
  assert.strictEqual(htmlToPlainText(html), 'first second');
});

test('collapseAlternatives: adjacent spans without the marker are both kept', () => {
  const html = '<span class="25">first</span><span class="26">second</span>';
  assert.strictEqual(htmlToPlainText(html), 'firstsecond');
});

test('alternatives collapse end to end through the parser', () => {
  const out = raw([
    '{Verse}',
    'God is /.poetic-alternatives.a{near}/.poetic-alternatives.b{here} always',
  ]);
  assert.match(out, /God is here always/);
  assert.doesNotMatch(out, /near/);
});

// ── Variable spec (the gaps this converter closes) ──────────────────────────

test('multi-line variables expand into the raw output', () => {
  const out = raw(['{Verse}', '${refrain}'], [
    '={refrain}<<=',
    'first line',
    'second line',
    '=>>',
    '',
  ]);
  assert.match(out, /first line\nsecond line/);
});

test('${name:-default} falls back when the variable is undefined', () => {
  assert.match(raw(['{Verse}', '${missing:-a fallback}']), /a fallback/);
});

test('\\${name} escaping emits a literal ${name}', () => {
  const out = raw(['{Verse}', 'literal \\${who}'], ['={who}=world', '']);
  assert.match(out, /literal \$\{who\}/);
  assert.doesNotMatch(out, /literal world/);
});

test('nested references resolve (dynamic binding)', () => {
  const out = raw(['{Verse}', '${outer}'], ['={inner}=deep', '={outer}=[${inner}]', '']);
  assert.match(out, /\[deep\]/);
});

test('%{...} context variables resolve from the poem fields', () => {
  const out = raw(['{Verse}', 'slug=%{slug} title=%{title}'], [], 'my-slug');
  assert.match(out, /slug=my-slug title=Title/);
});

test('%{title} is decoded to plain text (no HTML entities leak in)', () => {
  // A title with a smart apostrophe becomes &#8217; in the parsed data; the
  // context substitution must insert the decoded character, not the entity.
  const data = parse(['{Verse}', 'ref %{title}']);
  data.title = 'It&#8217;s Fine';
  const out = renderPoemText(data, 'title');
  assert.match(out, /ref It’s Fine/);
  assert.doesNotMatch(out, /&#8217;/);
});

// ── Structure of the rendered plain text ────────────────────────────────────

test('renderPoemText: title is dash-underlined and body follows', () => {
  const out = raw(['{Verse}', 'a line']);
  assert.match(out, /^Title\n-----\n\na line\n$/);
});

test('renderPoemText: segment labels are omitted', () => {
  assert.doesNotMatch(raw(['{A Label}', 'body text']), /A Label/);
});

test('renderPoemText: opaque embedded HTML/table parts are skipped', () => {
  const out = raw([
    '{Verse}',
    'before the table',
    '<<<markdown',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '>>>',
    'after the table',
  ]);
  assert.match(out, /before the table\nafter the table/);
  assert.doesNotMatch(out, /\| a \| b \|/);
});

test('renderPoemText: output ends with exactly one newline', () => {
  assert.ok(raw(['{Verse}', 'x']).endsWith('x\n'));
  assert.doesNotMatch(raw(['{Verse}', 'x']), /\n\n$/);
});

// ── Index page ───────────────────────────────────────────────────────────────

test('buildIndex: links to GitHub raw when a repo slug is known', () => {
  const html = buildIndex([{ stem: 'my-poem', title: 'My Poem' }], 'owner/repo');
  assert.match(html, /raw\.githubusercontent\.com\/owner\/repo\/refs\/heads\/main\/raw\/my-poem/);
  assert.match(html, />My Poem</);
});

test('buildIndex: escapes titles and falls back to the repo-root raw path', () => {
  const html = buildIndex([{ stem: 'p', title: 'A & B <x>' }], null);
  assert.match(html, /A &amp; B &lt;x&gt;/);
  assert.match(html, /href="\.\.\/\.\.\/raw\/p"/);
});

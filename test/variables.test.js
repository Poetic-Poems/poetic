'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { PoemParser } = require('../src/tools/poem-to-yaml');
const { substituteContextVars, resolveContextVars } = require('../src/tools/poem-render');

// Convenience: parse a minimal poem body and return the first version's segments.
function parseSegments(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse().versions[0].segments;
}

// Convenience: parse a minimal poem and return the full result.
function parsePoem(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse();
}

// ── A: Dynamic nesting ──────────────────────────────────────────────────────

test('A: dynamic nesting - nested variables resolve inner references', () => {
  const segments = parseSegments(['{Verse}', '${b}'], ['={a}=A', '={b}=[${a}]', '']);
  assert.match(segments[0].lines, /\[A\]/);
});

// ── B: Late/dynamic binding ──────────────────────────────────────────────────

test('B: late binding - redefined inner variable reflected in outer reference', () => {
  const segments = parseSegments(['{Verse}', '${box}'], [
    '={vis}=visible',
    '={box}=class-${vis}',
    '={vis}=hidden',
    '',
  ]);
  assert.match(segments[0].lines, /class-hidden/);
  assert.doesNotMatch(segments[0].lines, /class-visible/);
});

// ── C: Default values ────────────────────────────────────────────────────────

test('C: default values - ${x:-fallback} renders fallback when x is undefined', () => {
  const segments = parseSegments(['{Verse}', '${missing:-fallback}'], ['']);
  assert.match(segments[0].lines, /fallback/);
});

test('C: default values - ${x:-fallback} renders the value when x is defined', () => {
  const segments = parseSegments(['{Verse}', '${defined:-fallback}'], [
    '={defined}=ACTUAL',
    '',
  ]);
  assert.match(segments[0].lines, /ACTUAL/);
  assert.doesNotMatch(segments[0].lines, /fallback/);
});

// ── D: Escaping ──────────────────────────────────────────────────────────────

test('D: escaping - \\${x} renders literal ${x} even when x is defined', () => {
  const segments = parseSegments(['{Verse}', '\\${x}'], ['={x}=VALUE', '']);
  assert.match(segments[0].lines, /\$\{x\}/);
  assert.doesNotMatch(segments[0].lines, /VALUE/);
});

// ── E: Cycle guard ──────────────────────────────────────────────────────────

test('E: cycle guard - ${a} where a=${a} does not hang and leaves literal', () => {
  const segments = parseSegments(['{Verse}', '${a}'], ['={a}=${a}', '']);
  // Should contain the literal ${a} and not hang
  assert.ok(segments[0].lines);
  assert.match(segments[0].lines, /\$\{a\}/);
});

// ── F: Reserved eager form throws ────────────────────────────────────────────

test('F: reserved eager form - ={!x}=1 throws', () => {
  const src = '={!x}=1\n\nTitle\n1970-01-01\n\n{Verse}\nline\n';
  assert.throws(
    () => new PoemParser(src).parse(),
    /reserved/i
  );
});

test('F: reserved eager form - ${!x} in body throws', () => {
  const src = 'Title\n1970-01-01\n\n{Verse}\n${!x}\n';
  assert.throws(
    () => new PoemParser(src).parse(),
    /reserved/i
  );
});

// ── G: Raw block substitutes variables ───────────────────────────────────────

test('G: raw block substitution - <<< ... >>> with ${var} renders substituted value', () => {
  const result = parsePoem([
    '{Verse}',
    '<<<',
    '<div>${who}</div>',
    '>>>',
  ], ['={who}=World', '']);
  const segment = result.versions[0].segments[0];
  assert.ok(segment.parts, 'segment should have parts when a block is present');
  const htmlPart = segment.parts.find((p) => p.type === 'html');
  assert.ok(htmlPart, 'should find an html part');
  assert.strictEqual(htmlPart.html, '<div>World</div>');
});

// ── H: %{...} is NOT touched by poem-to-yaml ────────────────────────────────

test('H: context vars untouched - %{title} left literal in poem-to-yaml output', () => {
  const result = parsePoem(['{Verse}', 'This is %{title}'], ['']);
  const segment = result.versions[0].segments[0];
  assert.match(segment.lines, /%\{title\}/);
});

// ── I: Context vars (render stage) ──────────────────────────────────────────

test('I: substituteContextVars - %{slug} resolves from context', () => {
  const text = 'The slug is %{slug}';
  const result = substituteContextVars(text, { slug: 'my-poem' });
  assert.strictEqual(result, 'The slug is my-poem');
});

test('I: substituteContextVars - %{unknown:-fb} renders fallback', () => {
  const text = 'The value is %{unknown:-fallback}';
  const result = substituteContextVars(text, {});
  assert.strictEqual(result, 'The value is fallback');
});

test('I: substituteContextVars - \\%{slug} renders literal %{slug}', () => {
  const text = 'Escape: \\%{slug}';
  const result = substituteContextVars(text, { slug: 'my-poem' });
  assert.strictEqual(result, 'Escape: %{slug}');
});

test('I: substituteContextVars - unknown %{nope} (no fallback) left literal', () => {
  const text = 'The value is %{nope}';
  const result = substituteContextVars(text, { slug: 'other' });
  assert.strictEqual(result, 'The value is %{nope}');
});

// ── J: resolveContextVars deep + non-mutating ───────────────────────────────

test('J: resolveContextVars - deep copy with %{...} resolved from poem fields', () => {
  const poemData = {
    slug: 's1',
    title: 'My Title',
    author: 'Auth',
    date: '2026-01-01',
    postscript: [{ content: 'id=%{slug}' }],
  };
  const resolved = resolveContextVars(poemData);
  assert.strictEqual(resolved.postscript[0].content, 'id=s1');
});

test('J: resolveContextVars - input is not mutated', () => {
  const poemData = {
    slug: 's1',
    title: 'My Title',
    author: 'Auth',
    date: '2026-01-01',
    postscript: [{ content: 'id=%{slug}' }],
  };
  const originalContent = poemData.postscript[0].content;
  resolveContextVars(poemData);
  assert.strictEqual(poemData.postscript[0].content, originalContent);
  assert.match(poemData.postscript[0].content, /%\{slug\}/);
});

test('J: resolveContextVars - Date values pass through unchanged', () => {
  const when = new Date('2026-01-01T00:00:00Z');
  const poemData = {
    slug: 's1',
    title: 'Title',
    author: 'Auth',
    date: '2026-01-01',
    when,
    nested: { when },
  };
  const resolved = resolveContextVars(poemData);
  assert.strictEqual(resolved.when, when);
  assert.strictEqual(resolved.nested.when, when);
});

// ── Edge cases and integration ──────────────────────────────────────────────

test('multiple variables with interdependencies resolve correctly', () => {
  const segments = parseSegments(['{Verse}', '${x}'], [
    '={a}=A',
    '={b}=[${a}]',
    '={x}=(${b})',
    '',
  ]);
  assert.match(segments[0].lines, /\(\[A\]\)/);
});

test('complex nesting in parameter values with variables', () => {
  const segments = parseSegments(['{Verse}(cls="${color}")', 'line'], [
    '={color}=red',
    '',
  ]);
  assert.deepStrictEqual(segments[0].params, { cls: 'red' });
});

test('context var substitution with multiple placeholders', () => {
  const text = '%{slug} - %{title} - %{author}';
  const result = substituteContextVars(text, {
    slug: 'poem-1',
    title: 'My Poem',
    author: 'Jane',
  });
  assert.strictEqual(result, 'poem-1 - My Poem - Jane');
});

test('resolveContextVars handles nested arrays correctly', () => {
  const poemData = {
    slug: 'test',
    title: 'T',
    author: 'A',
    date: '2026-01-01',
    versions: [
      { label: 'v1', segments: [{ content: 'slug=%{slug}' }] },
      { label: 'v2', segments: [{ content: 'slug=%{slug}' }] },
    ],
  };
  const resolved = resolveContextVars(poemData);
  assert.strictEqual(resolved.versions[0].segments[0].content, 'slug=test');
  assert.strictEqual(resolved.versions[1].segments[0].content, 'slug=test');
  // Verify input unchanged
  assert.match(poemData.versions[0].segments[0].content, /%\{slug\}/);
});

test('variable in markdown block also gets substituted', () => {
  const result = parsePoem([
    '{Verse}',
    '<<<markdown',
    '- item for ${who}',
    '>>>',
  ], ['={who}=Everyone', '']);
  const segment = result.versions[0].segments[0];
  assert.ok(segment.parts);
  const htmlPart = segment.parts.find((p) => p.type === 'html');
  assert.ok(htmlPart);
  assert.match(htmlPart.html, /Everyone/);
});

test('escaped variable in default fallback', () => {
  const segments = parseSegments(['{Verse}', '${x:-\\${y}}'], [
    '={y}=SHOULD_NOT_APPEAR',
    '',
  ]);
  // The fallback itself has an escaped ${y}, which becomes literal
  assert.match(segments[0].lines, /\$\{y\}/);
});

test('empty variable name leaves literal ${} untouched', () => {
  const segments = parseSegments(['{Verse}', '${}'], ['']);
  assert.match(segments[0].lines, /\$\{\}/);
});

// ── Multi-line variables and ${...} in name positions ───────────────────────

test('multi-line variable with a nested reference expands at use (dynamic, inline)', () => {
  const segments = parseSegments(['{Seg}', 'use:${m}'], [
    '={m}<<=',
    'A ${var1} B',
    '=>>',
    '={var1}=a',
    '',
  ]);
  assert.strictEqual(segments[0].lines, 'use:A a B\n');
});

test('a definition whose name contains ${...} is not a definition (treated as content)', () => {
  const segments = parseSegments(['{Seg}', '={v${var1}r4}=b', 'v4:${var4}'], ['={var1}=a', '']);
  // Not recognised as a definition; its ${var1} is substituted as ordinary content...
  assert.match(segments[0].lines, /=\{var4\}=b/);
  // ...so the intended variable var4 is never defined and its reference stays literal.
  assert.match(segments[0].lines, /v4:\$\{var4\}/);
});

test('a reference with ${...} in the name position closes at the first } (undefined, literal)', () => {
  const segments = parseSegments(['{Seg}', 'L=${var${var1}r4}'], ['={var1}=a', '']);
  // Looks up the literal (undefined) name "var${var1"; left as-is, and the inner
  // ${var1} is NOT resolved.
  assert.strictEqual(segments[0].lines, 'L=${var${var1}r4}\n');
});

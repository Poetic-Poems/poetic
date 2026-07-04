'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PoemParser, convertPoemToYaml } = require('../src/tools/poem-to-yaml');

const POEM_DIR = path.join(__dirname, '..', 'src', 'poems', 'poem');

// Convenience: parse a minimal poem body and return the first version.
function parseVersion(bodyLines, preamble = []) {
  const src = [...preamble, 'Title', '1970-01-01', '', ...bodyLines].join('\n');
  return new PoemParser(src).parse().versions[0];
}

// Convenience: parse a minimal poem body and return the first version's segments.
function parseSegments(bodyLines, preamble = []) {
  return parseVersion(bodyLines, preamble).segments;
}

// Convenience: parse a poem with a postscript section and return its notes.
function parsePostscript(postscriptLines, preamble = []) {
  const src = [
    ...preamble,
    'Title', '1970-01-01', '', '{Verse}', 'a line',
    '====', '', '====', '',
    ...postscriptLines,
  ].join('\n');
  return new PoemParser(src).parse().postscript;
}

// ── Basic parsing ───────────────────────────────────────────────────────────

test('segment label with a single basic param', () => {
  const segments = parseSegments(['{Verse}(a=b)', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.deepStrictEqual(segments[0].params, { a: 'b' });
});

test('hyphenated keys are preserved as authored', () => {
  const segments = parseSegments(['{Verse}(preview-lines=8)', 'line']);
  assert.deepStrictEqual(segments[0].params, { 'preview-lines': '8' });
});

test('no whitespace vs whitespace before "(" parse identically', () => {
  const tight = parseSegments(['{Verse}(a=b)', 'line']);
  const spaced = parseSegments(['{Verse}   (a=b)', 'line']);
  assert.deepStrictEqual(tight[0].params, { a: 'b' });
  assert.deepStrictEqual(spaced[0].params, { a: 'b' });
});

test('multiple key=value pairs separated by commas', () => {
  const segments = parseSegments(['{Verse}(a=b, c=d, e=f)', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'b', c: 'd', e: 'f' });
});

test('whitespace is optional and ignored around "(", ")", "=", "," and values', () => {
  const segments = parseSegments(['{Verse}(  a  =  b  ,   c=d   )', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'b', c: 'd' });
});

test('empty parameter list "()" yields an empty params object', () => {
  const segments = parseSegments(['{Verse}()', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.deepStrictEqual(segments[0].params, {});
});

test('version ({{...}}) labels accept a parameter list', () => {
  const version = parseVersion(['{{ Version 1 }}(color=blue, icon=star)', '{Verse}', 'line']);
  assert.strictEqual(version.label, 'Version 1');
  assert.deepStrictEqual(version.params, { color: 'blue', icon: 'star' });
});

test('postscript labels accept a parameter list', () => {
  const postscript = parsePostscript([
    '{My Postscript Label}(preview=true, preview-lines=8)',
    'Some postscript text.',
  ]);
  assert.strictEqual(postscript[0].label, 'My Postscript Label');
  assert.deepStrictEqual(postscript[0].params, { preview: 'true', 'preview-lines': '8' });
});

// ── Malformed trailing parenthetical → ignored, backward-compatible ────────

test('a non-well-formed trailing "(...)" is ignored and the label is untouched', () => {
  const segments = parseSegments(['{Verse} (see below)', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.strictEqual(segments[0].params, undefined);
});

test('params key is omitted entirely (not null/empty) when no "(...)" was given', () => {
  const segments = parseSegments(['{Verse}', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.ok(!('params' in segments[0]));
});

test('an unterminated quote in the parenthetical is treated as malformed', () => {
  const segments = parseSegments(['{Verse}(a="unterminated)', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.strictEqual(segments[0].params, undefined);
});

// ── Quoting stress cases ────────────────────────────────────────────────────

test('single-quoted value may contain a literal "," and ")"', () => {
  const segments = parseSegments(["{Verse}(a='x,y)z')", 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x,y)z' });
});

test('double-quoted value may contain a literal "," and ")"', () => {
  const segments = parseSegments(['{Verse}(a="x,y)z")', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x,y)z' });
});

test('single-quoted value may contain a literal double-quote character', () => {
  const segments = parseSegments(["{Verse}(a='he said \"hi\"')", 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'he said "hi"' });
});

test('double-quoted value may contain a literal single-quote character', () => {
  const segments = parseSegments(['{Verse}(a="it\'s here")', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: "it's here" });
});

test('exact worked example: mixed whitespace, quoting, and embedded special characters', () => {
  // ( tricky-1   = " )' "  , tricky-2=  '(")'    )
  const segments = parseSegments([
    "{Verse}( tricky-1   = \" )' \"  , tricky-2=  '(\")'    )",
    'line',
  ]);
  const params = segments[0].params;
  assert.strictEqual(params['tricky-1'], " )' ", 'tricky-1 should be the 4 chars: space, ), \', space');
  assert.strictEqual(params['tricky-1'].length, 4);
  assert.deepStrictEqual(
    [...params['tricky-1']].map((c) => c.codePointAt(0)),
    [0x20, 0x29, 0x27, 0x20]
  );
  assert.strictEqual(params['tricky-2'], '(")', 'tricky-2 should be the 3 chars: (, ", )');
  assert.strictEqual(params['tricky-2'].length, 3);
  assert.deepStrictEqual(
    [...params['tricky-2']].map((c) => c.codePointAt(0)),
    [0x28, 0x22, 0x29]
  );
});

// ── POSIX shell-like value semantics ────────────────────────────────────────
// A value is one shell-style "word": adjacent unquoted / single-quoted /
// double-quoted segments concatenate with no separator, scanning left to
// right until an unquoted, unescaped ",", ")", or whitespace ends the word.

test('oracle: mixed adjacent quoting and backslash escapes across all three contexts', () => {
  // Source: START" \" \\ "unquoted\ space' \'END
  //   = START (unquoted)
  //   + " \" \\ " (double-quoted: decodes to space,",space,\,space)
  //   + unquoted\ space (unquoted, \<space> -> literal space)
  //   + ' \'' (single-quoted, verbatim: decodes to space,\)
  //   + END (unquoted)
  // Concatenated: START + ' " \ ' + 'unquoted space' + ' \' + END
  const segments = parseSegments([
    '{L}(k=START" \\" \\\\ "unquoted\\ space\' \\\'END)',
    'line',
  ]);
  assert.strictEqual(segments[0].params.k, 'START " \\ unquoted space \\END');
});

test('unquoted unescaped whitespace ends the value (shell word-splitting)', () => {
  // "hello" is a complete value ending at the space; "world" has no "=" so
  // the list is malformed.
  const segments = parseSegments(['{Verse}(a=hello world)', 'line']);
  assert.strictEqual(segments[0].params, undefined);
});

test('unquoted backslash-escaped space is preserved inside the value', () => {
  const segments = parseSegments(['{Verse}(a=hello\\ world)', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'hello world' });
});

test('unquoted backslash escapes an arbitrary character, including "," and ")"', () => {
  const segments = parseSegments(['{Verse}(a=x\\,y\\)z)', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x,y)z' });
});

test('unquoted backslash-escaped quote characters do not open a quoted segment', () => {
  const segments = parseSegments(["{Verse}(a=x\\'y\\\"z)", 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x\'y"z' });
});

test('unquoted backslash-backslash decodes to a single literal backslash', () => {
  const segments = parseSegments(['{Verse}(a=x\\\\y)', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x\\y' });
});

test('adjacent quoted segments of different styles concatenate onto one value', () => {
  const segments = parseSegments(["{Verse}(a='foo'\"bar\"baz)", 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'foobarbaz' });
});

test('double-quoted \\" \\\\ \\$ \\` decode to their literal escaped character', () => {
  const segments = parseSegments(['{Verse}(a="\\"\\\\\\$\\`")', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: '"\\$`' });
});

test('double-quoted backslash before any other character is kept literally (e.g. \\n stays \\n)', () => {
  const segments = parseSegments(['{Verse}(a="x\\ny")', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x\\ny' });
});

test('an escaped "," or ")" in an unquoted value is not treated as list syntax by the outer scan', () => {
  // The outer scan (which locates the matching top-level ")" and the ","
  // separators) must itself respect unquoted backslash-escaping, not just
  // quoting - this is the value's escaped ")" that must not end the list.
  const segments = parseSegments(['{Verse}(a=x\\)y, b=z)', 'line']);
  assert.deepStrictEqual(segments[0].params, { a: 'x)y', b: 'z' });
});

// ── Variable substitution ────────────────────────────────────────────────────

test('${var} substitution end-to-end: postscript preview param from a variable', () => {
  const postscript = parsePostscript(
    ['{My Postscript Label}(preview=${want preview})', 'Some postscript text.'],
    ['={want preview}=false', '']
  );
  assert.strictEqual(postscript[0].params.preview, 'false');
});

test('${var} is expanded inside a double-quoted value', () => {
  const segments = parseSegments(['{Verse}(a="${x} suffix")', 'line'], ['={x}=hello', '']);
  assert.deepStrictEqual(segments[0].params, { a: 'hello suffix' });
});

test('${var} is left literal inside a single-quoted value', () => {
  const segments = parseSegments(["{Verse}(a='${x} suffix')", 'line'], ['={x}=hello', '']);
  assert.deepStrictEqual(segments[0].params, { a: '${x} suffix' });
});

test('${var} is expanded inside an unquoted value', () => {
  const segments = parseSegments(['{Verse}(a=${x})', 'line'], ['={x}=hello', '']);
  assert.deepStrictEqual(segments[0].params, { a: 'hello' });
});

test('an expansion containing "," or ")" is not re-scanned as list syntax', () => {
  const segments = parseSegments(
    ['{Verse}(x=${weird}, y=z)', 'line'],
    ['={weird}=a,b)c', '']
  );
  assert.deepStrictEqual(segments[0].params, { x: 'a,b)c', y: 'z' });
});

test('a "${name}" containing spaces is expanded whole in an unquoted value (spaces do not end the value)', () => {
  const segments = parseSegments(
    ['{Verse}(preview=${want preview})', 'line'],
    ['={want preview}=false', '']
  );
  assert.deepStrictEqual(segments[0].params, { preview: 'false' });
});

test('\\$ escapes a literal "$" in an unquoted value and never triggers substitution', () => {
  const segments = parseSegments(['{Verse}(a=\\${x})', 'line'], ['={x}=hello', '']);
  assert.deepStrictEqual(segments[0].params, { a: '${x}' });
});

test('\\$ escapes a literal "$" in a double-quoted value and never triggers substitution', () => {
  const segments = parseSegments(['{Verse}(a="\\${x}")', 'line'], ['={x}=hello', '']);
  assert.deepStrictEqual(segments[0].params, { a: '${x}' });
});

test('substitution is applied per segment: unquoted "${a}" adjacent to a single-quoted literal "${b}"', () => {
  const segments = parseSegments(
    ["{Verse}(k=${a}'${b}')", 'line'],
    ['={a}=A', '={b}=B', '']
  );
  // ${a} expands (unquoted); '${b}' stays literal (single-quoted).
  assert.deepStrictEqual(segments[0].params, { k: 'A${b}' });
});

// ── Backward compatibility ──────────────────────────────────────────────────

test('a label without any trailing "(...)" behaves exactly as before (no params key)', () => {
  const segments = parseSegments(['{Verse}  # a trailing comment, still ignored', 'line']);
  assert.strictEqual(segments[0].label, 'Verse');
  assert.ok(!('params' in segments[0]));
});

// ── Golden fixture: _params-example.poem ────────────────────────────────────

test('_params-example.poem matches the golden fixture', () => {
  const actual = convertPoemToYaml(path.join(POEM_DIR, '_params-example.poem'));
  const goldenPath = path.join(__dirname, 'golden', '_params-example.yaml');
  const golden = fs.readFileSync(goldenPath, 'utf8');
  assert.strictEqual(
    actual,
    golden,
    'Output drifted from test/golden/_params-example.yaml. If intentional, regenerate it:\n' +
      "  node -e \"process.stdout.write(require('./src/tools/poem-to-yaml').convertPoemToYaml('src/poems/poem/_params-example.poem'))\" > test/golden/_params-example.yaml"
  );
});

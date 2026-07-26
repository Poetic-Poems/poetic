'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  matchesTrailingComment,
  parseDirectiveLine,
  matchLabelLine,
} = require('../src/tools/poem-metadata');

test('matchesTrailingComment accepts end-of-line, trailing whitespace, or a "# comment"', () => {
  assert.strictEqual(matchesTrailingComment('abc', 3), true);
  assert.strictEqual(matchesTrailingComment('abc   ', 3), true);
  assert.strictEqual(matchesTrailingComment('abc  # note', 3), true);
});

test('matchesTrailingComment rejects leftover non-whitespace content', () => {
  assert.strictEqual(matchesTrailingComment('abc def', 3), false);
  assert.strictEqual(matchesTrailingComment('abc#note', 3), false); // '#' with no preceding whitespace
});

test('parseDirectiveLine recognises a bare directive with no attributes', () => {
  assert.deepStrictEqual(parseDirectiveLine('%bare.directive'), { name: 'bare.directive' });
});

test('parseDirectiveLine recognises attributes and an optional trailing comment', () => {
  assert.deepStrictEqual(
    parseDirectiveLine('%d a:1 b:2  # note'),
    { name: 'd', attributes: { a: '1', b: '2' } }
  );
});

test('parseDirectiveLine returns null for a non-directive line', () => {
  assert.strictEqual(parseDirectiveLine('not a directive'), null);
  assert.strictEqual(parseDirectiveLine('%'), null);
});

test('matchLabelLine recognises a label and an optional trailing comment', () => {
  assert.strictEqual(matchLabelLine('#nature'), 'nature');
  assert.strictEqual(matchLabelLine('#tag  # note'), 'tag');
});

test('matchLabelLine returns null for a bare "#" or a comment line', () => {
  assert.strictEqual(matchLabelLine('#'), null);
  assert.strictEqual(matchLabelLine('# this is a comment'), null);
});

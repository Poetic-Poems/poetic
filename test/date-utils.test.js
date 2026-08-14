'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { toISODate } = require('../src/tools/date-utils');

test('toISODate: returns null for a missing/falsy value', () => {
  assert.strictEqual(toISODate(null), null);
  assert.strictEqual(toISODate(undefined), null);
  assert.strictEqual(toISODate(''), null);
});

test('toISODate: converts a valid Date object to yyyy-mm-dd (UTC)', () => {
  assert.strictEqual(toISODate(new Date(Date.UTC(2024, 2, 15))), '2024-03-15');
});

test('toISODate: an invalid Date object degrades to null rather than throwing', () => {
  // Regression: sync-blogger.js used to reimplement this coercion inline via
  // `raw.date.toISOString().slice(0, 10)`, which throws a RangeError on an
  // invalid Date instead of degrading gracefully.
  const invalid = new Date('not a real date');
  assert.strictEqual(isNaN(invalid.getTime()), true);
  assert.doesNotThrow(() => toISODate(invalid));
  assert.strictEqual(toISODate(invalid), null);
});

test('toISODate: passes through a string already in yyyy-mm-dd format', () => {
  assert.strictEqual(toISODate('2024-03-15'), '2024-03-15');
});

test('toISODate: returns null for a string not in yyyy-mm-dd format', () => {
  assert.strictEqual(toISODate('Friday, 15 March 2024'), null);
});

'use strict';

/**
 * Tests for src/browser/render-errors.js's error classification, and its use
 * by src/browser/render.js (renderPoem/renderPoemPage) and
 * src/browser/render-aggregate.js (renderAllPoems/renderIndex) — see
 * TD26072617 in TECH-DEBT.md.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  renderPoem, renderPoemPage, renderAllPoems, renderIndex, PoemRenderError,
} = require('../src/browser/render');
const { classifyingCall } = require('../src/browser/render-errors');

function assertClassified(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof PoemRenderError, 'expected a PoemRenderError');
    assert.strictEqual(err.name, 'PoemRenderError');
    assert.strictEqual(err.code, code);
    return true;
  });
}

test('renderPoem/renderPoemPage classify a missing title as MISSING_TITLE', () => {
  assertClassified(() => renderPoem(''), 'MISSING_TITLE');
  assertClassified(() => renderPoemPage(''), 'MISSING_TITLE');
});

test('renderPoem classifies a missing date as MISSING_DATE', () => {
  assertClassified(() => renderPoem('Just a title\n'), 'MISSING_DATE');
});

test('renderPoem classifies an invalid date as INVALID_DATE', () => {
  assertClassified(() => renderPoem('Title\nAuthor Name\nNotADate\n'), 'INVALID_DATE');
});

test('renderPoem classifies a reserved \\? escape as RESERVED_ESCAPE', () => {
  assertClassified(() => renderPoem('Title\n2024-01-01\n\nfoo \\? bar\n'), 'RESERVED_ESCAPE');
});

test('renderAllPoems/renderIndex classify an unrecognised failure as RENDER_ERROR', () => {
  // Malformed `poems`/`data` fails inside summarizePoem/renderPoemDataFragment,
  // not PoemParser (the caller supplies already-parsed data) — a TypeError the
  // known parser messages don't cover, so the generic fallback code applies.
  assertClassified(() => renderAllPoems(null), 'RENDER_ERROR');
  assertClassified(() => renderIndex([{ data: null, slug: 'x' }]), 'RENDER_ERROR');
});

test('classifyingCall passes an existing PoemRenderError through unchanged', () => {
  const original = new PoemRenderError('already classified', 'MISSING_TITLE');
  assert.throws(
    () => classifyingCall(() => { throw original; }),
    (err) => err === original
  );
});

test('classifyingCall returns the wrapped function\'s value when it does not throw', () => {
  assert.strictEqual(classifyingCall(() => 42), 42);
});

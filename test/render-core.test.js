'use strict';

/**
 * Direct tests for the render-core helpers that `_poem-content.pug` receives as
 * Pug locals: `slugify`, `postscriptPreviewSettings` and `processAnalysisText`.
 *
 * These assert the helpers' own contracts, independently of a template render.
 * Rendering exercises them only over whatever the poem corpus happens to
 * contain, which leaves the defaulting rules and the markup pass-through
 * unpinned -- and, for `slugify`, cannot tell a shared function from a
 * byte-identical copy of one at all.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  slugify,
  postscriptPreviewSettings,
  processAnalysisText,
} = require('../src/tools/render-core');
const { slugify: slugifySource } = require('../src/tools/slugify');

// ── slugify ─────────────────────────────────────────────────────────────────

test('render-core re-exports slugify.js\'s own function, not a copy of it', () => {
  assert.strictEqual(
    slugify,
    slugifySource,
    'render-core must re-export slugify.js\'s function so there is one definition to change'
  );
});

// ── postscriptPreviewSettings ───────────────────────────────────────────────

test('postscriptPreviewSettings: no params at all takes both defaults', () => {
  assert.deepStrictEqual(postscriptPreviewSettings(undefined), { preview: true, previewLines: 5 });
  assert.deepStrictEqual(postscriptPreviewSettings({}), { preview: true, previewLines: 5 });
});

test('postscriptPreviewSettings: preview is off only for the exact string "false"', () => {
  assert.strictEqual(postscriptPreviewSettings({ preview: 'false' }).preview, false);
  assert.strictEqual(postscriptPreviewSettings({ preview: 'true' }).preview, true);
  assert.strictEqual(postscriptPreviewSettings({ preview: 'FALSE' }).preview, true);
  assert.strictEqual(postscriptPreviewSettings({ preview: 'no' }).preview, true);
});

test('postscriptPreviewSettings: preview-lines is honoured when it parses as an integer >= 1', () => {
  assert.strictEqual(postscriptPreviewSettings({ 'preview-lines': '3' }).previewLines, 3);
  assert.strictEqual(postscriptPreviewSettings({ 'preview-lines': '1' }).previewLines, 1);
  assert.strictEqual(postscriptPreviewSettings({ 'preview-lines': '12' }).previewLines, 12);
});

test('postscriptPreviewSettings: an unusable preview-lines falls back to 5', () => {
  for (const value of ['0', '-2', 'many', '', 'abc7']) {
    assert.strictEqual(
      postscriptPreviewSettings({ 'preview-lines': value }).previewLines,
      5,
      `preview-lines=${JSON.stringify(value)} must fall back to 5`
    );
  }
});

// ── processAnalysisText ─────────────────────────────────────────────────────

test('processAnalysisText: a plain-text paragraph is wrapped in <p>', () => {
  assert.strictEqual(processAnalysisText('A plain sentence.'), '<p>A plain sentence.</p>');
});

test('processAnalysisText: blank lines separate paragraphs, each wrapped in turn', () => {
  assert.strictEqual(
    processAnalysisText('First para.\n\nSecond para.'),
    '<p>First para.</p><p>Second para.</p>'
  );
});

test('processAnalysisText: a paragraph already carrying markup passes through unwrapped', () => {
  assert.strictEqual(
    processAnalysisText('<p>Already wrapped.</p>'),
    '<p>Already wrapped.</p>'
  );
  assert.strictEqual(
    processAnalysisText('Text with <em>emphasis</em>.'),
    'Text with <em>emphasis</em>.'
  );
});

test('processAnalysisText: markup and plain paragraphs are each handled on their own', () => {
  assert.strictEqual(
    processAnalysisText('<p>Wrapped.</p>\n\nBare.'),
    '<p>Wrapped.</p><p>Bare.</p>'
  );
});

test('processAnalysisText: surrounding and blank-but-whitespace-filled lines are discarded', () => {
  assert.strictEqual(processAnalysisText('\n\n  Padded.  \n \n\n'), '<p>Padded.</p>');
  assert.strictEqual(processAnalysisText(''), '');
  assert.strictEqual(processAnalysisText('\n \n'), '');
});

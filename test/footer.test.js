'use strict';

/**
 * Tests for the Poetic footer feature: the `footer.enabled` / `footer.source`
 * .poetic-config.yaml keys, and the shared renderFooter/upsertFooter helpers
 * used by every GitHub Pages page the framework builds (individual poem
 * pages, index.html, all-poems.html, and public/raw/index.html).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  renderFooter, upsertFooter, DEFAULT_FOOTER_SOURCE, FOOTER_START, FOOTER_END,
} = require('../src/tools/footer');
const { generateIndexHtml } = require('../src/tools/build-all-poems');
const { REPO_ROOT } = require('../src/tools/repo-root');

function tmpRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-footer-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return dir;
}

// Build a marker-wrapped block the same shape renderFooter() produces, so
// upsertFooter tests exercise the real strip/replace contract (a footerBlock
// missing the marker comments can never be found and stripped on a later
// build, which would silently duplicate the footer on every rebuild).
function footerBlockFor(text) {
  return `${FOOTER_START}\n<footer class="poetic-footer">${text}</footer>\n${FOOTER_END}`;
}

// ── renderFooter ─────────────────────────────────────────────────────────────

test('renderFooter: default config renders the default public/poetic-footer.html, wrapped in markers', () => {
  const repoRoot = tmpRepo({
    'public/poetic-footer.html': '<p>Built with <a href="https://x.test">Poetic</a></p>',
  });
  const block = renderFooter({}, repoRoot, { base: '' });

  assert.match(block, /<!-- poetic:footer -->/);
  assert.match(block, /<!-- \/poetic:footer -->/);
  assert.match(block, /<footer class="poetic-footer">/);
  assert.match(block, /Built with <a href="https:\/\/x\.test">Poetic<\/a>/);
});

test('renderFooter: footer.enabled: false disables the footer entirely', () => {
  const repoRoot = tmpRepo({ 'public/poetic-footer.html': '<p>Built with Poetic</p>' });
  const block = renderFooter({ footer: { enabled: false } }, repoRoot, { base: '' });
  assert.strictEqual(block, '');
});

test('renderFooter: any value other than the boolean false leaves the footer enabled', () => {
  const repoRoot = tmpRepo({ 'public/poetic-footer.html': '<p>x</p>' });
  for (const value of [true, 'false', 'no', 0, '']) {
    const block = renderFooter({ footer: { enabled: value } }, repoRoot, { base: '' });
    assert.notStrictEqual(block, '', `footer.enabled=${JSON.stringify(value)} must not disable the footer`);
  }
});

test('renderFooter: footer.source redirects to a consumer-owned custom file', () => {
  const repoRoot = tmpRepo({
    'public/poetic-footer.html': '<p>Default footer — should not be used</p>',
    'public/my-footer.html': '<p>My custom footer</p>',
  });
  const block = renderFooter({ footer: { source: 'public/my-footer.html' } }, repoRoot, { base: '' });
  assert.match(block, /My custom footer/);
  assert.doesNotMatch(block, /Default footer/);
});

test('renderFooter: a missing footer.source file yields an empty string (no throw)', () => {
  const repoRoot = tmpRepo({});
  assert.doesNotThrow(() => {
    const block = renderFooter({}, repoRoot, { base: '' });
    assert.strictEqual(block, '');
  });
});

test('renderFooter: %{base} resolves to "" on root-level pages and "../" one level deep', () => {
  const repoRoot = tmpRepo({
    'public/poetic-footer.html': '<img src="%{base}poetic-logo.svg">',
  });
  const rootBlock = renderFooter({}, repoRoot, { base: '' });
  const deepBlock = renderFooter({}, repoRoot, { base: '../' });

  assert.match(rootBlock, /src="poetic-logo\.svg"/);
  assert.match(deepBlock, /src="\.\.\/poetic-logo\.svg"/);
});

test('renderFooter: raw file content is trimmed before wrapping', () => {
  const repoRoot = tmpRepo({ 'public/poetic-footer.html': '\n\n  <p>content</p>  \n\n' });
  const block = renderFooter({}, repoRoot, { base: '' });
  assert.match(block, /<footer class="poetic-footer"><p>content<\/p><\/footer>/);
});

test('DEFAULT_FOOTER_SOURCE matches the documented default and the shipped default file exists', () => {
  assert.strictEqual(DEFAULT_FOOTER_SOURCE, 'public/poetic-footer.html');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, DEFAULT_FOOTER_SOURCE)));
});

test('renderFooter: the framework-shipped default footer names Poetic and links the logo', () => {
  const block = renderFooter({}, REPO_ROOT, { base: '../' });
  assert.match(block, /Built with Poetic/);
  assert.match(block, /href="https:\/\/github\.com\/warwickallen\/poetic"/);
  assert.match(block, /src="\.\.\/poetic-logo\.svg"/);
});

// ── upsertFooter ─────────────────────────────────────────────────────────────

const PAGE = '<!DOCTYPE html>\n<html><head></head><body><p>content</p></body></html>';

test('upsertFooter: inserts the footer as the last child of <body>', () => {
  const out = upsertFooter(PAGE, footerBlockFor('hi'));
  assert.match(out, /<p>content<\/p><!-- poetic:footer -->\n<footer class="poetic-footer">hi<\/footer>\n<!-- \/poetic:footer -->\n<\/body>/);
});

test('upsertFooter: an empty footerBlock on a page with no footer is a no-op', () => {
  assert.strictEqual(upsertFooter(PAGE, ''), PAGE);
});

test('upsertFooter: calling twice with the same block does not duplicate it', () => {
  const block = footerBlockFor('hi');
  const once = upsertFooter(PAGE, block);
  const twice = upsertFooter(once, block);
  assert.strictEqual(twice, once);
  assert.strictEqual((twice.match(/<footer/g) || []).length, 1);
});

test('upsertFooter: replaces a previously-inserted block with new content', () => {
  const first = upsertFooter(PAGE, footerBlockFor('old'));
  const second = upsertFooter(first, footerBlockFor('new'));
  assert.match(second, /new/);
  assert.doesNotMatch(second, /old/);
  assert.strictEqual((second.match(/<footer/g) || []).length, 1);
});

test('upsertFooter: passing "" strips a previously-inserted block entirely', () => {
  const withFooter = upsertFooter(PAGE, footerBlockFor('hi'));
  const stripped = upsertFooter(withFooter, '');
  assert.strictEqual(stripped, PAGE);
  assert.doesNotMatch(stripped, /poetic:footer/);
});

// ── Self-heal integration with generateIndexHtml ────────────────────────────

test('generateIndexHtml + upsertFooter: footer persists and does not duplicate across rebuilds', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-footer-index-'));
  const footerBlock = footerBlockFor('Built with Poetic');

  // First build: no existing index.html.
  const first = upsertFooter(generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems'), footerBlock);
  fs.writeFileSync(path.join(dir, 'index.html'), first, 'utf8');
  assert.strictEqual((first.match(/<footer/g) || []).length, 1);

  // Second build: self-heals the existing index.html; footer must not duplicate.
  const second = upsertFooter(generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems'), footerBlock);
  assert.strictEqual((second.match(/<footer/g) || []).length, 1);
  assert.match(second, /Built with Poetic/);
});

test('generateIndexHtml + upsertFooter: disabling the footer removes it from a previously-built index.html', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-footer-index-'));
  const footerBlock = footerBlockFor('Built with Poetic');

  const first = upsertFooter(generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems'), footerBlock);
  fs.writeFileSync(path.join(dir, 'index.html'), first, 'utf8');

  // Rebuild with footer.enabled=false (footerBlock computed as '' by the caller).
  const second = upsertFooter(generateIndexHtml(dir, 'poetic-logo.svg', 'My Poems'), '');
  assert.doesNotMatch(second, /poetic-footer/);
  assert.doesNotMatch(second, /poetic:footer/);
});

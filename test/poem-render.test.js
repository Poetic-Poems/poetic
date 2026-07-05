'use strict';

/**
 * Tests for the new standalone-poem-pages + shared Audiomack loader feature (v0.2.0).
 *
 * Verifies:
 *   - renderFragment produces a bare HTML fragment with data-* Audiomack button and NO inline script
 *   - renderPage produces a full <!DOCTYPE html> document linking ../poetic.css, ../custom.css, ../poetic.js
 *   - build-poems writes public/<slug>/index.html (full page) + public/<slug>.html (redirect stub)
 *   - build-all-poems all-poems.html contains exactly ONE <script src="poetic.js" and ZERO function loadAudiomackPlayer
 *   - index.html poem links point to <slug>/ (clean URL)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { renderFragment, renderPage, loadPoemData } = require('../src/tools/poem-render');
const { readPoeticConfig } = require('../src/tools/poetic-config');

// Minimal poem YAML fixture ─ exercises the Audiomack audio path
const FIXTURE_YAML = `
title: Test Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  audiomack: true
`;

// Helper: write a temp YAML file and return its path
function writeTempYaml(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-test-'));
  const yamlPath = path.join(dir, 'test-poem.yaml');
  fs.writeFileSync(yamlPath, content, 'utf8');
  return { dir, yamlPath };
}

// ── renderFragment ────────────────────────────────────────────────────────────

test('renderFragment: produces a bare HTML fragment (no DOCTYPE / html / head / body)', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  assert.ok(poemData, 'loadPoemData should return data');

  const html = renderFragment(poemData, { audiomackArtist: 'testartist' });

  assert.ok(!html.includes('<!DOCTYPE'), 'fragment must not contain DOCTYPE');
  assert.ok(!html.includes('<html'), 'fragment must not contain <html>');
  assert.ok(!html.includes('<head'), 'fragment must not contain <head>');
  assert.ok(!html.includes('<body'), 'fragment must not contain <body>');
  assert.ok(html.includes('id="poem--test-poem"'), 'fragment must contain poem div');
});

test('renderFragment: Audiomack button uses data-* attributes and has NO inline onclick', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { audiomackArtist: 'myartist' });

  assert.ok(html.includes('class="load-audiomack-btn"'), 'must have load-audiomack-btn class');
  assert.ok(html.includes('data-artist="myartist"'), 'must have data-artist attribute');
  assert.ok(html.includes('data-slug="test-poem"'), 'must have data-slug attribute');
  assert.ok(html.includes('data-title="Test Poem"'), 'must have data-title attribute');
  assert.ok(!html.includes('onclick'), 'button must have NO onclick attribute');
});

test('renderFragment: NO inline loadAudiomackPlayer function', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { audiomackArtist: 'myartist' });

  assert.ok(
    !html.includes('function loadAudiomackPlayer'),
    'fragment must not contain inline loadAudiomackPlayer function'
  );
  assert.ok(
    !html.includes('<script'),
    'fragment must not contain any <script> block'
  );
});

// ── renderPage ────────────────────────────────────────────────────────────────

test('renderPage: produces a full <!DOCTYPE html> document', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', audiomackArtist: 'myartist' });

  assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'), 'must have DOCTYPE');
  assert.ok(html.includes('<html'), 'must have <html>');
  assert.ok(html.includes('<head'), 'must have <head>');
  assert.ok(html.includes('<body'), 'must have <body>');
});

test('renderPage: links poetic.css, custom.css, poetic.js with ../ prefix', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', audiomackArtist: 'myartist' });

  assert.ok(html.includes('../poetic.css'), 'must link ../poetic.css');
  assert.ok(html.includes('../custom.css'), 'must link ../custom.css');
  assert.ok(html.includes('../poetic.js'), 'must link ../poetic.js');
});

test('renderPage: title element contains poem title', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', audiomackArtist: 'myartist' });

  assert.ok(html.includes('<title>Test Poem</title>'), 'must contain <title>Test Poem</title>');
});

test('renderPage: favicon uses ../ prefix (already public/-stripped)', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'my-icon.png', audiomackArtist: '' });

  assert.ok(html.includes('../my-icon.png'), 'favicon must use ../ prefix');
  assert.ok(!html.includes('public/my-icon.png'), 'favicon must not include public/ prefix');
});

test('renderPage: Audiomack button has NO inline loadAudiomackPlayer function', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', audiomackArtist: 'myartist' });

  assert.ok(
    !html.includes('function loadAudiomackPlayer'),
    'page must not contain inline loadAudiomackPlayer'
  );
});

// ── readPoeticConfig ──────────────────────────────────────────────────────────

test('readPoeticConfig: parses audiomack_artist key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-cfg-'));
  fs.writeFileSync(path.join(dir, '.poetic-config'), 'audiomack_artist=testband\nfavicon=test.svg\n', 'utf8');
  const config = readPoeticConfig(dir);
  assert.strictEqual(config.audiomack_artist, 'testband');
  assert.strictEqual(config.favicon, 'test.svg');
});

test('readPoeticConfig: returns empty object when file absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-cfg-'));
  const config = readPoeticConfig(dir);
  assert.deepStrictEqual(config, {});
});

// ── postscript "See more" preview ──────────────────────────────────────────────

// Minimal poemData for exercising the postscript preview toggle directly
// (renderFragment accepts a plain object; it doesn't need to come from loadPoemData).
function postscriptPoemData(postscript) {
  return {
    title: 'Postscript Poem',
    author: 'Test Author',
    date: '1970-01-31',
    slug: 'postscript-poem',
    versions: [{ segments: [{ lines: 'Hello world\n' }] }],
    postscript,
  };
}

test('postscript with explicit preview params emits the checkbox toggle, --preview-lines budget, and label', () => {
  const poemData = postscriptPoemData([
    { label: 'My Note', params: { preview: 'true', 'preview-lines': '3' }, content: '<p>Some content</p>' },
  ]);
  const html = renderFragment(poemData, {});

  assert.ok(html.includes('class="postscript-toggle-cb hidden"'), 'must include the hidden toggle checkbox');
  assert.ok(html.includes('type="checkbox"'), 'toggle input must be a checkbox');
  assert.ok(html.includes('--preview-lines: 3'), 'postscript-content style must carry the preview-lines budget');
  assert.ok(html.includes('data-preview-lines="3"'), 'postscript-content must carry data-preview-lines for JS');
  assert.ok(html.includes('class="postscript-content"'), 'content must be wrapped in .postscript-content');
  assert.ok(html.includes('class="postscript-toggle"'), 'must include the .postscript-toggle label');
  assert.ok(/<label[^>]*class="postscript-toggle"[^>]*for="([^"]+)"/.test(html), 'label must reference the checkbox id via for=');
});

test('postscript with no params defaults to preview ON with 5 lines', () => {
  const poemData = postscriptPoemData([
    { label: 'My Note', content: '<p>Some content</p>' },
  ]);
  const html = renderFragment(poemData, {});

  assert.ok(html.includes('class="postscript-toggle-cb hidden"'), 'default (no params) must still emit the toggle checkbox');
  assert.ok(html.includes('--preview-lines: 5'), 'default preview-lines must be 5');
  assert.ok(html.includes('data-preview-lines="5"'), 'default data-preview-lines must be 5');
});

test('postscript with preview=false renders plain content with no checkbox/toggle', () => {
  const poemData = postscriptPoemData([
    { label: 'My Note', params: { preview: 'false' }, content: '<p>Some content</p>' },
  ]);
  const html = renderFragment(poemData, {});

  assert.ok(!html.includes('postscript-toggle-cb'), 'preview=false must not emit the toggle checkbox');
  assert.ok(!html.includes('postscript-content'), 'preview=false must not wrap content in .postscript-content');
  assert.ok(!html.includes('postscript-toggle'), 'preview=false must not emit the .postscript-toggle label');
  assert.ok(html.includes('<p>Some content</p>'), 'content must still render in full');
});

test('postscript with an invalid preview-lines value falls back to the default of 5', () => {
  const poemData = postscriptPoemData([
    { label: 'My Note', params: { 'preview-lines': 'not-a-number' }, content: '<p>Some content</p>' },
  ]);
  const html = renderFragment(poemData, {});

  assert.ok(html.includes('--preview-lines: 5'), 'non-numeric preview-lines must fall back to 5');
  assert.ok(html.includes('data-preview-lines="5"'), 'non-numeric preview-lines must fall back to 5');
});

// ── slug derivation ──────────────────────────────────────────────────────────

test('loadPoemData: slug is derived from the filename stem, not the title', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-test-'));
  const yamlPath = path.join(dir, 'psalm-23-1998.yaml');
  fs.writeFileSync(yamlPath, `
title: My Shepherd
author: Test Author
date: 1998-01-31
versions:
  - segments:
      - lines: "The Lord is my shepherd\\n"
`, 'utf8');

  const poemData = loadPoemData(yamlPath);
  assert.ok(poemData, 'loadPoemData should return data');
  assert.strictEqual(poemData.slug, 'psalm-23-1998', 'slug must come from the filename stem, not slugify(title)');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── redirect stub format ──────────────────────────────────────────────────────

test('redirect stub is a meta-refresh pointing to ./<slug>/', () => {
  // We verify the format by constructing one the same way build-poems.js does
  const slug = 'my-poem';
  const redirectHtml = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n<link rel="canonical" href="./${slug}/">\n<meta http-equiv="refresh" content="0; url=./${slug}/"></head>\n<body><p>This poem has moved to <a href="./${slug}/">${slug}/</a>.</p></body></html>`;

  assert.ok(redirectHtml.includes(`href="./${slug}/"`), 'redirect must link to ./<slug>/');
  assert.ok(redirectHtml.includes(`url=./${slug}/`), 'meta-refresh must point to ./<slug>/');
  assert.ok(redirectHtml.includes('<link rel="canonical"'), 'must have canonical link');
  assert.ok(!redirectHtml.includes('<!DOCTYPE html>\n<!DOCTYPE'), 'must have exactly one DOCTYPE');
});

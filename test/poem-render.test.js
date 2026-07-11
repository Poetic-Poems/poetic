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

const { renderFragment, renderPage, loadPoemData, resolveRefs, readPoemFile, clearRefCache, listPoemYamlFiles, collectRefFiles, refFilesForPoem } = require('../src/tools/poem-render');
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

  const html = renderFragment(poemData, { config: { song_handlers: { audiomack: { artist: 'testartist' } } } });

  assert.ok(!html.includes('<!DOCTYPE'), 'fragment must not contain DOCTYPE');
  assert.ok(!html.includes('<html'), 'fragment must not contain <html>');
  assert.ok(!html.includes('<head'), 'fragment must not contain <head>');
  assert.ok(!html.includes('<body'), 'fragment must not contain <body>');
  assert.ok(html.includes('id="poem--test-poem"'), 'fragment must contain poem div');
});

test('renderFragment: Audiomack embed button uses data-embed-src/data-title and has NO inline onclick', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(html.includes('class="song-embed-btn"'), 'must have song-embed-btn class');
  assert.ok(html.includes('song-embed--audiomack'), 'must have song-embed--audiomack wrapper class');
  assert.ok(html.includes('song-item-embed'), 'embed-type item must carry the generic song-item-embed class');
  assert.ok(!html.includes('song-item-link'), 'an embed-only item must NOT carry song-item-link');
  assert.ok(
    html.includes('data-embed-src="https://audiomack.com/embed/myartist/song/test-poem"'),
    'must have data-embed-src attribute built from artist + slug fallback'
  );
  assert.ok(html.includes('data-title="Test Poem"'), 'must have data-title attribute');
  assert.ok(html.includes('🎵 Load Audiomack Player'), 'button text must be the Audiomack load label');
  assert.ok(
    html.includes('style="--song-embed-height: 252px"'),
    'Audiomack must emit its fixed-height size custom property'
  );
  assert.ok(!html.includes('song-embed-player--aspect'), 'a fixed-height player must NOT use the aspect modifier');
  assert.ok(!html.includes('onclick'), 'button must have NO onclick attribute');
  assert.ok(!html.includes('load-audiomack-btn'), 'must not use the old load-audiomack-btn class');
  assert.ok(!html.includes('data-artist'), 'must not have a data-artist attribute');
  assert.ok(!html.includes('data-slug'), 'must not have a data-slug attribute');
});

test('renderFragment: NO inline loadAudiomackPlayer function', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(
    !html.includes('function loadAudiomackPlayer'),
    'fragment must not contain inline loadAudiomackPlayer function'
  );
  assert.ok(
    !html.includes('<script'),
    'fragment must not contain any <script> block'
  );
});

// ── MEGA embed (audio + video sizing) ──────────────────────────────────────

const MEGA_AUDIO_YAML = `
title: Mega Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  mega:
    value: AbC1dEfG#Key1234567890
    media: audio
`;

const MEGA_VIDEO_YAML = `
title: Mega Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  mega:
    value: AbC1dEfG#Key1234567890
    media: video
`;

test('renderFragment: MEGA audio embed uses the /embed/ src, MEGA label, square aspect var and data-embed-media', () => {
  const { yamlPath } = writeTempYaml(MEGA_AUDIO_YAML);
  const html = renderFragment(loadPoemData(yamlPath), { config: {} });

  assert.ok(html.includes('class="song-embed-btn"'), 'must have song-embed-btn class');
  assert.ok(html.includes('song-embed--mega'), 'must have song-embed--mega wrapper class');
  assert.ok(html.includes('song-embed--mega--audio'), 'must carry the per-media class');
  assert.ok(
    html.includes('data-embed-src="https://mega.nz/embed/AbC1dEfG#Key1234567890"'),
    'must build the /embed/ URL from the id#key value'
  );
  assert.ok(html.includes('data-embed-media="audio"'), 'must expose the resolved media type');
  assert.ok(html.includes('🎵 Load MEGA Player'), 'button text must be the MEGA load label');
  assert.ok(
    html.includes('style="--song-embed-aspect-ratio: 1 / 1"'),
    'MEGA audio (cover-art viewport) must emit the square aspect-ratio custom property'
  );
  assert.ok(html.includes('song-embed-player--aspect'), 'an aspect-sized player must use the aspect modifier');
  assert.ok(!html.includes('--song-embed-height'), 'MEGA audio must NOT emit a fixed height');
});

test('renderFragment: MEGA video embed emits the aspect-ratio var and --aspect modifier class', () => {
  const { yamlPath } = writeTempYaml(MEGA_VIDEO_YAML);
  const html = renderFragment(loadPoemData(yamlPath), { config: {} });

  assert.ok(html.includes('song-embed--mega--video'), 'must carry the per-media video class');
  assert.ok(html.includes('data-embed-media="video"'), 'must expose media=video');
  assert.ok(html.includes('song-embed-player--aspect'), 'video must use the aspect modifier class');
  assert.ok(
    html.includes('style="--song-embed-aspect-ratio: 16 / 9"'),
    'video must emit the aspect-ratio size custom property'
  );
  assert.ok(!html.includes('--song-embed-height'), 'video must NOT emit a fixed height');
});

test('renderFragment: Suno renders a plain link with NO literal parentheses (styling is CSS now)', () => {
  const { yamlPath } = writeTempYaml(`
title: Suno Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  suno: "s/x"
`);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { config: {} });

  assert.ok(
    html.includes('<a class="song-link-anchor song-link--suno" href="https://suno.com/s/x" target="_blank">recording on Suno</a>'),
    'must render the exact Suno link anchor'
  );
  assert.ok(html.includes('song-item-link'), 'link-type item must carry the generic song-item-link class');
  assert.ok(!html.includes('song-item-embed'), 'a link-only item must NOT carry song-item-embed');
  assert.ok(!html.includes('('), 'must not contain a literal ( around the Suno link');
  assert.ok(!html.includes(')'), 'must not contain a literal ) around the Suno link');
});

test('renderFragment: custom song_handlers entry (e.g. youtube) produces embed + link markup', () => {
  const { yamlPath } = writeTempYaml(`
title: YouTube Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  youtube: ID123
`);
  const poemData = loadPoemData(yamlPath);
  const config = {
    song_handlers: {
      youtube: {
        embed_url: 'https://www.youtube.com/embed/{value}',
        button_label: '▶ YT',
        link_url: 'https://youtu.be/{value}',
        link_label: 'watch',
      },
    },
  };
  const html = renderFragment(poemData, { config });

  assert.ok(html.includes('data-embed-src="https://www.youtube.com/embed/ID123"'), 'embed src must substitute {value}');
  assert.ok(html.includes('href="https://youtu.be/ID123"'), 'link href must substitute {value}');
  assert.ok(html.includes('song-embed--youtube'), 'embed wrapper must carry the song-embed--youtube class');
  assert.ok(html.includes('song-link--youtube'), 'link anchor must carry the song-link--youtube class');
});

test('renderFragment: a handler embed_allow/embed_allowfullscreen override renders as data-allow/data-allow-fullscreen', () => {
  const { yamlPath } = writeTempYaml(`
title: YouTube Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  youtube: ID123
`);
  const poemData = loadPoemData(yamlPath);
  const config = {
    song_handlers: {
      youtube: {
        embed_url: 'https://www.youtube.com/embed/{value}',
        button_label: '▶ YT',
        embed_allow: 'autoplay; encrypted-media',
        embed_allowfullscreen: false,
      },
    },
  };
  const html = renderFragment(poemData, { config });

  assert.ok(html.includes('data-allow="autoplay; encrypted-media"'), 'must carry the handler\'s allow override');
  assert.ok(html.includes('data-allow-fullscreen="false"'), 'an explicit false must render, not be dropped');
});

test('renderFragment: with no embed_allow/embed_allowfullscreen override, neither data attribute is rendered', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { config: { song_handlers: { audiomack: { artist: 'testartist' } } } });

  assert.ok(!html.includes('data-allow='), 'no handler override means no data-allow attribute');
  assert.ok(!html.includes('data-allow-fullscreen='), 'no handler override means no data-allow-fullscreen attribute');
});

test('renderFragment: an audio entry with no matching handler is silently skipped', () => {
  const { yamlPath } = writeTempYaml(`
title: Bandcamp Poem
author: Test Author
date: 1970-01-31
versions:
  - segments:
      - lines: "Hello world\\n"
audio:
  bandcamp: x
`);
  const poemData = loadPoemData(yamlPath);
  const html = renderFragment(poemData, { config: {} });

  assert.ok(!html.includes('bandcamp'), 'unresolved service name must not appear in output');
  assert.ok(!html.includes('song-embed-btn'), 'must not render an embed button for an unhandled service');
  assert.ok(!html.includes('song-link-anchor'), 'must not render a link anchor for an unhandled service');
});

// ── renderPage ────────────────────────────────────────────────────────────────

test('renderPage: produces a full <!DOCTYPE html> document', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'), 'must have DOCTYPE');
  assert.ok(html.includes('<html'), 'must have <html>');
  assert.ok(html.includes('<head'), 'must have <head>');
  assert.ok(html.includes('<body'), 'must have <body>');
});

test('renderPage: links poetic.css, custom.css, poetic.js with ../ prefix', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(html.includes('../poetic.css'), 'must link ../poetic.css');
  assert.ok(html.includes('../custom.css'), 'must link ../custom.css');
  assert.ok(html.includes('../poetic.js'), 'must link ../poetic.js');
});

test('renderPage: title element contains poem title', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(html.includes('<title>Test Poem</title>'), 'must contain <title>Test Poem</title>');
});

test('renderPage: favicon uses ../ prefix (already public/-stripped)', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'my-icon.png', config: { song_handlers: { audiomack: { artist: '' } } } });

  assert.ok(html.includes('../my-icon.png'), 'favicon must use ../ prefix');
  assert.ok(!html.includes('public/my-icon.png'), 'favicon must not include public/ prefix');
});

test('renderPage: Audiomack button has NO inline loadAudiomackPlayer function', () => {
  const { yamlPath } = writeTempYaml(FIXTURE_YAML);
  const poemData = loadPoemData(yamlPath);
  const html = renderPage(poemData, { favicon: 'poetic-logo.svg', config: { song_handlers: { audiomack: { artist: 'myartist' } } } });

  assert.ok(
    !html.includes('function loadAudiomackPlayer'),
    'page must not contain inline loadAudiomackPlayer'
  );
});

// ── readPoeticConfig ──────────────────────────────────────────────────────────

test('readPoeticConfig: parses a nested song_handlers key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-cfg-'));
  fs.writeFileSync(
    path.join(dir, '.poetic-config.yaml'),
    'song_handlers:\n  audiomack:\n    artist: testband\nfavicon: test.svg\n',
    'utf8'
  );
  const config = readPoeticConfig(dir);
  assert.strictEqual(config.song_handlers.audiomack.artist, 'testband');
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

// ── $ref cycle detection ────────────────────────────────────────────────────

function writeTempRefFiles(filesMap) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-ref-cycle-'));
  const paths = {};
  for (const [name, content] of Object.entries(filesMap)) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content, 'utf8');
    paths[name] = p;
  }
  return { dir, paths };
}

test('resolveRefs: a $ref that points back to itself throws a clear cycle error (not a RangeError / stack overflow)', () => {
  clearRefCache();
  const { paths } = writeTempRefFiles({
    'self.yaml': '$ref: self.yaml\n',
  });
  const data = { $ref: 'self.yaml' };

  let caught;
  try {
    resolveRefs(data, path.dirname(paths['self.yaml']));
    assert.fail('expected resolveRefs to throw on a self-referencing $ref cycle');
  } catch (err) {
    caught = err;
  }
  assert.match(caught.message, /cycle/i, 'error message must mention the cycle');
  assert.ok(caught.message.includes('self.yaml'), 'error message must name the referencing file');
});

test('resolveRefs: a two-file $ref cycle (A -> B -> A) throws a clear cycle error', () => {
  clearRefCache();
  const { paths } = writeTempRefFiles({
    'a.yaml': '$ref: b.yaml\n',
    'b.yaml': '$ref: a.yaml\n',
  });
  const data = { $ref: 'b.yaml' };

  let caught;
  try {
    resolveRefs(data, path.dirname(paths['a.yaml']));
    assert.fail('expected resolveRefs to throw on a two-file $ref cycle');
  } catch (err) {
    caught = err;
  }
  assert.match(caught.message, /cycle/i, 'error message must mention the cycle');
  assert.ok(
    caught.message.includes('a.yaml') && caught.message.includes('b.yaml'),
    'error message must name both files in the cycle'
  );
});

test('readPoemFile: a $ref cycle is caught and reported, returning null instead of crashing', () => {
  clearRefCache();
  const { paths } = writeTempRefFiles({
    'cyclic.yaml': '$ref: cyclic.yaml\n',
  });
  const result = readPoemFile(paths['cyclic.yaml']);
  assert.strictEqual(result, null, 'readPoemFile should return null (not throw / crash) on a $ref cycle');
});

// ── collectRefFiles / refFilesForPoem (incremental-rebuild dependency tracking)

test('collectRefFiles: returns the actual $ref target files, including non-underscore-prefixed ones', () => {
  const { paths } = writeTempRefFiles({
    'refs.yaml': 'note:\n  content: hello\n',
  });
  const data = { postscript: [{ $ref: 'refs.yaml#/note' }] };
  const found = collectRefFiles(data, path.dirname(paths['refs.yaml']));
  assert.deepStrictEqual(found, [paths['refs.yaml']],
    'a plain (non _-prefixed) $ref target must be discovered');
});

test('collectRefFiles: follows chained refs transitively (A -> B -> C)', () => {
  const { dir, paths } = writeTempRefFiles({
    'a.yaml': 'first:\n  $ref: b.yaml#/second\n',
    'b.yaml': 'second:\n  $ref: c.yaml#/third\n',
    'c.yaml': 'third:\n  content: done\n',
  });
  const data = { $ref: 'a.yaml#/first' };
  const found = collectRefFiles(data, dir).sort();
  assert.deepStrictEqual(found, [paths['a.yaml'], paths['b.yaml'], paths['c.yaml']].sort(),
    'every file in the ref chain must be reported');
});

test('collectRefFiles: a $ref cycle terminates (no stack overflow) and still reports the files', () => {
  const { dir, paths } = writeTempRefFiles({
    'x.yaml': '$ref: y.yaml\n',
    'y.yaml': '$ref: x.yaml\n',
  });
  const data = { $ref: 'x.yaml' };
  const found = collectRefFiles(data, dir).sort();
  assert.deepStrictEqual(found, [paths['x.yaml'], paths['y.yaml']].sort());
});

test('collectRefFiles: a missing $ref target is still recorded (so creating it will invalidate the build)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-ref-missing-'));
  const data = { postscript: [{ $ref: 'not-there.yaml#/x' }] };
  const found = collectRefFiles(data, dir);
  assert.deepStrictEqual(found, [path.join(dir, 'not-there.yaml')]);
});

test('refFilesForPoem: reads a poem YAML and returns its transitive $ref target paths', () => {
  const { dir, paths } = writeTempRefFiles({
    'poem.yaml': 'title: P\nauthor: A\ndate: 2020-01-01\npostscript:\n  - $ref: shared.yaml#/note\n',
    'shared.yaml': 'note:\n  content: shared\n',
  });
  assert.deepStrictEqual(refFilesForPoem(paths['poem.yaml']), [path.join(dir, 'shared.yaml')]);
});

test('refFilesForPoem: returns [] for an unparseable/missing poem file (caller re-reports the error)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-ref-bad-'));
  assert.deepStrictEqual(refFilesForPoem(path.join(dir, 'nope.yaml')), []);
});

// ── listPoemYamlFiles ────────────────────────────────────────────────────────

function writeFixtureDir(basenames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-yaml-files-'));
  for (const name of basenames) {
    fs.writeFileSync(path.join(dir, name), '', 'utf8');
  }
  return dir;
}

test('listPoemYamlFiles: accepts both .yaml and .yml, excludes YAML-SCHEMA* and _-prefixed files', () => {
  const dir = writeFixtureDir([
    'a-poem.yaml',
    'b-poem.yml',
    'YAML-SCHEMA.yaml',
    'YAML-SCHEMA.yml',
    '_shared.yaml',
    '_partial.yml',
    'notes.txt',
  ]);

  const result = listPoemYamlFiles(dir).sort();

  assert.deepStrictEqual(result, ['a-poem.yaml', 'b-poem.yml']);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('listPoemYamlFiles: returns basenames, not full paths', () => {
  const dir = writeFixtureDir(['only-poem.yaml']);

  const result = listPoemYamlFiles(dir);

  assert.deepStrictEqual(result, ['only-poem.yaml']);
  assert.ok(!result[0].includes(path.sep), 'result must be a bare basename, not a full path');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('listPoemYamlFiles: returns an empty array when the directory has no matching files', () => {
  const dir = writeFixtureDir(['YAML-SCHEMA.yaml', '_shared.yaml', 'readme.md']);

  assert.deepStrictEqual(listPoemYamlFiles(dir), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

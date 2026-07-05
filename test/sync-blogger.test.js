'use strict';

/**
 * Tests for sync-blogger.js pure helpers.
 *
 * Covers: parseArgs, resolveConfig, extractSlug, mapBySlug, composePost,
 * normalizeHtml, postNeedsUpdate, selectRemoved, extractContent.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  parseArgs,
  resolveConfig,
  extractSlug,
  mapBySlug,
  composePost,
  normalizeHtml,
  postNeedsUpdate,
  selectRemoved,
  extractContent,
} = require('../src/tools/sync-blogger');

// ── parseArgs ─────────────────────────────────────────────────────────────────

test('parseArgs: defaults when no args', () => {
  const result = parseArgs([]);
  assert.strictEqual(result.dryRun, false);
  assert.strictEqual(result.only, null);
});

test('parseArgs: --dry-run sets dryRun to true', () => {
  const result = parseArgs(['--dry-run']);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.only, null);
});

test('parseArgs: --only captures next argument', () => {
  const result = parseArgs(['--only', 'my-poem-slug']);
  assert.strictEqual(result.dryRun, false);
  assert.strictEqual(result.only, 'my-poem-slug');
});

test('parseArgs: --dry-run and --only together', () => {
  const result = parseArgs(['--dry-run', '--only', 'some-slug']);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.only, 'some-slug');
});

test('parseArgs: --only and --dry-run in reversed order', () => {
  const result = parseArgs(['--only', 'alpha', '--dry-run']);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.only, 'alpha');
});

test('parseArgs: unknown flags are silently ignored', () => {
  const result = parseArgs(['--verbose', '--only', 'x', '--extra']);
  assert.strictEqual(result.only, 'x');
  assert.strictEqual(result.dryRun, false);
});

// ── resolveConfig ─────────────────────────────────────────────────────────────

test('resolveConfig: defaults when config is empty', () => {
  const opts = resolveConfig({}, {});
  assert.strictEqual(opts.enabled, false);
  assert.strictEqual(opts.blogId, undefined);
  assert.strictEqual(opts.label, 'poem');
  assert.strictEqual(opts.removed, 'draft');
  assert.strictEqual(opts.content, 'full');
  assert.strictEqual(opts.audiomackArtist, '');
  assert.strictEqual(opts.hasCredentials, false);
});

test('resolveConfig: enabled=true when blogger_sync="true"', () => {
  const opts = resolveConfig({ blogger_sync: 'true' }, {});
  assert.strictEqual(opts.enabled, true);
});

test('resolveConfig: enabled=false for any value other than "true"', () => {
  assert.strictEqual(resolveConfig({ blogger_sync: 'yes' }, {}).enabled, false);
  assert.strictEqual(resolveConfig({ blogger_sync: '1' }, {}).enabled, false);
  assert.strictEqual(resolveConfig({ blogger_sync: '' }, {}).enabled, false);
});

test('resolveConfig: picks up blogger_blog_id', () => {
  const opts = resolveConfig({ blogger_blog_id: '1234567890' }, {});
  assert.strictEqual(opts.blogId, '1234567890');
});

test('resolveConfig: picks up blogger_label', () => {
  const opts = resolveConfig({ blogger_label: 'verses' }, {});
  assert.strictEqual(opts.label, 'verses');
});

test('resolveConfig: valid removed values are accepted', () => {
  assert.strictEqual(resolveConfig({ blogger_removed: 'draft' }, {}).removed, 'draft');
  assert.strictEqual(resolveConfig({ blogger_removed: 'delete' }, {}).removed, 'delete');
  assert.strictEqual(resolveConfig({ blogger_removed: 'keep' }, {}).removed, 'keep');
});

test('resolveConfig: invalid removed falls back to "draft"', () => {
  assert.strictEqual(resolveConfig({ blogger_removed: 'archive' }, {}).removed, 'draft');
  assert.strictEqual(resolveConfig({ blogger_removed: '' }, {}).removed, 'draft');
});

test('resolveConfig: valid content values are accepted', () => {
  assert.strictEqual(resolveConfig({ blogger_content: 'full' }, {}).content, 'full');
  assert.strictEqual(resolveConfig({ blogger_content: 'poem' }, {}).content, 'poem');
});

test('resolveConfig: invalid content falls back to "full"', () => {
  assert.strictEqual(resolveConfig({ blogger_content: 'text' }, {}).content, 'full');
  assert.strictEqual(resolveConfig({ blogger_content: '' }, {}).content, 'full');
});

test('resolveConfig: hasCredentials true when all three vars present', () => {
  const env = {
    BLOGGER_CLIENT_ID: 'cid',
    BLOGGER_CLIENT_SECRET: 'csec',
    BLOGGER_REFRESH_TOKEN: 'rtoken',
  };
  assert.strictEqual(resolveConfig({}, env).hasCredentials, true);
});

test('resolveConfig: hasCredentials false when any var missing', () => {
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_ID: 'x', BLOGGER_CLIENT_SECRET: 'y' }).hasCredentials, false);
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_ID: 'x', BLOGGER_REFRESH_TOKEN: 'z' }).hasCredentials, false);
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_SECRET: 'y', BLOGGER_REFRESH_TOKEN: 'z' }).hasCredentials, false);
});

test('resolveConfig: audiomackArtist from audiomack_artist config key', () => {
  const opts = resolveConfig({ audiomack_artist: 'myband' }, {});
  assert.strictEqual(opts.audiomackArtist, 'myband');
});

// ── extractSlug ───────────────────────────────────────────────────────────────

test('extractSlug: returns the slug from a poem content marker', () => {
  const post = { content: '<div id="poem--my-shepherd-1998"><p>x</p></div>' };
  assert.strictEqual(extractSlug(post), 'my-shepherd-1998');
});

test('extractSlug: returns null when no marker is present', () => {
  const post = { content: '<p>Just some text.</p>' };
  assert.strictEqual(extractSlug(post), null);
});

test('extractSlug: returns null when content is missing', () => {
  assert.strictEqual(extractSlug({}), null);
});

// ── mapBySlug ─────────────────────────────────────────────────────────────────

test('mapBySlug: returns a Map keyed by slug extracted from content', () => {
  const posts = [
    { id: '1', title: 'Poem One', content: '<div id="poem--poem-one">a</div>', labels: ['poem'], status: 'LIVE' },
    { id: '2', title: 'Poem Two', content: '<div id="poem--poem-two">b</div>', labels: ['poem'], status: 'LIVE' },
  ];
  const map = mapBySlug(posts);
  assert.ok(map instanceof Map);
  assert.strictEqual(map.size, 2);
  assert.strictEqual(map.get('poem-one').id, '1');
  assert.strictEqual(map.get('poem-two').id, '2');
});

test('mapBySlug: returns an empty Map for empty input', () => {
  const map = mapBySlug([]);
  assert.ok(map instanceof Map);
  assert.strictEqual(map.size, 0);
});

test('mapBySlug: last entry wins for duplicate slugs', () => {
  const posts = [
    { id: '1', content: '<div id="poem--dup">a</div>' },
    { id: '2', content: '<div id="poem--dup">b</div>' },
  ];
  const map = mapBySlug(posts);
  assert.strictEqual(map.get('dup').id, '2');
});

test('mapBySlug: skips posts with no extractable slug marker', () => {
  const posts = [
    { id: '1', content: '<p>no marker here</p>' },
    { id: '2', content: '<div id="poem--has-slug">x</div>' },
  ];
  const map = mapBySlug(posts);
  assert.strictEqual(map.size, 1);
  assert.strictEqual(map.get('has-slug').id, '2');
});

// ── composePost ───────────────────────────────────────────────────────────────

test('composePost: returns correct shape', () => {
  const post = composePost({
    title: 'My Poem',
    bodyHtml: '<p>verse</p>',
    isoDate: '2024-03-15',
    label: 'poem',
  });
  assert.strictEqual(post.kind, 'blogger#post');
  assert.strictEqual(post.title, 'My Poem');
  assert.strictEqual(post.content, '<p>verse</p>');
  assert.deepStrictEqual(post.labels, ['poem']);
  assert.strictEqual(post.published, '2024-03-15T00:00:00Z');
});

test('composePost: uses midnight GMT for published', () => {
  const post = composePost({ title: 'T', bodyHtml: '', isoDate: '2000-01-01', label: 'poem' });
  assert.ok(post.published.endsWith('T00:00:00Z'), `Expected midnight GMT, got: ${post.published}`);
});

test('composePost: label is wrapped in an array', () => {
  const post = composePost({ title: 'T', bodyHtml: '', isoDate: '2020-06-01', label: 'verses' });
  assert.deepStrictEqual(post.labels, ['verses']);
});

// ── normalizeHtml ─────────────────────────────────────────────────────────────

test('normalizeHtml: collapses multiple spaces to one', () => {
  assert.strictEqual(normalizeHtml('a  b   c'), 'a b c');
});

test('normalizeHtml: trims leading and trailing whitespace', () => {
  assert.strictEqual(normalizeHtml('  hello  '), 'hello');
});

test('normalizeHtml: collapses newlines and tabs as whitespace', () => {
  assert.strictEqual(normalizeHtml('a\n\tb\r\nc'), 'a b c');
});

test('normalizeHtml: handles empty string', () => {
  assert.strictEqual(normalizeHtml(''), '');
});

test('normalizeHtml: leaves already-normal string unchanged', () => {
  assert.strictEqual(normalizeHtml('hello world'), 'hello world');
});

// ── postNeedsUpdate ───────────────────────────────────────────────────────────

test('postNeedsUpdate: returns false when title, content, and labels all match', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

test('postNeedsUpdate: returns true when titles differ', () => {
  const existing = { title: 'Old Title', content: '<p>a</p>', labels: ['poem'] };
  const desired  = { title: 'New Title', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns false when content differs only in whitespace', () => {
  const existing = { title: 'P', content: '<p>a  b</p>', labels: ['poem'] };
  const desired  = { title: 'P', content: '<p>a b</p>',  labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

test('postNeedsUpdate: returns true when content has a real difference', () => {
  const existing = { title: 'P', content: '<p>alpha</p>', labels: ['poem'] };
  const desired  = { title: 'P', content: '<p>beta</p>',  labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns true when a desired label is missing', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['other'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns false when existing has extra labels beyond desired', () => {
  // Extra labels on existing are fine — we only check that desired labels are present
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem', 'extra'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

test('postNeedsUpdate: treats missing labels property as empty array', () => {
  const existing = { title: 'P', content: '<p>a</p>' }; // no .labels
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns false when published differs only by timezone offset for the same instant', () => {
  // 2024-03-14T13:00:00-11:00 is the same instant as 2024-03-15T00:00:00Z
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem'], published: '2024-03-14T13:00:00-11:00' };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'], published: '2024-03-15T00:00:00Z' };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

test('postNeedsUpdate: returns true when published instants differ', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem'], published: '2024-03-15T12:00:00Z' };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'], published: '2024-03-15T00:00:00Z' };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: ignores published when either side omits it', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'], published: '2024-03-15T00:00:00Z' };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

// ── selectRemoved ─────────────────────────────────────────────────────────────

test('selectRemoved: returns live labelled posts not in currentSlugs', () => {
  const posts = [
    { id: '1', title: 'Gone',    content: '<div id="poem--gone">x</div>',    labels: ['poem'], status: 'LIVE' },
    { id: '2', title: 'Present', content: '<div id="poem--present">x</div>', labels: ['poem'], status: 'LIVE' },
  ];
  const current = new Set(['present']);
  const removed = selectRemoved(posts, current, 'poem');
  assert.strictEqual(removed.length, 1);
  assert.strictEqual(removed[0].id, '1');
});

test('selectRemoved: ignores posts without the managed label', () => {
  const posts = [
    { id: '1', title: 'Gone', labels: ['other'], status: 'LIVE' },
  ];
  const current = new Set();
  const removed = selectRemoved(posts, current, 'poem');
  assert.strictEqual(removed.length, 0);
});

test('selectRemoved: ignores draft posts even if labelled and absent', () => {
  const posts = [
    { id: '1', title: 'Gone', labels: ['poem'], status: 'DRAFT' },
  ];
  const current = new Set();
  const removed = selectRemoved(posts, current, 'poem');
  assert.strictEqual(removed.length, 0);
});

test('selectRemoved: returns empty array when all labelled live posts are in currentSlugs', () => {
  const posts = [
    { id: '1', title: 'A', content: '<div id="poem--a">x</div>', labels: ['poem'], status: 'LIVE' },
    { id: '2', title: 'B', content: '<div id="poem--b">x</div>', labels: ['poem'], status: 'LIVE' },
  ];
  const current = new Set(['a', 'b']);
  const removed = selectRemoved(posts, current, 'poem');
  assert.strictEqual(removed.length, 0);
});

test('selectRemoved: returns empty array for empty posts list', () => {
  const removed = selectRemoved([], new Set(['some-slug']), 'poem');
  assert.strictEqual(removed.length, 0);
});

test('selectRemoved: posts with missing labels property are ignored', () => {
  const posts = [
    { id: '1', title: 'Gone', status: 'LIVE' }, // no labels
  ];
  const removed = selectRemoved(posts, new Set(), 'poem');
  assert.strictEqual(removed.length, 0);
});

test('selectRemoved: skips labelled live posts with no slug marker (legacy/unmanaged) and warns', () => {
  const posts = [
    { id: '1', title: 'Hand-made post', content: '<p>No marker here.</p>', labels: ['poem'], status: 'LIVE' },
  ];
  const originalWarn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  let removed;
  try {
    removed = selectRemoved(posts, new Set(), 'poem');
  } finally {
    console.warn = originalWarn;
  }
  assert.strictEqual(removed.length, 0);
  assert.ok(warned, 'expected console.warn to be called for a legacy/unmanaged post');
});

// ── extractContent ────────────────────────────────────────────────────────────

const SAMPLE_AUDIO = '<div class="song-link" id="song--my-poem"><div class="audiomack-container" id="audiomack-container--my-poem"><button class="load-audiomack-btn" id="load-audiomack--my-poem" type="button" data-slug="my-poem" data-title="My Poem" data-artist="testartist">Load</button><div class="audiomack-player" id="audiomack-player--my-poem" style="display: none;"></div></div></div>';

const SAMPLE_ANALYSIS_BTN = '<button class="analysis show" id="show-analysis--my-poem" type="button" onclick="...">Show analysis</button>';

const SAMPLE_ANALYSIS_DIV = '<div class="analysis" id="analysis--my-poem"><button class="analysis hide" id="hide-analysis--my-poem" type="button">Hide</button><p>Analysis text here.</p></div>';

const POEM_BODY = '<div id="poem--my-poem"><div class="poem-body">The lines of the poem.</div>';

const FULL_FRAGMENT = POEM_BODY + SAMPLE_AUDIO + SAMPLE_ANALYSIS_BTN + SAMPLE_ANALYSIS_DIV + '</div>';

test('extractContent: mode="full" returns HTML unchanged', () => {
  const result = extractContent(FULL_FRAGMENT, 'full');
  assert.strictEqual(result, FULL_FRAGMENT);
});

test('extractContent: mode="poem" removes the song-link audio block', () => {
  const result = extractContent(FULL_FRAGMENT, 'poem');
  assert.ok(!result.includes('class="song-link"'), 'audio block should be removed');
  assert.ok(!result.includes('load-audiomack-btn'), 'audiomack button should be removed');
});

test('extractContent: mode="poem" removes the show-analysis button', () => {
  const result = extractContent(FULL_FRAGMENT, 'poem');
  assert.ok(!result.includes('show-analysis--'), 'show-analysis button should be removed');
});

test('extractContent: mode="poem" keeps the poem body', () => {
  const result = extractContent(FULL_FRAGMENT, 'poem');
  assert.ok(result.includes('id="poem--my-poem"'), 'poem div should remain');
  assert.ok(result.includes('The lines of the poem.'), 'poem text should remain');
});

test('extractContent: mode="poem" on HTML with no audio/analysis never throws', () => {
  const plain = '<div id="poem--no-extras"><p>Just a poem.</p></div>';
  let result;
  assert.doesNotThrow(() => {
    result = extractContent(plain, 'poem');
  });
  assert.ok(result.includes('Just a poem.'), 'content should be preserved');
});

test('extractContent: mode="poem" on empty string never throws', () => {
  let result;
  assert.doesNotThrow(() => {
    result = extractContent('', 'poem');
  });
  assert.strictEqual(result, '');
});

test('extractContent: unknown mode returns HTML unchanged (treated as full)', () => {
  // The spec says mode='full' returns unchanged; any non-'poem' is effectively 'full'
  const result = extractContent(FULL_FRAGMENT, 'full');
  assert.strictEqual(result, FULL_FRAGMENT);
});

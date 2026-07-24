'use strict';

/**
 * Tests for sync-blogger.js pure helpers.
 *
 * Covers: parseArgs, resolveConfig, extractSlug, mapBySlug,
 * bloggerAcceptableLabels, composePost, normalizeHtml, postNeedsUpdate,
 * selectRemoved, extractContent, explainBloggerFailure.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseArgs,
  resolveConfig,
  extractSlug,
  mapBySlug,
  bloggerAcceptableLabels,
  composePost,
  normalizeHtml,
  postNeedsUpdate,
  selectRemoved,
  extractContent,
  explainBloggerFailure,
  fetchWithRetry,
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

// `credentialsPath` is passed as `null` throughout so these tests never read
// a real `.blogger-credentials.json` that might exist in the process's CWD
// (e.g. in a consumer repo that has run blogger-auth.js) — see TECH-DEBT.md.

test('resolveConfig: defaults when config is empty', () => {
  const opts = resolveConfig({}, {}, null);
  assert.strictEqual(opts.enabled, false);
  assert.strictEqual(opts.blogId, undefined);
  assert.strictEqual(opts.label, 'poem');
  assert.strictEqual(opts.removed, 'draft');
  assert.strictEqual(opts.content, 'full');
  assert.strictEqual(opts.hasCredentials, false);
});

test('resolveConfig: enabled=true when blogger.sync=true', () => {
  const opts = resolveConfig({ blogger: { sync: true } }, {}, null);
  assert.strictEqual(opts.enabled, true);
});

test('resolveConfig: enabled=false for any value other than the boolean true', () => {
  assert.strictEqual(resolveConfig({ blogger: { sync: 'true' } }, {}, null).enabled, false);
  assert.strictEqual(resolveConfig({ blogger: { sync: 'yes' } }, {}, null).enabled, false);
  assert.strictEqual(resolveConfig({ blogger: { sync: 1 } }, {}, null).enabled, false);
  assert.strictEqual(resolveConfig({ blogger: { sync: '' } }, {}, null).enabled, false);
});

test('resolveConfig: picks up blogger.blog_id', () => {
  const opts = resolveConfig({ blogger: { blog_id: '1234567890' } }, {}, null);
  assert.strictEqual(opts.blogId, '1234567890');
});

test('resolveConfig: picks up blogger.label', () => {
  const opts = resolveConfig({ blogger: { label: 'verses' } }, {}, null);
  assert.strictEqual(opts.label, 'verses');
});

test('resolveConfig: valid removed values are accepted', () => {
  assert.strictEqual(resolveConfig({ blogger: { removed: 'draft' } }, {}, null).removed, 'draft');
  assert.strictEqual(resolveConfig({ blogger: { removed: 'delete' } }, {}, null).removed, 'delete');
  assert.strictEqual(resolveConfig({ blogger: { removed: 'keep' } }, {}, null).removed, 'keep');
});

test('resolveConfig: invalid removed falls back to "draft"', () => {
  assert.strictEqual(resolveConfig({ blogger: { removed: 'archive' } }, {}, null).removed, 'draft');
  assert.strictEqual(resolveConfig({ blogger: { removed: '' } }, {}, null).removed, 'draft');
});

test('resolveConfig: valid content values are accepted', () => {
  assert.strictEqual(resolveConfig({ blogger: { content: 'full' } }, {}, null).content, 'full');
  assert.strictEqual(resolveConfig({ blogger: { content: 'poem' } }, {}, null).content, 'poem');
});

test('resolveConfig: invalid content falls back to "full"', () => {
  assert.strictEqual(resolveConfig({ blogger: { content: 'text' } }, {}, null).content, 'full');
  assert.strictEqual(resolveConfig({ blogger: { content: '' } }, {}, null).content, 'full');
});

test('resolveConfig: hasCredentials true when all three vars present', () => {
  const env = {
    BLOGGER_CLIENT_ID: 'cid',
    BLOGGER_CLIENT_SECRET: 'csec',
    BLOGGER_REFRESH_TOKEN: 'rtoken',
  };
  assert.strictEqual(resolveConfig({}, env, null).hasCredentials, true);
});

test('resolveConfig: hasCredentials false when any var missing', () => {
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_ID: 'x', BLOGGER_CLIENT_SECRET: 'y' }, null).hasCredentials, false);
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_ID: 'x', BLOGGER_REFRESH_TOKEN: 'z' }, null).hasCredentials, false);
  assert.strictEqual(resolveConfig({}, { BLOGGER_CLIENT_SECRET: 'y', BLOGGER_REFRESH_TOKEN: 'z' }, null).hasCredentials, false);
});

test('resolveConfig: hasCredentials true when missing env vars are filled in from the credentials file', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'blogger-credentials.json');
  const opts = resolveConfig({}, { BLOGGER_CLIENT_ID: 'x' }, fixturePath);
  assert.strictEqual(opts.hasCredentials, true);
});

test('resolveConfig: reads credentials from top-level keys in credentials file', () => {
  const tmpPath = path.join(os.tmpdir(), `blogger-creds-toplevel-${process.pid}-${Date.now()}.json`);
  try {
    const credData = {
      client_id: 'toplevel-client-id',
      client_secret: 'toplevel-client-secret',
      refresh_token: 'toplevel-refresh-token',
      note: 'Test credentials'
    };
    fs.writeFileSync(tmpPath, JSON.stringify(credData));
    const opts = resolveConfig({}, {}, tmpPath);
    assert.strictEqual(opts.hasCredentials, true);
    assert.strictEqual(opts.clientId, 'toplevel-client-id');
    assert.strictEqual(opts.clientSecret, 'toplevel-client-secret');
    assert.strictEqual(opts.refreshToken, 'toplevel-refresh-token');
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

test('resolveConfig: reads credentials from nested installed object in credentials file', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'blogger-credentials.json');
  const opts = resolveConfig({}, {}, fixturePath);
  assert.strictEqual(opts.clientId, 'fixture-client-id');
  assert.strictEqual(opts.clientSecret, 'fixture-client-secret');
  assert.strictEqual(opts.refreshToken, 'fixture-refresh-token');
  assert.strictEqual(opts.hasCredentials, true);
});

test('resolveConfig: top-level keys take precedence over nested installed object', () => {
  const tmpPath = path.join(os.tmpdir(), `blogger-creds-both-${process.pid}-${Date.now()}.json`);
  try {
    const credData = {
      client_id: 'toplevel-id',
      client_secret: 'toplevel-secret',
      refresh_token: 'toplevel-token',
      installed: {
        client_id: 'nested-id',
        client_secret: 'nested-secret',
        refresh_token: 'nested-token'
      }
    };
    fs.writeFileSync(tmpPath, JSON.stringify(credData));
    const opts = resolveConfig({}, {}, tmpPath);
    assert.strictEqual(opts.clientId, 'toplevel-id');
    assert.strictEqual(opts.clientSecret, 'toplevel-secret');
    assert.strictEqual(opts.refreshToken, 'toplevel-token');
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

test('resolveConfig: env vars override file credentials independently', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'blogger-credentials.json');
  const opts = resolveConfig({}, { BLOGGER_CLIENT_ID: 'env-id' }, fixturePath);
  assert.strictEqual(opts.clientId, 'env-id');
  assert.strictEqual(opts.clientSecret, 'fixture-client-secret');
  assert.strictEqual(opts.refreshToken, 'fixture-refresh-token');
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

// ── bloggerAcceptableLabels ──────────────────────────────────────────────────

test('bloggerAcceptableLabels: returns labels unchanged when already clean', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(['love', 'grief']), ['love', 'grief']);
});

test('bloggerAcceptableLabels: trims surrounding whitespace', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(['  love  ', 'grief\t']), ['love', 'grief']);
});

test('bloggerAcceptableLabels: drops empty and whitespace-only labels', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(['love', '', '   ', 'grief']), ['love', 'grief']);
});

test('bloggerAcceptableLabels: drops labels containing a comma', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(['love', 'grief, loss', 'hope']), ['love', 'hope']);
});

test('bloggerAcceptableLabels: preserves order', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(['c', 'a', 'b']), ['c', 'a', 'b']);
});

test('bloggerAcceptableLabels: treats missing input as empty array', () => {
  assert.deepStrictEqual(bloggerAcceptableLabels(undefined), []);
  assert.deepStrictEqual(bloggerAcceptableLabels([]), []);
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

test('composePost: defaults to no poem labels when labels is omitted', () => {
  const post = composePost({ title: 'T', bodyHtml: '', isoDate: '2020-06-01', label: 'poem' });
  assert.deepStrictEqual(post.labels, ['poem']);
});

test('composePost: includes poem labels alongside the base label, base label first', () => {
  const post = composePost({
    title: 'T',
    bodyHtml: '',
    isoDate: '2020-06-01',
    label: 'poem',
    labels: ['love', 'grief'],
  });
  assert.deepStrictEqual(post.labels, ['poem', 'love', 'grief']);
});

test('composePost: de-duplicates labels, keeping the first occurrence', () => {
  const post = composePost({
    title: 'T',
    bodyHtml: '',
    isoDate: '2020-06-01',
    label: 'poem',
    labels: ['poem', 'love', 'love'],
  });
  assert.deepStrictEqual(post.labels, ['poem', 'love']);
});

test('composePost: drops comma-containing poem labels', () => {
  const post = composePost({
    title: 'T',
    bodyHtml: '',
    isoDate: '2020-06-01',
    label: 'poem',
    labels: ['love', 'grief, loss'],
  });
  assert.deepStrictEqual(post.labels, ['poem', 'love']);
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

test('postNeedsUpdate: returns true when existing has extra labels beyond desired (full reconcile)', () => {
  // Label sets must match exactly — an extra label on existing (e.g. removed from the poem
  // or added manually in the Blogger UI) triggers an update to bring it back into line.
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem', 'extra'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns false when label sets are equal regardless of order', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['grief', 'poem', 'love'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem', 'love', 'grief'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), false);
});

test('postNeedsUpdate: returns true when a poem label is added', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem', 'love'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
});

test('postNeedsUpdate: returns true when a poem label is removed', () => {
  const existing = { title: 'P', content: '<p>a</p>', labels: ['poem', 'love'] };
  const desired  = { title: 'P', content: '<p>a</p>', labels: ['poem'] };
  assert.strictEqual(postNeedsUpdate(existing, desired), true);
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

const SAMPLE_AUDIO = '<div class="song-link" id="song--my-poem"><div class="song-item song-item--audiomack song-item-embed"><div class="song-embed song-embed--audiomack"><button class="song-embed-btn" id="song-embed-btn--audiomack--my-poem" type="button" data-embed-src="https://audiomack.com/embed/testartist/song/my-poem" data-title="My Poem">🎵 Load Audiomack Player</button><div class="song-embed-player hidden"></div></div></div><div class="song-item song-item--suno song-item-link"><a class="song-link-anchor song-link--suno" href="https://suno.com/s/xyz" target="_blank">recording on Suno</a></div></div>';

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
  assert.ok(!result.includes('song-embed-btn'), 'audiomack embed button should be removed');
  assert.ok(!result.includes('recording on Suno'), 'Suno link text should be removed');
  const hrefs = [...result.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(
    !hrefs.some((href) => new URL(href).hostname === 'suno.com'),
    'Suno link href should be removed'
  );
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

// ── explainBloggerFailure ─────────────────────────────────────────────────────

const BLOG_ID = '7781143180070523245';

test('explainBloggerFailure: 403 with an unrecognised account blames the account', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 403,
    body: 'The caller does not have permission',
    blogId: BLOG_ID,
    access: { recognised: false, blogs: [] },
  });
  assert.match(advice, /cannot manage this blog/);
  // \s+ rather than a literal space: the guidance is hard-wrapped for a terminal.
  assert.match(advice, /wrong Google\s+account/);
  assert.match(advice, /Workspace/);
  assert.match(advice, /npm run blogger:auth/);
});

test('explainBloggerFailure: 403 lists the blogs the account can reach instead', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 403,
    body: '',
    blogId: BLOG_ID,
    access: {
      recognised: true,
      blogs: [{ id: '999', name: 'Other Blog', url: 'https://other.blogspot.com/' }],
    },
  });
  assert.match(advice, new RegExp(`cannot manage blog ${BLOG_ID}`));
  assert.match(advice, /999 {2}Other Blog {2}<https:\/\/other\.blogspot\.com\/>/);
  assert.match(advice, /blogger\.blog_id/);
});

test('explainBloggerFailure: 403 for a blog the account does own suspects author-only rights', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 403,
    body: '',
    blogId: BLOG_ID,
    access: {
      recognised: true,
      blogs: [{ id: BLOG_ID, name: 'Mine', url: 'https://mine.blogspot.com/' }],
    },
  });
  assert.match(advice, /admin rights/);
  assert.match(advice, /Permissions/);
});

test('explainBloggerFailure: 403 with an account that owns nothing blames the account', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 403,
    body: '',
    blogId: BLOG_ID,
    access: { recognised: true, blogs: [] },
  });
  assert.match(advice, /does not administer any blogs/);
});

test('explainBloggerFailure: 403 still advises when access could not be probed', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 403,
    body: '',
    blogId: BLOG_ID,
    access: null,
  });
  assert.match(advice, /not an admin of this/);
  assert.match(advice, /npm run blogger:auth/);
});

test('explainBloggerFailure: every re-mint says to update both credential homes', () => {
  for (const failure of [
    { operation: 'getAccessToken', status: 400, body: '{"error":"invalid_grant"}' },
    { operation: 'listAllPosts', status: 403, body: '', access: { recognised: false, blogs: [] } },
  ]) {
    const advice = explainBloggerFailure({ blogId: BLOG_ID, ...failure });
    assert.match(advice, /\.blogger-credentials\.json/);
    assert.match(advice, /GitHub Actions secrets/);
  }
});

test('explainBloggerFailure: invalid_grant explains the 7-day Testing expiry', () => {
  const advice = explainBloggerFailure({
    operation: 'getAccessToken',
    status: 400,
    body: '{"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
    blogId: BLOG_ID,
  });
  assert.match(advice, /refresh token is no longer valid/);
  assert.match(advice, /"Testing"/);
  assert.match(advice, /7 days/);
});

test('explainBloggerFailure: invalid_client points at the OAuth client', () => {
  const advice = explainBloggerFailure({
    operation: 'getAccessToken',
    status: 401,
    body: '{"error":"invalid_client"}',
    blogId: BLOG_ID,
  });
  assert.match(advice, /BLOGGER_CLIENT_ID/);
  assert.match(advice, /Credentials/);
});

test('explainBloggerFailure: 404 blames blog_id and warns about quoting', () => {
  const advice = explainBloggerFailure({
    operation: 'listAllPosts',
    status: 404,
    body: '',
    blogId: BLOG_ID,
  });
  assert.match(advice, new RegExp(`no blog with ID ${BLOG_ID}`));
  assert.match(advice, /Quote it as a string/);
});

test('explainBloggerFailure: 401 suggests a retry before a re-mint', () => {
  const advice = explainBloggerFailure({
    operation: 'updatePost',
    status: 401,
    body: '',
    blogId: BLOG_ID,
  });
  assert.match(advice, /rejected the access token/);
});

test('explainBloggerFailure: returns null when it has nothing useful to add', () => {
  assert.strictEqual(
    explainBloggerFailure({ operation: 'listAllPosts', status: 500, body: 'boom', blogId: BLOG_ID }),
    null
  );
  assert.strictEqual(
    explainBloggerFailure({ operation: 'getAccessToken', status: 503, body: 'unavailable' }),
    null
  );
});

// ── fetchWithRetry ────────────────────────────────────────────────────────────

async function withMockFetch(mockFetch, run) {
  const original = global.fetch;
  global.fetch = mockFetch;
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

test('fetchWithRetry: passes an AbortSignal with a timeout through to fetch', async () => {
  let capturedInit;
  await withMockFetch(
    async (url, init) => { capturedInit = init; return { status: 200 }; },
    () => fetchWithRetry('https://example.com', { headers: { X: '1' } })
  );
  assert.ok(capturedInit.signal instanceof AbortSignal);
  assert.strictEqual(capturedInit.headers.X, '1');
});

test('fetchWithRetry: returns the response unchanged on a non-retryable status', async () => {
  let calls = 0;
  const response = await withMockFetch(
    async () => { calls++; return { status: 404 }; },
    () => fetchWithRetry('https://example.com')
  );
  assert.strictEqual(response.status, 404);
  assert.strictEqual(calls, 1);
});

test('fetchWithRetry: retries once on a 429 response', async () => {
  let calls = 0;
  const response = await withMockFetch(
    async () => { calls++; return { status: calls === 1 ? 429 : 200 }; },
    () => fetchWithRetry('https://example.com')
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls, 2);
});

test('fetchWithRetry: retries once on a 5xx response', async () => {
  let calls = 0;
  const response = await withMockFetch(
    async () => { calls++; return { status: calls === 1 ? 503 : 200 }; },
    () => fetchWithRetry('https://example.com')
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls, 2);
});

test('fetchWithRetry: retries once on a network-level rejection', async () => {
  let calls = 0;
  const response = await withMockFetch(
    async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return { status: 200 };
    },
    () => fetchWithRetry('https://example.com')
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls, 2);
});

test('fetchWithRetry: propagates rejection when the retry also fails', async () => {
  const calls = { count: 0 };
  await assert.rejects(
    () => withMockFetch(
      async () => { calls.count++; throw new Error('network down'); },
      () => fetchWithRetry('https://example.com')
    ),
    /network down/
  );
  assert.strictEqual(calls.count, 2);
});

'use strict';

/**
 * Tests for sync-blogger.js's pure helpers and its extracted orchestration.
 *
 * Covers: parseArgs, resolveConfig, extractSlug, mapBySlug,
 * bloggerAcceptableLabels, composePost, normalizeHtml, postNeedsUpdate,
 * selectRemoved, extractContent, explainBloggerFailure, fetchWithRetry,
 * createPost, and (integration-style, with global.fetch mocked) syncPoem and
 * processRemovals — the per-poem create/update/skip decision and the
 * removal-pass loop that main() drives.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');

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
  createPost,
  syncPoem,
  processRemovals,
  getAccessToken,
  listAccessibleBlogs,
  listAllPosts,
  diagnoseBloggerFailure,
  BloggerApiError,
  main,
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

// Run `fn`, capturing every console.warn call instead of printing it; restores
// console.warn afterwards even if `fn` throws.
function withCapturedWarnings(fn) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

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
  withCapturedWarnings(() => {
    assert.strictEqual(resolveConfig({ blogger: { removed: 'archive' } }, {}, null).removed, 'draft');
    assert.strictEqual(resolveConfig({ blogger: { removed: '' } }, {}, null).removed, 'draft');
  });
});

test('resolveConfig: valid content values are accepted', () => {
  assert.strictEqual(resolveConfig({ blogger: { content: 'full' } }, {}, null).content, 'full');
  assert.strictEqual(resolveConfig({ blogger: { content: 'poem' } }, {}, null).content, 'poem');
});

test('resolveConfig: invalid content falls back to "full"', () => {
  withCapturedWarnings(() => {
    assert.strictEqual(resolveConfig({ blogger: { content: 'text' } }, {}, null).content, 'full');
    assert.strictEqual(resolveConfig({ blogger: { content: '' } }, {}, null).content, 'full');
  });
});

test('resolveConfig: warns on an invalid blogger.removed value, naming it and the valid options', () => {
  const warnings = withCapturedWarnings(() => {
    resolveConfig({ blogger: { removed: 'archive' } }, {}, null);
  });
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /blogger\.removed/);
  assert.match(warnings[0], /archive/);
  assert.match(warnings[0], /draft, delete, keep/);
});

test('resolveConfig: does not warn when blogger.removed is a valid value or unset', () => {
  assert.deepStrictEqual(withCapturedWarnings(() => resolveConfig({ blogger: { removed: 'delete' } }, {}, null)), []);
  assert.deepStrictEqual(withCapturedWarnings(() => resolveConfig({}, {}, null)), []);
});

test('resolveConfig: warns on an invalid blogger.content value, naming it and the valid options', () => {
  const warnings = withCapturedWarnings(() => {
    resolveConfig({ blogger: { content: 'text' } }, {}, null);
  });
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /blogger\.content/);
  assert.match(warnings[0], /text/);
  assert.match(warnings[0], /full, poem/);
});

test('resolveConfig: does not warn when blogger.content is a valid value or unset', () => {
  assert.deepStrictEqual(withCapturedWarnings(() => resolveConfig({ blogger: { content: 'poem' } }, {}, null)), []);
  assert.deepStrictEqual(withCapturedWarnings(() => resolveConfig({}, {}, null)), []);
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
  let opts;
  withCapturedWarnings(() => { opts = resolveConfig({}, { BLOGGER_CLIENT_ID: 'x' }, fixturePath); });
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
    let opts;
    withCapturedWarnings(() => { opts = resolveConfig({}, {}, tmpPath); });
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
  let opts;
  withCapturedWarnings(() => { opts = resolveConfig({}, {}, fixturePath); });
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
    let opts;
    withCapturedWarnings(() => { opts = resolveConfig({}, {}, tmpPath); });
    assert.strictEqual(opts.clientId, 'toplevel-id');
    assert.strictEqual(opts.clientSecret, 'toplevel-secret');
    assert.strictEqual(opts.refreshToken, 'toplevel-token');
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

test('resolveConfig: env vars override file credentials independently', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'blogger-credentials.json');
  let opts;
  withCapturedWarnings(() => { opts = resolveConfig({}, { BLOGGER_CLIENT_ID: 'env-id' }, fixturePath); });
  assert.strictEqual(opts.clientId, 'env-id');
  assert.strictEqual(opts.clientSecret, 'fixture-client-secret');
  assert.strictEqual(opts.refreshToken, 'fixture-refresh-token');
});

test('resolveConfig: warns when the credentials file is readable/writable beyond its owner',
  { skip: process.platform === 'win32' ? 'POSIX file permission bits only' : false },
  () => {
    const tmpPath = path.join(os.tmpdir(), `blogger-creds-loose-${process.pid}-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmpPath, JSON.stringify({
        client_id: 'x', client_secret: 'y', refresh_token: 'z',
      }));
      fs.chmodSync(tmpPath, 0o644);
      const warnings = withCapturedWarnings(() => resolveConfig({}, {}, tmpPath));
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], new RegExp(tmpPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(warnings[0], /0?644/);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });

test('resolveConfig: does not warn when the credentials file is 0600',
  { skip: process.platform === 'win32' ? 'POSIX file permission bits only' : false },
  () => {
    const tmpPath = path.join(os.tmpdir(), `blogger-creds-strict-${process.pid}-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmpPath, JSON.stringify({
        client_id: 'x', client_secret: 'y', refresh_token: 'z',
      }));
      fs.chmodSync(tmpPath, 0o600);
      const warnings = withCapturedWarnings(() => resolveConfig({}, {}, tmpPath));
      assert.deepStrictEqual(warnings, []);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
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

test('fetchWithRetry: retryable false does not retry a network-level rejection', async () => {
  let calls = 0;
  await assert.rejects(
    () => withMockFetch(
      async () => { calls++; throw new Error('network down'); },
      () => fetchWithRetry('https://example.com', undefined, { retryable: false })
    ),
    /network down/
  );
  assert.strictEqual(calls, 1);
});

test('fetchWithRetry: retryable false does not retry a 5xx response', async () => {
  let calls = 0;
  const response = await withMockFetch(
    async () => { calls++; return { status: 503 }; },
    () => fetchWithRetry('https://example.com', undefined, { retryable: false })
  );
  assert.strictEqual(response.status, 503);
  assert.strictEqual(calls, 1);
});

test('createPost: a rejected create is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    () => withMockFetch(
      async () => { calls++; throw new Error('connection reset'); },
      () => createPost('BLOG1', 'TOKEN1', { title: 'x' })
    ),
    /connection reset/
  );
  assert.strictEqual(calls, 1);
});

function jsonResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// ── getAccessToken ────────────────────────────────────────────────────────────

test('getAccessToken: resolves with the access token on success', async () => {
  let capturedUrl, capturedInit;
  const token = await withMockFetch(
    async (url, init) => { capturedUrl = url; capturedInit = init; return jsonResponse(200, { access_token: 'ACCESS-TOKEN' }); },
    () => getAccessToken({ clientId: 'cid', clientSecret: 'csec', refreshToken: 'rtok' })
  );
  assert.strictEqual(token, 'ACCESS-TOKEN');
  assert.strictEqual(capturedUrl, 'https://oauth2.googleapis.com/token');
  assert.strictEqual(capturedInit.method, 'POST');
  assert.strictEqual(capturedInit.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(capturedInit.body);
  assert.strictEqual(body.get('client_id'), 'cid');
  assert.strictEqual(body.get('client_secret'), 'csec');
  assert.strictEqual(body.get('refresh_token'), 'rtok');
  assert.strictEqual(body.get('grant_type'), 'refresh_token');
});

test('getAccessToken: throws BloggerApiError on a non-2xx response', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(400, { error: 'invalid_grant' }),
      () => getAccessToken({ clientId: 'cid', clientSecret: 'csec', refreshToken: 'rtok' })
    ),
    (err) => {
      assert.ok(err instanceof BloggerApiError);
      assert.strictEqual(err.operation, 'getAccessToken');
      assert.strictEqual(err.status, 400);
      return true;
    }
  );
});

// ── listAccessibleBlogs ───────────────────────────────────────────────────────

test('listAccessibleBlogs: returns recognised=true with mapped blogs on success', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(200, { items: [{ id: 123, name: 'My Blog', url: 'https://my.blogspot.com/' }] }),
    () => listAccessibleBlogs('TOKEN1')
  );
  assert.deepStrictEqual(result, {
    recognised: true,
    blogs: [{ id: '123', name: 'My Blog', url: 'https://my.blogspot.com/' }],
  });
});

test('listAccessibleBlogs: returns recognised=true with no blogs when there are none', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(200, { items: [] }),
    () => listAccessibleBlogs('TOKEN1')
  );
  assert.deepStrictEqual(result, { recognised: true, blogs: [] });
});

test('listAccessibleBlogs: returns recognised=false on a 403', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(403, {}),
    () => listAccessibleBlogs('TOKEN1')
  );
  assert.deepStrictEqual(result, { recognised: false, blogs: [] });
});

test('listAccessibleBlogs: returns recognised=true with no blogs on any other non-ok status', async () => {
  const result = await withMockFetch(
    async () => jsonResponse(500, {}),
    () => listAccessibleBlogs('TOKEN1')
  );
  assert.deepStrictEqual(result, { recognised: true, blogs: [] });
});

test('listAccessibleBlogs: never throws — swallows a network-level rejection', async () => {
  let result;
  await assert.doesNotReject(async () => {
    result = await withMockFetch(
      async () => { throw new TypeError('fetch failed'); },
      () => listAccessibleBlogs('TOKEN1')
    );
  });
  assert.deepStrictEqual(result, { recognised: true, blogs: [] });
});

test('listAccessibleBlogs: sends the token as a Bearer header', async () => {
  let capturedInit;
  await withMockFetch(
    async (url, init) => { capturedInit = init; return jsonResponse(200, { items: [] }); },
    () => listAccessibleBlogs('MY-TOKEN')
  );
  assert.strictEqual(capturedInit.headers.Authorization, 'Bearer MY-TOKEN');
});

// ── listAllPosts ──────────────────────────────────────────────────────────────

test('listAllPosts: fetches with ADMIN view and both live/draft statuses', async () => {
  let capturedUrl;
  await withMockFetch(
    async (url) => { capturedUrl = new URL(url); return jsonResponse(200, { items: [] }); },
    () => listAllPosts('BLOG1', 'TOKEN1')
  );
  assert.strictEqual(capturedUrl.pathname, '/blogger/v3/blogs/BLOG1/posts');
  assert.strictEqual(capturedUrl.searchParams.get('view'), 'ADMIN');
  assert.deepStrictEqual(capturedUrl.searchParams.getAll('status'), ['live', 'draft']);
});

test('listAllPosts: returns a flat array of posts from a single page', async () => {
  const posts = await withMockFetch(
    async () => jsonResponse(200, { items: [{ id: '1' }, { id: '2' }] }),
    () => listAllPosts('BLOG1', 'TOKEN1')
  );
  assert.deepStrictEqual(posts, [{ id: '1' }, { id: '2' }]);
});

test('listAllPosts: returns an empty array when there are no items', async () => {
  const posts = await withMockFetch(
    async () => jsonResponse(200, {}),
    () => listAllPosts('BLOG1', 'TOKEN1')
  );
  assert.deepStrictEqual(posts, []);
});

test('listAllPosts: follows pagination via nextPageToken', async () => {
  let calls = 0;
  const posts = await withMockFetch(
    async (url) => {
      calls++;
      const pageToken = new URL(url).searchParams.get('pageToken');
      if (!pageToken) return jsonResponse(200, { items: [{ id: '1' }], nextPageToken: 'PAGE2' });
      assert.strictEqual(pageToken, 'PAGE2');
      return jsonResponse(200, { items: [{ id: '2' }] });
    },
    () => listAllPosts('BLOG1', 'TOKEN1')
  );
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(posts, [{ id: '1' }, { id: '2' }]);
});

test('listAllPosts: throws BloggerApiError on a non-2xx response', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(500, {}),
      () => listAllPosts('BLOG1', 'TOKEN1')
    ),
    /listAllPosts/
  );
});

// ── diagnoseBloggerFailure ────────────────────────────────────────────────────

test('diagnoseBloggerFailure: returns null for a non-BloggerApiError', async () => {
  const advice = await diagnoseBloggerFailure(new Error('boom'), { blogId: 'B1', token: 'T1' });
  assert.strictEqual(advice, null);
});

test('diagnoseBloggerFailure: does not probe access for a non-403 status', async () => {
  let calls = 0;
  const err = new BloggerApiError('listAllPosts', 500, 'boom');
  const advice = await withMockFetch(
    async () => { calls++; return jsonResponse(200, { items: [] }); },
    () => diagnoseBloggerFailure(err, { blogId: 'B1', token: 'T1' })
  );
  assert.strictEqual(calls, 0, 'listAccessibleBlogs should not be called for a non-403');
  assert.strictEqual(advice, null); // explainBloggerFailure has no advice for a bare 500
});

test('diagnoseBloggerFailure: probes access and folds it into the advice for a 403 with a token', async () => {
  const err = new BloggerApiError('listAllPosts', 403, 'forbidden');
  const advice = await withMockFetch(
    async () => jsonResponse(403, {}),
    () => diagnoseBloggerFailure(err, { blogId: 'B1', token: 'T1' })
  );
  assert.match(advice, /cannot manage this blog/);
});

test('diagnoseBloggerFailure: passes access=null (no probe) for a 403 with no token', async () => {
  let calls = 0;
  const err = new BloggerApiError('listAllPosts', 403, 'forbidden');
  const advice = await withMockFetch(
    async () => { calls++; return jsonResponse(200, { items: [] }); },
    () => diagnoseBloggerFailure(err, { blogId: 'B1' })
  );
  assert.strictEqual(calls, 0, 'listAccessibleBlogs should not be called without a token');
  assert.match(advice, /not an admin of this/);
});

// ── syncPoem / processRemovals (integration: mocked global.fetch) ────────────

async function withCapturedLogsAsync(run) {
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = await run();
    return { result, logs };
  } finally {
    console.log = originalLog;
  }
}

const DESIRED_POST = {
  kind: 'blogger#post',
  title: 'My Poem',
  content: '<p>verse</p>',
  labels: ['poem'],
  published: '2024-03-15T00:00:00Z',
};

test('syncPoem: creates a new post, renames it from its dated title, and returns "created"', async () => {
  const calls = [];
  const outcome = await withMockFetch(
    async (url, init) => {
      calls.push({ url, method: init.method });
      return init.method === 'POST' ? jsonResponse(200, { id: 'new-id' }) : jsonResponse(200, {});
    },
    () => syncPoem({
      existing: undefined,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(outcome, 'created');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].method, 'POST');
  assert.ok(calls[0].url.includes('/blogs/BLOG1/posts/'));
  assert.strictEqual(calls[1].method, 'PUT');
  assert.ok(calls[1].url.includes('/posts/new-id'));
});

test('syncPoem: create in dry-run mode makes no network calls and logs the planned rename', async () => {
  let calls = 0;
  const { result: outcome, logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => syncPoem({
      existing: undefined,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: true,
    })
  ));
  assert.strictEqual(outcome, 'created');
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('[create] "15 My Poem"') && l.includes('rename to "My Poem"')));
});

test('syncPoem: updates an existing post that needs changes and returns "updated"', async () => {
  const calls = [];
  const existing = { id: 'existing-id', title: 'Old', content: '<p>old</p>', labels: ['poem'] };
  const outcome = await withMockFetch(
    async (url, init) => { calls.push({ url, method: init.method }); return jsonResponse(200, {}); },
    () => syncPoem({
      existing,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(outcome, 'updated');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].method, 'PUT');
  assert.ok(calls[0].url.includes('/posts/existing-id'));
});

test('syncPoem: update in dry-run mode makes no network calls and logs the planned update', async () => {
  let calls = 0;
  const existing = { id: 'existing-id', title: 'Old', content: '<p>old</p>', labels: ['poem'] };
  const { result: outcome, logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => syncPoem({
      existing,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: true,
    })
  ));
  assert.strictEqual(outcome, 'updated');
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('[update] My Poem')));
});

test('syncPoem: skips a post that already matches and returns "unchanged"', async () => {
  let calls = 0;
  const existing = {
    title: DESIRED_POST.title,
    content: DESIRED_POST.content,
    labels: DESIRED_POST.labels,
    published: DESIRED_POST.published,
  };
  const outcome = await withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => syncPoem({
      existing,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(outcome, 'unchanged');
  assert.strictEqual(calls, 0);
});

test('syncPoem: skip in dry-run mode makes no network calls and logs the skip', async () => {
  let calls = 0;
  const existing = {
    title: DESIRED_POST.title,
    content: DESIRED_POST.content,
    labels: DESIRED_POST.labels,
    published: DESIRED_POST.published,
  };
  const { result: outcome, logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => syncPoem({
      existing,
      desired: DESIRED_POST,
      isoDate: '2024-03-15',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: true,
    })
  ));
  assert.strictEqual(outcome, 'unchanged');
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('[skip] My Poem')));
});

test('syncPoem: propagates a Blogger API failure on create', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(500, {}),
      () => syncPoem({
        existing: undefined,
        desired: DESIRED_POST,
        isoDate: '2024-03-15',
        blogId: 'BLOG1',
        token: 'TOKEN1',
        dryRun: false,
      })
    ),
    /createPost/
  );
});

test('syncPoem: propagates a Blogger API failure on update', async () => {
  const existing = { id: 'existing-id', title: 'Old', content: '<p>old</p>', labels: ['poem'] };
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(500, {}),
      () => syncPoem({
        existing,
        desired: DESIRED_POST,
        isoDate: '2024-03-15',
        blogId: 'BLOG1',
        token: 'TOKEN1',
        dryRun: false,
      })
    ),
    /updatePost/
  );
});

const REMOVED_POST = {
  id: 'gone-id',
  title: 'Gone',
  content: '<div id="poem--gone">x</div>',
  labels: ['poem'],
  status: 'LIVE',
};

test('processRemovals: drafts a removed post and returns handled=1', async () => {
  const calls = [];
  const handled = await withMockFetch(
    async (url, init) => { calls.push({ url, method: init.method }); return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(),
      label: 'poem',
      removedMode: 'draft',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(handled, 1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].method, 'POST');
  assert.ok(calls[0].url.includes('/posts/gone-id/revert'));
});

test('processRemovals: draft in dry-run mode makes no network calls and logs the plan', async () => {
  let calls = 0;
  const { result: handled, logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(),
      label: 'poem',
      removedMode: 'draft',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: true,
    })
  ));
  assert.strictEqual(handled, 1);
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('[draft] Gone')));
});

test('processRemovals: deletes a removed post when removedMode is "delete"', async () => {
  const calls = [];
  const handled = await withMockFetch(
    async (url, init) => { calls.push({ url, method: init.method }); return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(),
      label: 'poem',
      removedMode: 'delete',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(handled, 1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].method, 'DELETE');
  assert.ok(calls[0].url.includes('/posts/gone-id'));
});

test('processRemovals: delete in dry-run mode makes no network calls and logs the plan', async () => {
  let calls = 0;
  const { result: handled, logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(),
      label: 'poem',
      removedMode: 'delete',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: true,
    })
  ));
  assert.strictEqual(handled, 1);
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('[delete] Gone')));
});

test('processRemovals: "keep" leaves removed posts untouched and makes no network calls', async () => {
  let calls = 0;
  const handled = await withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(),
      label: 'poem',
      removedMode: 'keep',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(handled, 0);
  assert.strictEqual(calls, 0);
});

test('processRemovals: returns handled=0 and makes no calls when nothing is removed', async () => {
  let calls = 0;
  const handled = await withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => processRemovals({
      posts: [REMOVED_POST],
      currentSlugs: new Set(['gone']),
      label: 'poem',
      removedMode: 'draft',
      blogId: 'BLOG1',
      token: 'TOKEN1',
      dryRun: false,
    })
  );
  assert.strictEqual(handled, 0);
  assert.strictEqual(calls, 0);
});

test('processRemovals: propagates a Blogger API failure', async () => {
  await assert.rejects(
    () => withMockFetch(
      async () => jsonResponse(500, {}),
      () => processRemovals({
        posts: [REMOVED_POST],
        currentSlugs: new Set(),
        label: 'poem',
        removedMode: 'draft',
        blogId: 'BLOG1',
        token: 'TOKEN1',
        dryRun: false,
      })
    ),
    /revertPost/
  );
});

// ── main() (integration: mocked global.fetch + temp poem YAML fixtures) ──────

// A throwaway poem-YAML directory, cleaned up when the test ends.
function tmpYamlDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-sync-blogger-yaml-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes a fixture poem YAML file, using js-yaml's dump() rather than a
// hand-written string (see build-all-poems.test.js's writeFixturePoem for why).
function writeFixturePoem(yamlDir, filename, {
  title = 'Test Poem',
  author = 'Test Author',
  date = '2020-05-04',
  labels = ['fixture-label'],
  lines = 'Hello world\n',
} = {}) {
  const content = yaml.dump({
    title, author, date, labels,
    versions: [{ segments: [{ lines }] }],
  });
  fs.writeFileSync(path.join(yamlDir, filename), content, 'utf8');
}

const BASE_CREDENTIALS_ENV = {
  BLOGGER_CLIENT_ID: 'cid',
  BLOGGER_CLIENT_SECRET: 'csec',
  BLOGGER_REFRESH_TOKEN: 'rtok',
};

// Dispatches a mocked fetch across every call main() makes in one run: the
// OAuth token exchange, listAllPosts, createPost (+ its rename via updatePost),
// updatePost, revertPost, and deletePost — routed by URL shape and method,
// mirroring the individual per-function tests above.
function mockBloggerFetch({ posts = [] } = {}) {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method });
    if (url === 'https://oauth2.googleapis.com/token') return jsonResponse(200, { access_token: 'ACCESS-TOKEN' });
    if (url.endsWith('/revert')) return jsonResponse(200, {});
    if (method === 'PUT') return jsonResponse(200, {});
    if (method === 'DELETE') return jsonResponse(200, {});
    if (method === 'POST' && url.endsWith('/posts/')) return jsonResponse(200, { id: 'created-id' });
    return jsonResponse(200, { items: posts }); // listAllPosts (GET)
  };
  return { fetchMock, calls };
}

async function withCapturedErrorsAsync(run) {
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const result = await run();
    return { result, errors };
  } finally {
    console.error = originalError;
  }
}

test('main: sync disabled logs a message and makes no network calls', async () => {
  let calls = 0;
  const { logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => main({ config: {}, env: {}, credentialsPath: null })
  ));
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('Blogger sync disabled')));
});

test('main: missing blog_id logs a message and makes no network calls', async () => {
  let calls = 0;
  const { logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => main({ config: { blogger: { sync: true } }, env: {}, credentialsPath: null })
  ));
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l => l.includes('blogger.blog_id is required')));
});

test('main: missing credentials logs which env vars are missing', async () => {
  let calls = 0;
  const { logs } = await withCapturedLogsAsync(() => withMockFetch(
    async () => { calls++; return jsonResponse(200, {}); },
    () => main({ config: { blogger: { sync: true, blog_id: 'BLOG1' } }, env: {}, credentialsPath: null })
  ));
  assert.strictEqual(calls, 0);
  assert.ok(logs.some(l =>
    l.includes('BLOGGER_CLIENT_ID') && l.includes('BLOGGER_CLIENT_SECRET') && l.includes('BLOGGER_REFRESH_TOKEN')
  ));
});

test('main: full sync creates a new poem and drafts a removed post', async (t) => {
  const yamlDir = tmpYamlDir(t);
  writeFixturePoem(yamlDir, 'test-poem.yaml');
  const { fetchMock, calls } = mockBloggerFetch({ posts: [REMOVED_POST] });
  const { logs } = await withCapturedLogsAsync(() => withMockFetch(
    fetchMock,
    () => main({
      yamlDir,
      config: { blogger: { sync: true, blog_id: 'BLOG1' } },
      env: BASE_CREDENTIALS_ENV,
      credentialsPath: null,
    })
  ));
  assert.ok(calls.some(c => c.url === 'https://oauth2.googleapis.com/token'), 'expected a token exchange');
  assert.ok(calls.some(c => c.method === 'POST' && c.url.endsWith('/posts/')), 'expected a createPost call');
  assert.ok(calls.some(c => c.url.endsWith('/revert')), 'expected a revertPost call for the removed post');
  assert.ok(logs.some(l => l.includes('Blogger sync: 1 created, 0 updated, 0 unchanged, 1 drafted.')));
});

test('main: --only skips the removal pass', async (t) => {
  const yamlDir = tmpYamlDir(t);
  writeFixturePoem(yamlDir, 'test-poem.yaml');
  const { fetchMock, calls } = mockBloggerFetch({ posts: [REMOVED_POST] });
  const { logs } = await withCapturedLogsAsync(() => withMockFetch(
    fetchMock,
    () => main({
      argv: ['--only', 'test-poem'],
      yamlDir,
      config: { blogger: { sync: true, blog_id: 'BLOG1' } },
      env: BASE_CREDENTIALS_ENV,
      credentialsPath: null,
    })
  ));
  assert.ok(!calls.some(c => c.url.endsWith('/revert')), 'removal pass should be skipped with --only');
  assert.ok(logs.some(l => l.includes('Skipping removal pass (--only test-poem)')));
});

test('main: a Blogger API failure is caught, diagnosed, and sets process.exitCode', async (t) => {
  t.after(() => { process.exitCode = 0; });
  const failingFetch = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') return jsonResponse(200, { access_token: 'ACCESS-TOKEN' });
    return jsonResponse(403, 'forbidden');
  };
  const { errors } = await withCapturedErrorsAsync(() => withMockFetch(
    failingFetch,
    () => main({
      yamlDir: tmpYamlDir(t),
      config: { blogger: { sync: true, blog_id: 'BLOG1' } },
      env: BASE_CREDENTIALS_ENV,
      credentialsPath: null,
    })
  ));
  assert.strictEqual(process.exitCode, 1);
  assert.ok(errors.some(l => l.includes('Blogger sync error')));
  assert.ok(errors.some(l => l.includes('cannot manage this blog')));
});

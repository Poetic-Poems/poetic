#!/usr/bin/env node
/**
 * Stateless Blogger publisher.
 *
 * Syncs poem YAML files to a Blogger blog via the Blogger API v3.
 * Pure helpers are exported for unit testing; main() runs only when invoked directly.
 *
 * Exports (pure, no network/fs):
 *   parseArgs(argv)                                  - parse CLI flags
 *   extractSlug(post)                                - recover a poem's slug from post content
 *   mapBySlug(posts)                                 - Map<slug, post>
 *   bloggerAcceptableLabels(labels)                  - filter poem labels to Blogger-acceptable ones
 *   composePost({ title, bodyHtml, isoDate, label, labels }) - build Blogger post body
 *   normalizeHtml(s)                                 - collapse whitespace for comparison
 *   postNeedsUpdate(existingPost, desiredPost)       - check if a post needs updating
 *   selectRemoved(posts, currentSlugs, label)        - posts to draft/delete
 *   extractContent(fragmentHtml, mode)               - strip audio/analysis for 'poem' mode
 *
 * Config resolution (reads the credentials file from disk; no network):
 *   resolveConfig(config, env, credentialsPath)      - apply defaults + validate + resolve credentials
 *
 * Network (require an access token):
 *   getAccessToken(credentials)
 *   listAllPosts(blogId, token)
 *   createPost(blogId, token, post)
 *   updatePost(blogId, token, postId, post)
 *   revertPost(blogId, token, postId)
 *   deletePost(blogId, token, postId)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readPoeticConfig } = require('./poetic-config');
const { readPoemFile, loadPoemData, renderFragment, listPoemYamlFiles } = require('./poem-render');
const { REPO_ROOT } = require('./repo-root');

const YAML_DIR = path.join(REPO_ROOT, 'src', 'poems', 'yaml');
const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ dryRun: boolean, only: string|null }}
 */
function parseArgs(argv) {
  let dryRun = false;
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--only' && argv[i + 1]) {
      only = argv[i + 1];
      i++;
    }
  }
  return { dryRun, only };
}

/**
 * Resolve and validate Blogger config, applying defaults.
 *
 * @param {object} config - raw .poetic-config.yaml object
 * @param {object} env    - environment variables (e.g. process.env)
 * @param {string|null} [credentialsPath] - path to the credentials JSON file,
 *   read as a fallback for any env var that is absent. Defaults to
 *   `.blogger-credentials.json` resolved against the process's CWD; pass
 *   `null` to disable the file fallback entirely (e.g. for hermetic tests
 *   that must not pick up a real credentials file left on disk).
 *
 *   The file may use either the top-level-keys shape written by
 *   blogger-auth.js (`{ client_id, client_secret, refresh_token }`) or the
 *   nested Google client-secrets shape (`{ installed: { client_id, ... } }`).
 *   Top-level keys win if both are present.
 * @returns {{ enabled: boolean, blogId: string|undefined, label: string, removed: string, content: string, hasCredentials: boolean, clientId: string|undefined, clientSecret: string|undefined, refreshToken: string|undefined }}
 */
function resolveConfig(config, env, credentialsPath = path.resolve('.blogger-credentials.json')) {
  const blogger = config.blogger || {};
  const enabled = blogger.sync === true;
  const blogId = blogger.blog_id != null ? String(blogger.blog_id) : undefined;

  const VALID_REMOVED = ['draft', 'delete', 'keep'];
  if (blogger.removed != null && !VALID_REMOVED.includes(blogger.removed)) {
    console.warn(
      `Warning: blogger.removed was "${blogger.removed}", which is not one of ` +
      `${VALID_REMOVED.join(', ')}. Falling back to the default "draft".`
    );
  }
  const removed = VALID_REMOVED.includes(blogger.removed)
    ? blogger.removed
    : 'draft';

  const VALID_CONTENT = ['full', 'poem'];
  if (blogger.content != null && !VALID_CONTENT.includes(blogger.content)) {
    console.warn(
      `Warning: blogger.content was "${blogger.content}", which is not one of ` +
      `${VALID_CONTENT.join(', ')}. Falling back to the default "full".`
    );
  }
  const content = VALID_CONTENT.includes(blogger.content)
    ? blogger.content
    : 'full';

  const label = blogger.label || 'poem';

  // Load fallback values from the credentials file if any env var is absent.
  let fileCredentials = {};
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    const mode = fs.statSync(credentialsPath).mode & 0o777;
    if (mode & 0o077) {
      console.warn(
        `Warning: ${credentialsPath} is readable/writable by group or other ` +
        `(mode ${mode.toString(8)}). It should be 0600 (owner read/write only) — ` +
        `run: chmod 600 ${credentialsPath}`
      );
    }
    try {
      const raw = fs.readFileSync(credentialsPath, 'utf8');
      const parsed = JSON.parse(raw) || {};
      const nested = parsed.installed || {};
      fileCredentials = {
        client_id: parsed.client_id ?? nested.client_id,
        client_secret: parsed.client_secret ?? nested.client_secret,
        refresh_token: parsed.refresh_token ?? nested.refresh_token,
      };
    } catch {
      // File exists but is unreadable or malformed; proceed without it.
    }
  }

  const clientId     = env.BLOGGER_CLIENT_ID     || fileCredentials.client_id;
  const clientSecret = env.BLOGGER_CLIENT_SECRET || fileCredentials.client_secret;
  const refreshToken = env.BLOGGER_REFRESH_TOKEN || fileCredentials.refresh_token;

  const hasCredentials = !!(clientId && clientSecret && refreshToken);

  return { enabled, blogId, label, removed, content, hasCredentials, clientId, clientSecret, refreshToken };
}

/**
 * Extract a poem's slug from a Blogger post, via the `id="poem--<slug>"`
 * marker embedded in the post content by the poem template.
 *
 * @param {object} post
 * @returns {string|null} the slug, or null if no marker is present
 */
function extractSlug(post) {
  const match = /id="poem--([^"]+)"/.exec(post.content || '');
  return match ? match[1] : null;
}

/**
 * Build a Map from poem slug to post object.
 *
 * Posts with no extractable slug marker (legacy/unmanaged posts) are skipped.
 *
 * @param {object[]} posts
 * @returns {Map<string, object>}
 */
function mapBySlug(posts) {
  const map = new Map();
  for (const post of posts) {
    const slug = extractSlug(post);
    if (slug === null) continue;
    map.set(slug, post);
  }
  return map;
}

/**
 * Filter poem labels down to those acceptable to Blogger.
 *
 * Trims each label, drops empty strings, and drops any label containing a
 * comma (Blogger uses comma as its label separator). Preserves order.
 *
 * @param {string[]} labels
 * @returns {string[]}
 */
function bloggerAcceptableLabels(labels) {
  return (labels || [])
    .map(label => label.trim())
    .filter(label => label !== '' && !label.includes(','));
}

/**
 * Compose a Blogger post body object.
 *
 * The post's labels are a de-duplicated array of the base label followed by
 * the poem's own Blogger-acceptable labels (base label first; dedupe keeps
 * the first occurrence). This is the full set the post should carry — the
 * sync fully reconciles existing posts to match it.
 *
 * @param {{ title: string, bodyHtml: string, isoDate: string, label: string, labels?: string[] }} opts
 * @returns {{ kind: string, title: string, content: string, labels: string[], published: string }}
 */
function composePost({ title, bodyHtml, isoDate, label, labels = [] }) {
  const allLabels = [label, ...bloggerAcceptableLabels(labels)];
  return {
    kind: 'blogger#post',
    title,
    content: bodyHtml,
    labels: [...new Set(allLabels)],
    published: `${isoDate}T00:00:00Z`,
  };
}

/**
 * Collapse runs of whitespace to single spaces and trim.
 * Used for tolerant comparison of HTML content.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeHtml(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Determine if an existing Blogger post needs to be updated.
 *
 * Labels are compared for set-equality (order-independent) — this is a full
 * reconcile, so a poem label added or removed on either side triggers an
 * update, not just labels missing from the existing post.
 *
 * `published` is compared by instant (not string), since Blogger may echo
 * back a timestamp in a different timezone offset than the one we sent.
 *
 * @param {object} existingPost - current post from the API
 * @param {object} desiredPost  - post as we want it to be
 * @returns {boolean}
 */
function postNeedsUpdate(existingPost, desiredPost) {
  if (existingPost.title !== desiredPost.title) return true;
  if (normalizeHtml(existingPost.content || '') !== normalizeHtml(desiredPost.content || '')) return true;
  const existingLabels = [...(existingPost.labels || [])].sort();
  const desiredLabels = [...(desiredPost.labels || [])].sort();
  if (existingLabels.length !== desiredLabels.length ||
      existingLabels.some((label, i) => label !== desiredLabels[i])) {
    return true;
  }
  if (existingPost.published !== undefined && desiredPost.published !== undefined) {
    const existingInstant = new Date(existingPost.published).getTime();
    const desiredInstant = new Date(desiredPost.published).getTime();
    if (existingInstant !== desiredInstant) return true;
  }
  return false;
}

/**
 * Find posts that are LIVE, carry the given label, but whose slug (recovered
 * from the `id="poem--<slug>"` content marker) is no longer in the current
 * set of poem slugs (i.e. removed from the collection).
 *
 * A labelled LIVE post with no extractable slug marker is legacy/unmanaged —
 * it is left alone (not reported as removed) rather than risk draft/deleting
 * something hand-made or created before the marker existed.
 *
 * @param {object[]} posts          - all posts fetched from Blogger
 * @param {Set<string>} currentSlugs - slugs of current poems
 * @param {string} label            - the label that marks managed posts
 * @returns {object[]}
 */
function selectRemoved(posts, currentSlugs, label) {
  return posts.filter(post => {
    if ((post.status || '').toUpperCase() !== 'LIVE') return false;
    const labels = post.labels || [];
    if (!labels.includes(label)) return false;
    const slug = extractSlug(post);
    if (slug === null) {
      console.warn(`Blogger sync: labelled post "${post.title}" has no poem--<slug> marker; treating as legacy/unmanaged and skipping.`);
      return false;
    }
    return !currentSlugs.has(slug);
  });
}

/**
 * Extract content from a rendered HTML fragment.
 *
 * For mode 'full', returns the HTML unchanged.
 * For mode 'poem', removes:
 *   - the audio block: <div class="song-link" id="song--…">…</div>
 *   - the show-analysis button: <button class="analysis …" id="show-analysis--…">…</button>
 *   - the analysis div: <div class="analysis" id="analysis--…">…</div>
 * Best-effort; never throws.
 *
 * @param {string} fragmentHtml
 * @param {string} mode - 'full' | 'poem'
 * @returns {string}
 */
/**
 * Remove every `<div …>…</div>` block whose opening tag matches `startRegex`,
 * balancing nested <div>s so the entire block (and only that block) is stripped.
 * Non-div tags inside (buttons, anchors) do not affect the balance.
 *
 * @param {string} html
 * @param {RegExp} startRegex - matches the block's opening <div …> tag
 * @returns {string}
 */
function removeBalancedDivBlock(html, startRegex) {
  const openRe = new RegExp(startRegex.source, startRegex.flags.replace('g', ''));
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  let result = html;
  while (true) {
    const m = openRe.exec(result);
    if (!m) break;
    const start = m.index;
    let depth = 0;
    let end = -1;
    tagRe.lastIndex = start;
    let t;
    while ((t = tagRe.exec(result)) !== null) {
      depth += t[1] === '/' ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end === -1) break; // unbalanced; leave the rest untouched
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

function extractContent(fragmentHtml, mode) {
  if (mode !== 'poem') return fragmentHtml;
  try {
    let html = fragmentHtml;
    // Remove the whole audio block (<div class="song-link" id="song--…">…</div>),
    // balancing nested <div>s so every song-item / link / player inside is stripped.
    html = removeBalancedDivBlock(html, /<div class="song-link" id="song--[^"]*">/);
    // Remove show-analysis button: <button class="analysis …" id="show-analysis--…">…</button>
    html = html.replace(/<button class="analysis[^"]*" id="show-analysis--[^"]*"[^>]*>[\s\S]*?<\/button>/g, '');
    // Remove analysis div: <div class="analysis" id="analysis--…">…</div>
    // This div contains nested divs and buttons, so we need a broader match
    html = html.replace(/<div class="analysis" id="analysis--[^"]*">[\s\S]*<\/div><\/div><\/div>/, '');
    return html;
  } catch (_) {
    // Best-effort: return original on any failure
    return fragmentHtml;
  }
}

// ── Network helpers ───────────────────────────────────────────────────────────

/**
 * A non-2xx response from the Blogger or Google OAuth API.
 *
 * Carries the operation and status as fields so `explainBloggerFailure` can
 * turn them into advice, rather than having to re-parse the message text.
 */
class BloggerApiError extends Error {
  constructor(operation, status, body) {
    super(`${operation}: HTTP ${status} — ${body}`);
    this.name = 'BloggerApiError';
    this.operation = operation;
    this.status = status;
    this.body = body;
  }
}

/**
 * Throw a descriptive error for a non-2xx API response.
 *
 * @param {Response} response
 * @param {string} context
 */
async function assertOk(response, context) {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new BloggerApiError(context, response.status, text);
  }
}

/**
 * fetch() with a single retry after a short delay if the response is 429 or 5xx.
 *
 * @param {string} url
 * @param {object} [init] - fetch init options
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, init) {
  const response = await fetch(url, init);
  if (response.status !== 429 && response.status < 500) return response;
  await new Promise(resolve => setTimeout(resolve, 500));
  return fetch(url, init);
}

/**
 * Obtain a fresh access token using a stored refresh token.
 *
 * @param {{ clientId: string, clientSecret: string, refreshToken: string }} credentials
 * @returns {Promise<string>} access_token
 */
async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetchWithRetry(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  await assertOk(response, 'getAccessToken');
  const data = await response.json();
  return data.access_token;
}

/**
 * Ask Blogger which blogs the authorised account may administer.
 *
 * Used only to explain a failure, so it never throws: a diagnosis that itself
 * blows up would replace the real error with a worse one.
 *
 * A 403 here is meaningful rather than incidental. `users/self/blogs` asks
 * nothing about a specific blog — only "who am I and what do I own" — so a
 * refusal means Blogger does not recognise the account behind the token as a
 * Blogger user at all, which is what a Google account with Blogger disabled
 * (the default for Workspace domains) looks like from here.
 *
 * @param {string} token - OAuth2 access token
 * @returns {Promise<{ recognised: boolean, blogs: Array<{id: string, name: string, url: string}> }>}
 */
async function listAccessibleBlogs(token) {
  try {
    const response = await fetch(`${BLOGGER_API}/users/self/blogs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 403) return { recognised: false, blogs: [] };
    if (!response.ok) return { recognised: true, blogs: [] };
    const data = await response.json();
    const blogs = (data.items || []).map(b => ({ id: String(b.id), name: b.name, url: b.url }));
    return { recognised: true, blogs };
  } catch {
    return { recognised: true, blogs: [] };
  }
}

/**
 * Fetch all posts from a blog, following pagination.
 *
 * @param {string} blogId
 * @param {string} token  - OAuth2 access token
 * @returns {Promise<object[]>} flat array of posts
 */
async function listAllPosts(blogId, token) {
  const posts = [];
  let pageToken = null;
  do {
    const url = new URL(`${BLOGGER_API}/blogs/${blogId}/posts`);
    url.searchParams.set('maxResults', '500');
    url.searchParams.set('fetchBodies', 'true');
    url.searchParams.set('fetchImages', 'false');
    // view=ADMIN is required (as the blog owner) for the API to return draft
    // posts and to populate each post's `status` field, which selectRemoved needs.
    url.searchParams.set('view', 'ADMIN');
    url.searchParams.append('status', 'live');
    url.searchParams.append('status', 'draft');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await assertOk(response, 'listAllPosts');
    const data = await response.json();
    if (data.items) posts.push(...data.items);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return posts;
}

/**
 * Create a new post on Blogger.
 *
 * @param {string} blogId
 * @param {string} token
 * @param {object} post
 * @returns {Promise<object>}
 */
async function createPost(blogId, token, post) {
  const response = await fetchWithRetry(`${BLOGGER_API}/blogs/${blogId}/posts/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(post),
  });
  await assertOk(response, 'createPost');
  return response.json();
}

/**
 * Update an existing post on Blogger.
 *
 * @param {string} blogId
 * @param {string} token
 * @param {string} postId
 * @param {object} post
 * @returns {Promise<object>}
 */
async function updatePost(blogId, token, postId, post) {
  const response = await fetchWithRetry(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(post),
  });
  await assertOk(response, 'updatePost');
  return response.json();
}

/**
 * Revert a post to draft status.
 *
 * @param {string} blogId
 * @param {string} token
 * @param {string} postId
 * @returns {Promise<object>}
 */
async function revertPost(blogId, token, postId) {
  const response = await fetchWithRetry(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}/revert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(response, 'revertPost');
  return response.json();
}

/**
 * Delete a post from Blogger.
 *
 * @param {string} blogId
 * @param {string} token
 * @param {string} postId
 * @returns {Promise<void>}
 */
async function deletePost(blogId, token, postId) {
  const response = await fetchWithRetry(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(response, 'deletePost');
}

// ── Failure diagnosis ─────────────────────────────────────────────────────────

// Both places the credentials live. Updating one and not the other is the
// commonest way for local runs and the workflow to disagree, so every piece of
// advice that ends in "re-mint" has to name both.
const CREDENTIAL_HOMES =
  'Then update the credentials in BOTH places that hold them:\n' +
  '  - .blogger-credentials.json  (local runs)\n' +
  '  - the BLOGGER_CLIENT_ID / BLOGGER_CLIENT_SECRET / BLOGGER_REFRESH_TOKEN\n' +
  '    GitHub Actions secrets  (the Sync to Blogger workflow)\n' +
  'Updating only one leaves the other failing exactly as it does now.';

const SEE_DOCS = 'Full troubleshooting: docs/BLOGGER.md → Troubleshooting.';

/**
 * Turn a Blogger API failure into advice a publisher can act on.
 *
 * Google's own errors are accurate but anonymous: a 403 says "The caller does
 * not have permission" without saying which caller, which permission, or what
 * to do about it. Every failure below has one likely cause and one concrete
 * fix, and saying so here is the difference between a two-minute correction
 * and an afternoon of guesswork.
 *
 * Pure: `access` is passed in rather than fetched, so this stays testable.
 *
 * @param {object}      failure
 * @param {string}      failure.operation - the function that failed, e.g. 'listAllPosts'
 * @param {number}      failure.status    - HTTP status
 * @param {string}      [failure.body]    - raw response body
 * @param {string}      [failure.blogId]  - configured blogger.blog_id
 * @param {?{ recognised: boolean, blogs: Array<{id: string, name: string, url: string}> }} [failure.access]
 *   - result of listAccessibleBlogs(), or null if it could not be determined
 * @returns {?string} advice to print beneath the raw error, or null if we have none
 */
function explainBloggerFailure({ operation, status, body = '', blogId, access = null }) {
  if (operation === 'getAccessToken') {
    if (body.includes('invalid_grant')) {
      return [
        'The stored refresh token is no longer valid. The token itself is the',
        'problem — the blog and the config are fine.',
        '',
        'Most likely one of:',
        '  - The OAuth consent screen is still in "Testing" status, which expires',
        '    every refresh token after 7 days. Publishing the app stops that.',
        '  - The token was revoked, or a later mint superseded it (minting a new',
        '    token invalidates the previous one for the same client).',
        '  - The client ID/secret are from a different OAuth client than the one',
        '    that issued the token. All three values must come from one mint.',
        '',
        'To fix, re-mint it:  npm run blogger:auth',
        CREDENTIAL_HOMES,
        '',
        SEE_DOCS,
      ].join('\n');
    }
    if (body.includes('invalid_client')) {
      return [
        'Google rejected the client ID/secret pair. Check BLOGGER_CLIENT_ID and',
        'BLOGGER_CLIENT_SECRET against the OAuth client in the Google Cloud',
        'Console (APIs & Services → Credentials), and note that a deleted client',
        'fails this way too.',
        '',
        SEE_DOCS,
      ].join('\n');
    }
    return null;
  }

  if (status === 403) {
    const lines = [];
    if (access && !access.recognised) {
      lines.push(
        'The Google account you authorised cannot manage this blog.',
        '',
        'Blogger accepted the token, so the credentials and the scope are fine.',
        'But it refused a request that depends on who you are, and it does not',
        'recognise the account as a Blogger user at all.',
        '',
        'The usual cause is completing the consent screen as the wrong Google',
        'account — easy to do, since the browser offers whichever account it is',
        'already signed in to.',
        '',
        'A Google Workspace account (you@your-company.com) also fails exactly',
        'this way: Workspace domains have Blogger switched off by default, and an',
        'account without Blogger is refused even when it has been added as an',
        'author on the blog. Either turn Blogger on for the domain in the Admin',
        'console, or authorise as the personal account that owns the blog.'
      );
    } else if (access && access.blogs.length === 0) {
      lines.push(
        'The Google account you authorised does not administer any blogs, so it',
        'is not the account that owns this one. You most likely completed the',
        'consent screen as the wrong Google account.'
      );
    } else if (access && !access.blogs.some(b => b.id === String(blogId))) {
      lines.push(
        `The Google account you authorised cannot manage blog ${blogId}.`,
        '',
        'It administers these blogs instead:',
        ...access.blogs.map(b => `  ${b.id}  ${b.name}  <${b.url}>`),
        '',
        'So either blogger.blog_id in .poetic-config.yaml points at the wrong',
        'blog — set it to one of the IDs above — or you authorised as the wrong',
        'Google account.'
      );
    } else if (access) {
      lines.push(
        `The authorised account lists blog ${blogId} among its blogs, yet Blogger`,
        'refused this operation. Author-level access is the likely reason: the',
        'sync needs admin rights to read drafts and to publish. Check the account',
        "under the blog's Settings → Permissions in the Blogger dashboard."
      );
    } else {
      lines.push(
        'Blogger refused an operation that depends on which account authorised',
        'the sync. The usual cause is that the account is not an admin of this',
        'blog — often because the consent screen was completed as the wrong',
        'Google account.'
      );
    }
    lines.push(
      '',
      'To fix, check which account sees the blog at https://www.blogger.com/,',
      'then re-mint as that account:  npm run blogger:auth',
      '(the helper shows an account chooser and then lists what that account can',
      'reach, so you can confirm before you save anything)',
      CREDENTIAL_HOMES,
      '',
      SEE_DOCS
    );
    return lines.join('\n');
  }

  if (status === 404) {
    return [
      `Blogger has no blog with ID ${blogId} (blogger.blog_id in`,
      '.poetic-config.yaml).',
      '',
      'The ID is the number in the Blogger dashboard URL:',
      '  https://www.blogger.com/blog/posts/BLOG_ID',
      '',
      'Quote it as a string in YAML. Unquoted it is parsed as a number, exceeds',
      "JavaScript's safe integer range, and silently loses precision.",
      '',
      SEE_DOCS,
    ].join('\n');
  }

  if (status === 401) {
    return [
      'Blogger rejected the access token. It may have expired mid-run, or the',
      'authorisation was revoked while the sync was in flight. Re-running the',
      'sync mints a fresh token; if it fails again, re-mint the refresh token:',
      '  npm run blogger:auth',
      '',
      SEE_DOCS,
    ].join('\n');
  }

  return null;
}

/**
 * Explain a failure, probing Blogger for the account's access when that would
 * sharpen the diagnosis (a 403 is about identity, so knowing which blogs the
 * account can reach turns "no permission" into "wrong account").
 *
 * @param {Error}   err
 * @param {object}  context
 * @param {string}  [context.blogId]
 * @param {string}  [context.token] - access token, if one was obtained
 * @returns {Promise<?string>}
 */
async function diagnoseBloggerFailure(err, { blogId, token } = {}) {
  if (!(err instanceof BloggerApiError)) return null;
  const access = err.status === 403 && token ? await listAccessibleBlogs(token) : null;
  return explainBloggerFailure({
    operation: err.operation,
    status: err.status,
    body: err.body,
    blogId,
    access,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Main entry point: sync poems to Blogger.
 */
async function main() {
  // Declared out here so the catch can hand them to the diagnosis.
  let opts = null;
  let token = null;
  try {
    const args = parseArgs(process.argv.slice(2));
    const rawConfig = readPoeticConfig(REPO_ROOT);
    opts = resolveConfig(rawConfig, process.env);

    if (!opts.enabled) {
      console.log('Blogger sync disabled (set blogger: { sync: true } in .poetic-config.yaml).');
      return;
    }

    if (!opts.blogId) {
      console.log('Blogger sync: blogger.blog_id is required in .poetic-config.yaml.');
      return;
    }

    if (!opts.hasCredentials) {
      const missing = [];
      if (!opts.clientId) missing.push('BLOGGER_CLIENT_ID');
      if (!opts.clientSecret) missing.push('BLOGGER_CLIENT_SECRET');
      if (!opts.refreshToken) missing.push('BLOGGER_REFRESH_TOKEN');
      console.log(
        `Blogger sync: missing environment variable(s): ${missing.join(', ')} ` +
        '(also checked .blogger-credentials.json).'
      );
      return;
    }

    token = await getAccessToken(opts);
    const posts = await listAllPosts(opts.blogId, token);
    const bySlug = mapBySlug(posts);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let handled = 0; // drafted or deleted

    const currentSlugs = new Set();

    // Read all poem YAML files (see poem-render.js's listPoemYamlFiles for the filter rules)
    const yamlFiles = listPoemYamlFiles(YAML_DIR).map(f => path.join(YAML_DIR, f));

    for (const yamlPath of yamlFiles) {
      // Read raw file for ISO date (before loadPoemData mutates it)
      const raw = readPoemFile(yamlPath);
      if (!raw) continue;

      let isoDate;
      if (raw.date instanceof Date) {
        isoDate = raw.date.toISOString().slice(0, 10);
      } else {
        isoDate = String(raw.date || '');
      }

      const data = loadPoemData(yamlPath);
      if (!data) continue;

      if (args.only && data.slug !== args.only) continue;

      const bodyHtml = extractContent(
        renderFragment(data, { config: rawConfig }),
        opts.content
      );

      const desired = composePost({
        title: data.title,
        bodyHtml,
        isoDate,
        label: opts.label,
        labels: data.labels || [],
      });

      currentSlugs.add(data.slug);

      const existing = bySlug.get(data.slug);

      if (!existing) {
        // Blogger derives a new post's permalink from its title + publish date,
        // and that permalink is sticky. Prepend the zero-padded day to the title
        // just for creation (so the permalink bakes in the date), then rename
        // the post back to its plain title immediately afterwards.
        const day = isoDate.slice(8, 10);
        const datedTitle = `${day} ${desired.title}`;
        if (args.dryRun) {
          console.log(`[create] "${datedTitle}" → rename to "${desired.title}"`);
        } else {
          const createdPost = await createPost(opts.blogId, token, { ...desired, title: datedTitle });
          await updatePost(opts.blogId, token, createdPost.id, {
            kind: desired.kind,
            title: desired.title,
            content: desired.content,
            labels: desired.labels,
            published: desired.published,
          });
          console.log(`Created: ${desired.title}`);
        }
        created++;
      } else if (postNeedsUpdate(existing, desired)) {
        const updateBody = {
          kind: desired.kind,
          title: desired.title,
          content: desired.content,
          labels: desired.labels,
          published: desired.published,
        };
        if (args.dryRun) {
          console.log(`[update] ${data.title}`);
        } else {
          await updatePost(opts.blogId, token, existing.id, updateBody);
          console.log(`Updated: ${data.title}`);
        }
        updated++;
      } else {
        if (args.dryRun) {
          console.log(`[skip] ${data.title}`);
        }
        unchanged++;
      }
    }

    // Handle removed poems — only on a full sync. With --only, the loop above
    // skipped every other poem, so currentSlugs holds just the targeted slug and
    // every other managed post would look "removed". Removals cannot be computed
    // from a filtered run, so skip the pass entirely when --only is set.
    if (args.only) {
      console.log(`Skipping removal pass (--only ${args.only}): removals are only computed on a full sync.`);
    } else {
      const removed = selectRemoved(posts, currentSlugs, opts.label);
      for (const post of removed) {
        if (opts.removed === 'draft') {
          if (args.dryRun) {
            console.log(`[draft] ${post.title}`);
          } else {
            await revertPost(opts.blogId, token, post.id);
            console.log(`Drafted: ${post.title}`);
          }
          handled++;
        } else if (opts.removed === 'delete') {
          if (args.dryRun) {
            console.log(`[delete] ${post.title}`);
          } else {
            await deletePost(opts.blogId, token, post.id);
            console.log(`Deleted: ${post.title}`);
          }
          handled++;
        }
        // 'keep' → do nothing
      }
    }

    const dryRunSuffix = args.dryRun ? ' (dry-run)' : '';
    const removedLabel = opts.removed === 'delete' ? 'deleted' : 'drafted';
    console.log(
      `Blogger sync: ${created} created, ${updated} updated, ${unchanged} unchanged, ${handled} ${removedLabel}${dryRunSuffix}.`
    );
  } catch (err) {
    console.error(`Blogger sync error: ${err.message}`);
    const advice = await diagnoseBloggerFailure(err, {
      blogId: opts && opts.blogId,
      token,
    });
    if (advice) console.error(`\n${advice}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  // Pure helpers
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
  // Network helpers (exported for advanced use / mocking)
  BloggerApiError,
  diagnoseBloggerFailure,
  listAccessibleBlogs,
  getAccessToken,
  listAllPosts,
  createPost,
  updatePost,
  revertPost,
  deletePost,
};

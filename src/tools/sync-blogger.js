#!/usr/bin/env node
/**
 * Stateless Blogger publisher.
 *
 * Syncs poem YAML files to a Blogger blog via the Blogger API v3.
 * Pure helpers are exported for unit testing; main() runs only when invoked directly.
 *
 * Exports (pure, no network/fs):
 *   parseArgs(argv)                                  - parse CLI flags
 *   resolveConfig(config, env)                       - apply defaults + validate
 *   mapByTitle(posts)                                - Map<title, post>
 *   composePost({ title, bodyHtml, isoDate, label }) - build Blogger post body
 *   normalizeHtml(s)                                 - collapse whitespace for comparison
 *   postNeedsUpdate(existingPost, desiredPost)       - check if a post needs updating
 *   selectRemoved(posts, currentTitles, label)       - posts to draft/delete
 *   extractContent(fragmentHtml, mode)               - strip audio/analysis for 'poem' mode
 *
 * Network (require an access token):
 *   getAccessToken(env)
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
const { readPoemFile, loadPoemData, renderFragment } = require('./poem-render');

const YAML_DIR = path.join(process.cwd(), 'src', 'poems', 'yaml');
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

// Module-level credential variables, populated by resolveConfig.
let clientId     = undefined;
let clientSecret = undefined;
let refreshToken = undefined;

/**
 * Resolve and validate Blogger config, applying defaults.
 *
 * @param {object} config - raw .poetic-config object
 * @param {object} env    - environment variables (e.g. process.env)
 * @returns {{ enabled: boolean, blogId: string|undefined, label: string, removed: string, content: string, audiomackArtist: string, hasCredentials: boolean }}
 */
function resolveConfig(config, env) {
  const enabled = config.blogger_sync === 'true';
  const blogId = config.blogger_blog_id || undefined;

  const VALID_REMOVED = ['draft', 'delete', 'keep'];
  const removed = VALID_REMOVED.includes(config.blogger_removed)
    ? config.blogger_removed
    : 'draft';

  const VALID_CONTENT = ['full', 'poem'];
  const content = VALID_CONTENT.includes(config.blogger_content)
    ? config.blogger_content
    : 'full';

  const label = config.blogger_label || 'poem';
  const audiomackArtist = config.audiomack_artist || '';

  // Load fallback values from the credentials file if any env var is absent.
  let fileCredentials = {};
  const credentialsPath = path.resolve('.blogger-credentials.json');
  if (fs.existsSync(credentialsPath)) {
    try {
      const raw = fs.readFileSync(credentialsPath, 'utf8');
      fileCredentials = JSON.parse(raw)?.installed ?? {};
    } catch {
      // File exists but is unreadable or malformed; proceed without it.
    }
  }

  // Write to the module-level variables.
  clientId     = env.BLOGGER_CLIENT_ID     || fileCredentials.client_id;
  clientSecret = env.BLOGGER_CLIENT_SECRET || fileCredentials.client_secret;
  refreshToken = env.BLOGGER_REFRESH_TOKEN || fileCredentials.refresh_token;

  const hasCredentials = !!(clientId && clientSecret && refreshToken);

  return { enabled, blogId, label, removed, content, audiomackArtist, hasCredentials };
}

/**
 * Build a Map from post title to post object.
 *
 * @param {object[]} posts
 * @returns {Map<string, object>}
 */
function mapByTitle(posts) {
  const map = new Map();
  for (const post of posts) {
    map.set(post.title, post);
  }
  return map;
}

/**
 * Compose a Blogger post body object.
 *
 * @param {{ title: string, bodyHtml: string, isoDate: string, label: string }} opts
 * @returns {{ kind: string, title: string, content: string, labels: string[], published: string }}
 */
function composePost({ title, bodyHtml, isoDate, label }) {
  return {
    kind: 'blogger#post',
    title,
    content: bodyHtml,
    labels: [label],
    published: `${isoDate}T12:00:00Z`,
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
 * @param {object} existingPost - current post from the API
 * @param {object} desiredPost  - post as we want it to be
 * @returns {boolean}
 */
function postNeedsUpdate(existingPost, desiredPost) {
  if (existingPost.title !== desiredPost.title) return true;
  if (normalizeHtml(existingPost.content || '') !== normalizeHtml(desiredPost.content || '')) return true;
  const existingLabels = existingPost.labels || [];
  for (const label of desiredPost.labels || []) {
    if (!existingLabels.includes(label)) return true;
  }
  return false;
}

/**
 * Find posts that are LIVE, carry the given label, but whose title is no longer
 * in the current set of poem titles (i.e. removed from the collection).
 *
 * @param {object[]} posts         - all posts fetched from Blogger
 * @param {Set<string>} currentTitles - titles of current poems
 * @param {string} label           - the label that marks managed posts
 * @returns {object[]}
 */
function selectRemoved(posts, currentTitles, label) {
  return posts.filter(post => {
    if ((post.status || '').toUpperCase() !== 'LIVE') return false;
    const labels = post.labels || [];
    if (!labels.includes(label)) return false;
    return !currentTitles.has(post.title);
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
function extractContent(fragmentHtml, mode) {
  if (mode !== 'poem') return fragmentHtml;
  try {
    let html = fragmentHtml;
    // Remove audio block: <div class="song-link" id="song--…">…</div>
    // Uses a non-greedy match that handles nested divs by matching the outermost closing </div>
    html = html.replace(/<div class="song-link" id="song--[^"]*">[\s\S]*?<\/div>(?=<div|$|\s*<\/div>)/g, '');
    // Remove show-analysis button: <button class="analysis …" id="show-analysis--…">…</button>
    html = html.replace(/<button class="analysis[^"]*" id="show-analysis--[^"]*"[^>]*>[\s\S]*?<\/button>/g, '');
    // Remove analysis div: <div class="analysis" id="analysis--…">…</div>
    // This div contains nested divs and buttons, so we need a broader match
    html = html.replace(/<div class="analysis" id="analysis--[^"]*">[\s\S]*<\/div><\/div><\/div>/, (m) => {
      // Find the analysis div start and remove everything up to the final closing </div></div>
      return '';
    });
    return html;
  } catch (e) {
    // Best-effort: return original on any failure
    return fragmentHtml;
  }
}

// ── Network helpers ───────────────────────────────────────────────────────────

/**
 * Throw a descriptive error for a non-2xx API response.
 *
 * @param {Response} response
 * @param {string} context
 */
async function assertOk(response, context) {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${context}: HTTP ${response.status} — ${text}`);
  }
}

/**
 * Obtain a fresh access token using a stored refresh token.
 *
 * @param {object} env - environment variables
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(env) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  await assertOk(response, 'getAccessToken');
  const data = await response.json();
  return data.access_token;
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

    const response = await fetch(url.toString(), {
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
  const response = await fetch(`${BLOGGER_API}/blogs/${blogId}/posts/`, {
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
  const response = await fetch(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}`, {
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
  const response = await fetch(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}/revert`, {
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
  const response = await fetch(`${BLOGGER_API}/blogs/${blogId}/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(response, 'deletePost');
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Main entry point: sync poems to Blogger.
 */
async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const opts = resolveConfig(readPoeticConfig(), process.env);

    if (!opts.enabled) {
      console.log('Blogger sync disabled (set blogger_sync=true in .poetic-config).');
      return;
    }

    if (!opts.blogId) {
      console.log('Blogger sync: blogger_blog_id is required in .poetic-config.');
      return;
    }

    if (!opts.hasCredentials) {
      const missing = ['BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN']
        .filter(k => !process.env[k]);
      console.log(`Blogger sync: missing environment variable(s): ${missing.join(', ')}`);
      return;
    }

    const token = await getAccessToken(process.env);
    const posts = await listAllPosts(opts.blogId, token);
    const byTitle = mapByTitle(posts);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let handled = 0; // drafted or deleted

    const currentTitles = new Set();

    // Read all YAML files, skipping _* basenames
    const yamlFiles = fs.readdirSync(YAML_DIR)
      .filter(f => !f.startsWith('_') && f.endsWith('.yaml'))
      .map(f => path.join(YAML_DIR, f));

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
        renderFragment(data, { audiomackArtist: opts.audiomackArtist }),
        opts.content
      );

      const desired = composePost({
        title: data.title,
        bodyHtml,
        isoDate,
        label: opts.label,
      });

      currentTitles.add(data.title);

      const existing = byTitle.get(data.title);

      if (!existing) {
        if (args.dryRun) {
          console.log(`[create] ${data.title}`);
        } else {
          await createPost(opts.blogId, token, desired);
          console.log(`Created: ${data.title}`);
        }
        created++;
      } else if (postNeedsUpdate(existing, desired)) {
        // On UPDATE, do not send 'published' to avoid reordering
        const updateBody = {
          kind: desired.kind,
          title: desired.title,
          content: desired.content,
          labels: desired.labels,
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

    // Handle removed poems
    const removed = selectRemoved(posts, currentTitles, opts.label);
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

    const dryRunSuffix = args.dryRun ? ' (dry-run)' : '';
    const removedLabel = opts.removed === 'delete' ? 'deleted' : 'drafted';
    console.log(
      `Blogger sync: ${created} created, ${updated} updated, ${unchanged} unchanged, ${handled} ${removedLabel}${dryRunSuffix}.`
    );
  } catch (err) {
    console.error(`Blogger sync error: ${err.message}`);
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
  mapByTitle,
  composePost,
  normalizeHtml,
  postNeedsUpdate,
  selectRemoved,
  extractContent,
  // Network helpers (exported for advanced use / mocking)
  getAccessToken,
  listAllPosts,
  createPost,
  updatePost,
  revertPost,
  deletePost,
};

#!/usr/bin/env node
/**
 * One-time interactive helper to mint a Blogger API refresh token.
 *
 * Uses the OAuth 2.0 loopback redirect flow (OOB is deprecated by Google).
 *
 * Usage:
 *   node src/tools/blogger-auth.js [--port 4753] [--blog-url https://yourblog.blogspot.com]
 *
 * Prerequisites (Google Cloud Console):
 *   1. Create or select a project.
 *   2. Enable the Blogger API v3:
 *        APIs & Services → Library → search "Blogger API v3" → Enable
 *   3. Configure the OAuth consent screen:
 *        APIs & Services → OAuth consent screen → External
 *        Add your Google account as a test user (under "Test users").
 *        Publish the app once you are done testing — "Testing" status expires
 *        refresh tokens after 7 days.
 *   4. Create OAuth credentials:
 *        APIs & Services → Credentials → Create Credentials → OAuth client ID
 *        Application type: Desktop app
 *        Download or copy the Client ID and Client Secret.
 *   5. Run this script with BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET set,
 *      or leave them unset and this script will prompt you for them.
 *
 * After running, add the printed values as GitHub Actions secrets:
 *   BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN
 * And add your blog ID to .poetic-config.yaml:
 *   blogger:
 *     blog_id: "<id>"
 */

'use strict';

const http = require('http');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');
const { readPoeticConfig } = require('./poetic-config');

const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';
const CREDENTIALS_FILE = path.join(process.cwd(), '.blogger-credentials.json');

// Write `contents` to `filePath` with mode 0600, tolerating a pre-existing
// read-only file at that path. `fs.writeFileSync`'s `mode` option only takes
// effect when a file is *created*; against an existing file it's ignored and
// the open is checked against the on-disk permissions, so a deliberately
// read-only credentials file would otherwise fail the save with EACCES.
// Writing to a temp file and renaming it over the target sidesteps the
// target's permissions (a rename only needs write access to the directory)
// and is atomic — no truncated file if the process dies mid-write.
function saveFileMode0600(filePath, contents) {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmpFile, contents, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpFile, filePath);
    fs.chmodSync(filePath, 0o600);
  } catch (err) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Nothing to clean up if the temp file was never created or the
      // rename already moved it away.
    }
    if (err.code === 'EACCES') {
      throw new Error(
        `Could not save ${filePath}: permission denied (${err.code}). ` +
        `Check that ${dir} is writable, or remove the existing file and retry.`,
        { cause: err }
      );
    }
    throw err;
  }
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { port: 4753, blogUrl: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--blog-url' && argv[i + 1]) {
      args.blogUrl = argv[i + 1];
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      args.help = true;
    }
  }
  return args;
}

// ── Interactive prompt ────────────────────────────────────────────────────────

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// ── CSRF state + PKCE (RFC 8252 / RFC 7636) ───────────────────────────────────

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Opaque value echoed back on the redirect; guards against a forged callback.
function generateState() {
  return base64UrlEncode(crypto.randomBytes(16));
}

// S256 PKCE pair: the verifier stays local, only its SHA-256 hash is sent to
// the authorization endpoint, so an intercepted code cannot be redeemed alone.
function generatePkce() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Token exchange failed: HTTP ${response.status} — ${text}`);
  }
  return response.json();
}

// ── Blog ID lookup ────────────────────────────────────────────────────────────

async function lookupBlogId(blogUrl, accessToken) {
  const url = new URL(`${BLOGGER_API}/blogs/byurl`);
  url.searchParams.set('url', blogUrl);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Blog lookup failed: HTTP ${response.status} — ${text}`);
  }
  const data = await response.json();
  return data;
}

// ── Blog access check ─────────────────────────────────────────────────────────

/**
 * List the blogs the freshly authorised account may administer.
 *
 * A 403 is a finding, not an error. `users/self/blogs` asks only "who am I and
 * what do I own", so a refusal means Blogger does not recognise the account as
 * a Blogger user at all — the signature of a Google account with Blogger
 * disabled, which is the default for Workspace domains.
 *
 * @param {string} accessToken
 * @returns {Promise<{ recognised: boolean, blogs: Array<{id: string, name: string, url: string}> }>}
 */
async function listMyBlogs(accessToken) {
  const response = await fetch(`${BLOGGER_API}/users/self/blogs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 403) {
    return { recognised: false, blogs: [] };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Blog list failed: HTTP ${response.status} — ${text}`);
  }
  const data = await response.json();
  const blogs = (data.items || []).map(b => ({
    id: String(b.id),
    name: b.name,
    url: b.url,
  }));
  return { recognised: true, blogs };
}

/**
 * Describe what the authorised account can reach, and whether that matches the
 * blog this repo is configured to publish to.
 *
 * Checking here — while the person is still at the terminal and has not yet
 * saved anything — is the whole point: the alternative is finding out at the
 * next sync, from a 403 that names neither the account nor the blog.
 *
 * Pure, so the wording stays testable without a network.
 *
 * @param {{ recognised: boolean, blogs: Array<{id: string, name: string, url: string}> }} access
 * @param {?string} configuredBlogId - blogger.blog_id from .poetic-config.yaml, if set
 * @returns {{ ok: boolean, text: string }}
 */
function describeBlogAccess(access, configuredBlogId) {
  if (!access.recognised) {
    return {
      ok: false,
      text: [
        'WARNING: Blogger does not recognise this account as a Blogger user.',
        '',
        'Syncing with these credentials will fail with "The caller does not have',
        'permission". You are most likely signed in as the wrong Google account.',
        '',
        'If it is a Google Workspace account (you@your-company.com), that alone',
        'explains it: Workspace domains have Blogger switched off by default, and',
        'an account without Blogger is refused even when it has been added as an',
        'author on the blog.',
        '',
        'Check which account sees your blog at https://www.blogger.com/, then run',
        'this helper again and choose that account.',
      ].join('\n'),
    };
  }

  if (access.blogs.length === 0) {
    return {
      ok: false,
      text: [
        'WARNING: this account does not administer any blogs.',
        '',
        'Syncing with these credentials will fail. Check which account sees your',
        'blog at https://www.blogger.com/, then run this helper again and choose',
        'that account.',
      ].join('\n'),
    };
  }

  const matches = configuredBlogId
    ? access.blogs.some(b => b.id === String(configuredBlogId))
    : false;

  const list = access.blogs.map(b => {
    const marker = configuredBlogId && b.id === String(configuredBlogId)
      ? '  ← blogger.blog_id'
      : '';
    return `  ${b.id}  ${b.name}  <${b.url}>${marker}`;
  });

  if (!configuredBlogId) {
    return {
      ok: true,
      text: [
        'This account can manage these blogs:',
        '',
        ...list,
        '',
        'Copy the ID of the one you publish to into .poetic-config.yaml as',
        'blogger.blog_id (quoted — unquoted it is parsed as a number and loses',
        'precision).',
      ].join('\n'),
    };
  }

  if (!matches) {
    return {
      ok: false,
      text: [
        `WARNING: this account cannot manage blog ${configuredBlogId}, which is`,
        'the blogger.blog_id set in .poetic-config.yaml.',
        '',
        'It can manage these instead:',
        '',
        ...list,
        '',
        'So either you are signed in as the wrong Google account, or blog_id is',
        'wrong. Resolve that before saving these credentials — syncing as-is will',
        'fail with "The caller does not have permission".',
      ].join('\n'),
    };
  }

  return {
    ok: true,
    text: ['This account can manage these blogs:', '', ...list].join('\n'),
  };
}

// ── Loopback server ───────────────────────────────────────────────────────────

function waitForCode(port, expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url, `http://localhost:${port}`);
        const code = requestUrl.searchParams.get('code');
        const error = requestUrl.searchParams.get('error');
        const returnedState = requestUrl.searchParams.get('state');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p><p>You may close this window.</p></body></html>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          // CSRF guard: reject a callback whose state does not match the value
          // we generated for this request.
          if (expectedState && returnedState !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization failed</h1><p>State mismatch — possible CSRF. You may close this window.</p></body></html>');
            server.close();
            reject(new Error('State parameter mismatch — aborting (possible CSRF).'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorization successful!</h1><p>You may close this window and return to the terminal.</p></body></html>');
          server.close();
          resolve(code);
          return;
        }

        // No code or error — ignore (e.g. favicon requests)
        res.writeHead(404);
        res.end();
      } catch (err) {
        res.writeHead(500);
        res.end();
        server.close();
        reject(err);
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      // Server is ready
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));

  if (cliArgs.help) {
    console.log(`
blogger-auth.js — Mint a Blogger API refresh token

Usage: node src/tools/blogger-auth.js [options]

Options:
  --port <number>     Port for the OAuth loopback server (default: 4753)
  --blog-url <url>    After auth, look up and print the blog ID for this URL
  --help              Show this help

Prerequisites (Google Cloud Console):
  1. Enable the Blogger API v3 in your project.
  2. Configure OAuth consent screen as External and add yourself as a test user.
     Publish the app when you are done testing: while it is in "Testing" status
     Google expires every refresh token after 7 days, and the sync then fails.
  3. Create an OAuth 2.0 client ID (Desktop app type).
  4. Set BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET env vars (or enter them when prompted).

At the consent screen, sign in as the Google account that owns the blog — the
one that sees it at https://www.blogger.com/. Authorising as another account
succeeds here and then fails at sync time with "The caller does not have
permission". This helper lists the blogs the account can manage before you save
anything, so you can check.

After running:
  - Add BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN as GitHub Actions secrets.
  - Add blogger: { blog_id: "<id>" } to .poetic-config.yaml.
`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let clientId = process.env.BLOGGER_CLIENT_ID;
  let clientSecret = process.env.BLOGGER_CLIENT_SECRET;

  if (!clientId) {
    clientId = (await prompt(rl, 'Enter your BLOGGER_CLIENT_ID: ')).trim();
  }
  if (!clientSecret) {
    clientSecret = (await prompt(rl, 'Enter your BLOGGER_CLIENT_SECRET: ')).trim();
  }

  if (!clientId || !clientSecret) {
    console.error('Error: client ID and client secret are required.');
    rl.close();
    process.exitCode = 1;
    return;
  }

  const port = cliArgs.port;
  const redirectUri = `http://localhost:${port}`;

  // CSRF state + PKCE challenge for this authorization request (RFC 8252).
  const state = generateState();
  const { verifier: codeVerifier, challenge: codeChallenge } = generatePkce();

  // Build consent URL
  const consentUrl = new URL(AUTH_URL);
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('response_type', 'code');
  consentUrl.searchParams.set('scope', BLOGGER_SCOPE);
  consentUrl.searchParams.set('access_type', 'offline');
  // select_account forces the account chooser even when the browser has exactly
  // one Google account signed in. Without it Google silently uses that account,
  // which is how people authorise as the wrong one — a mistake that surfaces
  // much later as an unexplained 403 from the sync.
  consentUrl.searchParams.set('prompt', 'select_account consent');
  consentUrl.searchParams.set('state', state);
  consentUrl.searchParams.set('code_challenge', codeChallenge);
  consentUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Step 1: Open the following URL in your browser and sign in:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`\n${consentUrl.toString()}\n`);
  console.log(`─────────────────────────────────────────────────────────`);
  console.log(`Waiting for Google to redirect to http://localhost:${port} ...`);

  let code;
  try {
    code = await waitForCode(port, state);
  } catch (err) {
    console.error(`Error receiving authorization code: ${err.message}`);
    rl.close();
    process.exitCode = 1;
    return;
  }

  console.log('Authorization code received. Exchanging for tokens ...');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri, codeVerifier });
  } catch (err) {
    console.error(`Error exchanging code: ${err.message}`);
    rl.close();
    process.exitCode = 1;
    return;
  }

  const { refresh_token: refreshToken, access_token: accessToken } = tokens;

  console.log('\n═════════════════════════════════════════════════════════');
  console.log('SUCCESS — Your refresh token is:');
  console.log('═════════════════════════════════════════════════════════');
  console.log(`\n  ${refreshToken}\n`);
  console.log('═════════════════════════════════════════════════════════');

  if (!refreshToken) {
    console.warn(
      'Warning: No refresh_token returned. This can happen if you have already ' +
      'authorized this app. Revoke access at https://myaccount.google.com/permissions ' +
      'and run this script again.'
    );
  }

  // Optionally look up the blog ID
  if (cliArgs.blogUrl) {
    try {
      console.log(`\nLooking up blog ID for: ${cliArgs.blogUrl}`);
      const blogData = await lookupBlogId(cliArgs.blogUrl, accessToken);
      console.log(`Blog ID: ${blogData.id}`);
      console.log(`Blog name: ${blogData.name}`);
    } catch (err) {
      console.error(`Blog lookup error: ${err.message}`);
    }
  }

  // Confirm the account can actually reach the blog, while the person is still
  // here to do something about it. Best-effort: a check that cannot run is no
  // reason to lose a token that has just been minted.
  let accessOk = true;
  try {
    const access = await listMyBlogs(accessToken);
    let configuredBlogId = null;
    try {
      const config = readPoeticConfig();
      configuredBlogId = config.blogger && config.blogger.blog_id != null
        ? String(config.blogger.blog_id)
        : null;
    } catch {
      // No readable .poetic-config.yaml (e.g. run from outside a poem repo) —
      // report what the account can reach without checking it against a blog_id.
    }
    const verdict = describeBlogAccess(access, configuredBlogId);
    accessOk = verdict.ok;
    console.log('\n─────────────────────────────────────────────────────────');
    console.log(verdict.text);
    console.log('─────────────────────────────────────────────────────────');
  } catch (err) {
    console.warn(`\nCould not check this account's blog access: ${err.message}`);
  }

  // Offer to save credentials locally
  const savePrompt = accessOk
    ? '\nSave credentials to .blogger-credentials.json for local use? (y/N) '
    : '\nSave these credentials anyway? (y/N) ';
  const save = (await prompt(rl, savePrompt)).trim().toLowerCase();
  if (save === 'y' || save === 'yes') {
    const creds = {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      note: 'Local dev only — do NOT commit this file. Add these as GitHub Actions secrets instead.',
    };
    saveFileMode0600(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n');
    console.log(`Saved to ${CREDENTIALS_FILE}`);
    console.log('Make sure .blogger-credentials.json is in .gitignore!');
  }

  rl.close();

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Next steps:');
  console.log('─────────────────────────────────────────────────────────');
  console.log('1. Add these as GitHub Actions secrets in your repo (values shown above):');
  console.log('   BLOGGER_CLIENT_ID     = <redacted>');
  console.log('   BLOGGER_CLIENT_SECRET = <redacted>');
  console.log('   BLOGGER_REFRESH_TOKEN = <redacted>');
  console.log('2. Add to .poetic-config.yaml:');
  console.log('   blogger:');
  console.log('     sync: true');
  console.log('     blog_id: "<your blog numeric ID>"');
  console.log('     label: poem');
  console.log('─────────────────────────────────────────────────────────\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  waitForCode,
  exchangeCodeForTokens,
  lookupBlogId,
  listMyBlogs,
  describeBlogAccess,
  generateState,
  generatePkce,
  saveFileMode0600,
};

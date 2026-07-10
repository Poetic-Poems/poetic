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
const { URL, URLSearchParams } = require('url');

const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';
const CREDENTIALS_FILE = path.join(process.cwd(), '.blogger-credentials.json');

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

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

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

// ── Loopback server ───────────────────────────────────────────────────────────

function waitForCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url, `http://localhost:${port}`);
        const code = requestUrl.searchParams.get('code');
        const error = requestUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p><p>You may close this window.</p></body></html>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
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
  3. Create an OAuth 2.0 client ID (Desktop app type).
  4. Set BLOGGER_CLIENT_ID and BLOGGER_CLIENT_SECRET env vars (or enter them when prompted).

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

  // Build consent URL
  const consentUrl = new URL(AUTH_URL);
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('response_type', 'code');
  consentUrl.searchParams.set('scope', BLOGGER_SCOPE);
  consentUrl.searchParams.set('access_type', 'offline');
  consentUrl.searchParams.set('prompt', 'consent');

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Step 1: Open the following URL in your browser and sign in:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`\n${consentUrl.toString()}\n`);
  console.log(`─────────────────────────────────────────────────────────`);
  console.log(`Waiting for Google to redirect to http://localhost:${port} ...`);

  let code;
  try {
    code = await waitForCode(port);
  } catch (err) {
    console.error(`Error receiving authorization code: ${err.message}`);
    rl.close();
    process.exitCode = 1;
    return;
  }

  console.log('Authorization code received. Exchanging for tokens ...');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri });
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

  // Offer to save credentials locally
  const save = (await prompt(rl, '\nSave credentials to .blogger-credentials.json for local use? (y/N) ')).trim().toLowerCase();
  if (save === 'y' || save === 'yes') {
    const creds = {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      note: 'Local dev only — do NOT commit this file. Add these as GitHub Actions secrets instead.',
    };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n', 'utf8');
    console.log(`Saved to ${CREDENTIALS_FILE}`);
    console.log('Make sure .blogger-credentials.json is in .gitignore!');
  }

  rl.close();

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Next steps:');
  console.log('─────────────────────────────────────────────────────────');
  console.log('1. Add these as GitHub Actions secrets in your repo:');
  console.log(`   BLOGGER_CLIENT_ID     = ${clientId}`);
  console.log(`   BLOGGER_CLIENT_SECRET = ${clientSecret}`);
  console.log(`   BLOGGER_REFRESH_TOKEN = ${refreshToken || '<see above>'}`);
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

module.exports = { parseArgs, waitForCode, exchangeCodeForTokens, lookupBlogId };

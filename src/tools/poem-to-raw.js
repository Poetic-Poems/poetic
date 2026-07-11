#!/usr/bin/env node
//
// poem-to-raw.js — extract plain-text versions of all .poem files.
//
// For each non-partial .poem source file (i.e. files not beginning with '_' or
// '.'), this writes a plain-text rendering to raw/<stem> and a browsable HTML
// index to public/raw/index.html linking to the raw files on GitHub.
//
// The poem is parsed through the canonical engine (src/tools/poem-to-yaml.js),
// so variable handling — single-line and multi-line `={name}=`/`={name}<<=`
// definitions, `${name}` references (nested, dynamically bound), `${name:-default}`
// fallbacks, `\${...}` escaping, `.shared.poem` variables, and `%{...}` context
// variables — is identical to the YAML/HTML pipeline. One implementation backs
// both outputs. The parser's inline HTML markup is then flattened to plain text
// and common HTML entities are normalised to their Unicode equivalents.
//
// Outputs:
//   raw/<stem>              — plain-text rendering of each poem
//   public/raw/index.html   — HTML index linking to raw files on GitHub

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parsePoemFile } = require('./poem-to-yaml');
const { substituteContextVars, CONTEXT_VAR_NAMES } = require('./poem-render');
const { slugFromFile } = require('./slugify');
const { formatDateForDisplay } = require('./date-utils');
const { readPoeticConfig, CONFIG_FILENAME } = require('./poetic-config');
const { renderFooter, upsertFooter, resolveFooterSourcePath } = require('./footer');
const { needsRebuild, needsRebuildAggregate, recordManifest, forceRebuildRequested } = require('./needs-rebuild');

// Named HTML entities the engine (and Markdown) can emit, mapped to Unicode.
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  hellip: '…', mdash: '—', ndash: '–',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
};

// Decode numeric (&#NNN; / &#xHH;) and known named entity references.
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, ent) => {
    if (ent[0] === '#') {
      const code = (ent[1] === 'x' || ent[1] === 'X')
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      // Guard the valid Unicode range; String.fromCodePoint throws otherwise.
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const key = ent.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
      ? NAMED_ENTITIES[key]
      : match;
  });
}

// Matches a single HTML tag whose name starts with a letter, so literal `<`/`>`
// runs in poem text (e.g. describing `<<<...>>>` blocks) are left untouched.
const TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>/g;

// A span carrying the reserved `poetic-alternatives` class marks one option in
// an alternatives group (e.g. `/.poetic-alternatives.a{...}/.poetic-alternatives.b{...}`).
// Consecutive such spans that are directly adjacent — no separating characters,
// not even whitespace — form the group. The HTML keeps every option (the author
// wires up any runtime toggle between them); plain text can show only one, so
// the raw converter keeps the last option and drops the rest.
const ALT_SPAN_SRC =
  '<span class="(?:[^"]*\\s)?poetic-alternatives(?:\\s[^"]*)?">(?:(?!<\\/span>)[\\s\\S])*<\\/span>';
const ALT_GROUP_RE = new RegExp(`(?:${ALT_SPAN_SRC}){2,}`, 'g');
const ALT_SPAN_RE = new RegExp(ALT_SPAN_SRC, 'g');

function collapseAlternatives(html) {
  return html.replace(ALT_GROUP_RE, (group) => {
    const spans = group.match(ALT_SPAN_RE);
    return spans[spans.length - 1]; // keep the last option; its tags are stripped later
  });
}

// Flatten the engine's inline-markup HTML to plain text: alternatives collapse
// to their last option, hard breaks and block boundaries become newlines,
// remaining tags are dropped, entities decoded.
function htmlToPlainText(html) {
  return decodeEntities(
    collapseAlternatives(html)
      .replace(/<br\s*\/?>\n?/gi, '\n')                 // hard break (absorb an adjacent newline)
      .replace(/<\/(p|blockquote|div|li|h[1-6])\s*>/gi, '\n')
      .replace(TAG_RE, '')
  );
}

// Render a single segment's body (labels are omitted from plain text). Opaque
// `html` parts — embedded raw HTML or Markdown blocks (tables, widgets) — have
// no faithful plain-text form and are skipped.
function segmentToText(segment) {
  const chunks = [];
  const push = (html) => {
    const text = htmlToPlainText(html).replace(/\n+$/, '');
    if (text) chunks.push(text);
  };
  if (typeof segment.lines === 'string') push(segment.lines);
  if (Array.isArray(segment.parts)) {
    for (const part of segment.parts) {
      if (typeof part.lines === 'string') push(part.lines);
    }
  }
  return chunks.join('\n').replace(/[ \t]+$/gm, '');
}

// Build the plain-text rendering of a parsed poem: a dash-underlined title
// followed by the concatenated version bodies (segments separated by a blank
// line). `%{...}` context variables are resolved from the poem's own fields.
function renderPoemText(data, slug) {
  const title = htmlToPlainText(String(data.title || '')).trim();

  // Context values are substituted into already-decoded plain text, so decode
  // the poem's own fields too (a title/author may carry HTML entities).
  const ctx = {};
  for (const name of CONTEXT_VAR_NAMES) ctx[name] = data[name];
  ctx.slug = slug;
  ctx.title = title;
  if (data.author) ctx.author = htmlToPlainText(String(data.author)).trim();
  if (data.date) ctx.date = formatDateForDisplay(data.date);

  const versionTexts = [];
  for (const version of data.versions || []) {
    const segTexts = [];
    for (const segment of version.segments || []) {
      const text = segmentToText(segment);
      if (text) segTexts.push(text);
    }
    if (segTexts.length) versionTexts.push(segTexts.join('\n\n'));
  }

  const body = substituteContextVars(versionTexts.join('\n\n'), ctx);
  const underline = '-'.repeat([...title].length);
  const heading = `${title}\n${underline}`;
  return (body ? `${heading}\n\n${body}` : heading).replace(/\n*$/, '\n');
}

// Minimal HTML escaping for text placed in the index page.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Derive the "owner/name" GitHub slug from the origin remote, or null if there
// is no usable remote (e.g. a fresh checkout with no origin).
function githubRepoSlug(repoTop) {
  try {
    const url = execSync('git remote get-url origin', {
      cwd: repoTop, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const slug = url.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '');
    return slug || null;
  } catch {
    return null;
  }
}

function getRepoTop() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function buildIndex(entries, ghSlug) {
  const rawBase = ghSlug
    ? `https://raw.githubusercontent.com/${ghSlug}/refs/heads/main/raw`
    : '../../raw'; // no GitHub remote: link to the repo-root raw/ dir relatively
  const items = entries
    .map((e) => `    <li><a href="${rawBase}/${e.stem}">${escapeHtml(e.title)}</a></li>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poems</title>
</head>
<body>
  <h1>Poems</h1>
  <ul>
${items}
  </ul>
</body>
</html>
`;
}

function main() {
  const repoTop = getRepoTop();
  const poemDir = path.join(repoTop, 'src', 'poems', 'poem');
  const rawDir = path.join(repoTop, 'raw');
  const publicRawDir = path.join(repoTop, 'public', 'raw');

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(publicRawDir, { recursive: true });

  const force = forceRebuildRequested();
  const sharedPoemPath = path.join(poemDir, '.shared.poem');

  const files = fs.readdirSync(poemDir)
    .filter((f) => f.endsWith('.poem') && !f.startsWith('_') && !f.startsWith('.'))
    .sort();

  const entries = [];
  let skippedCount = 0;
  for (const file of files) {
    const poemPath = path.join(poemDir, file);
    const stem = path.basename(file, '.poem');
    const rawOutputPath = path.join(rawDir, stem);
    // parsePoemFile always has to run — public/raw/index.html's entries need
    // every poem's title regardless of whether that poem's own raw/<stem>
    // needs rewriting — so the check below only skips the (more expensive)
    // plain-text rendering and file write, not the parse.
    try {
      const data = parsePoemFile(poemPath);
      const title = htmlToPlainText(String(data.title || '')).trim();
      entries.push({ stem, title });

      const inputs = [poemPath, ...(fs.existsSync(sharedPoemPath) ? [sharedPoemPath] : [])];
      if (!needsRebuild(rawOutputPath, inputs, { force })) {
        skippedCount++;
        continue;
      }

      const slug = slugFromFile(poemPath);
      const text = renderPoemText(data, slug);
      fs.writeFileSync(rawOutputPath, text, 'utf8');
    } catch (error) {
      console.error(`Error converting ${file}:`, error.message);
    }
  }
  if (skippedCount > 0) {
    console.log(`⏭  ${skippedCount} poem(s) already up to date, skipped.`);
  }

  const config = readPoeticConfig(repoTop);
  // public/raw/index.html lives one directory deep, like individual poem pages.
  const footerBlock = renderFooter(config, repoTop, { base: '../' });
  const footerSourcePath = resolveFooterSourcePath(config, repoTop);
  const configPath = path.join(repoTop, CONFIG_FILENAME);
  const indexOutputPath = path.join(publicRawDir, 'index.html');
  const manifestPath = path.join(publicRawDir, '.raw-index.manifest.json');
  // The index lists every poem, so its source set is every file in poemDir.
  // A poem added to / removed from that set is detected by comparing the set
  // against a sidecar manifest (see needsRebuildAggregate) rather than the
  // directory's own mtime, which not every filesystem or sync tool bumps.
  const sources = fs.readdirSync(poemDir).map((f) => path.join(poemDir, f));
  const extraInputs = [
    ...(fs.existsSync(configPath) ? [configPath] : []),
    ...(fs.existsSync(footerSourcePath) ? [footerSourcePath] : []),
  ];
  if (!needsRebuildAggregate(indexOutputPath, sources, { manifestPath, baseDir: poemDir, extraInputs, force })) {
    console.log('⏭  public/raw/index.html is up to date, skipping.');
    return;
  }

  fs.writeFileSync(
    indexOutputPath,
    upsertFooter(buildIndex(entries, githubRepoSlug(repoTop)), footerBlock),
    'utf8'
  );
  recordManifest(manifestPath, sources, poemDir);
}

if (require.main === module) main();

module.exports = {
  htmlToPlainText, decodeEntities, collapseAlternatives,
  segmentToText, renderPoemText, buildIndex,
};

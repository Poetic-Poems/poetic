'use strict';

/**
 * Shared footer renderer for GitHub Pages output.
 *
 * `renderFooter` reads the file named by .poetic-config.yaml's `footer.source`
 * (default: public/poetic-footer.html) and wraps its contents in a marked
 * <footer class="poetic-footer"> block, or returns '' when the footer is
 * disabled (footer.enabled: false) or the source file is missing.
 *
 * The footer source file may reference `%{base}` — the relative path prefix
 * to the site root ('' for root-level pages, '../' for one-level-deep pages
 * such as individual poem pages) — resolved via the same %{...} context-var
 * mechanism poem content uses (see poem-render.js).
 *
 * `upsertFooter` inserts a rendered footer block as the last child of
 * <body>, replacing any previously-inserted block in place. It is safe to
 * call on freshly-generated HTML (no existing block) and on a previously
 * self-healed file (existing block from an earlier build) alike.
 */

const fs = require('fs');
const path = require('path');
const { substituteContextVars } = require('./poem-render');

const DEFAULT_FOOTER_SOURCE = 'public/poetic-footer.html';

const FOOTER_START = '<!-- poetic:footer -->';
const FOOTER_END = '<!-- /poetic:footer -->';

/**
 * Resolve .poetic-config.yaml's `footer.source` (default: public/poetic-footer.html)
 * to an absolute path, without checking whether it exists.
 *
 * @param {object} config - parsed .poetic-config.yaml
 * @param {string} repoRoot - directory footer.source is resolved against
 * @returns {string}
 */
function resolveFooterSourcePath(config, repoRoot) {
  const footerSource = (config.footer && config.footer.source) || DEFAULT_FOOTER_SOURCE;
  return path.isAbsolute(footerSource) ? footerSource : path.join(repoRoot, footerSource);
}

/**
 * @param {object} config - parsed .poetic-config.yaml (see poetic-config.js)
 * @param {string} repoRoot - directory footer.source is resolved against
 * @param {{ base?: string }} [opts] - base: relative prefix to the site root
 * @returns {string} the marked <footer> block, or '' if disabled/missing
 */
function renderFooter(config, repoRoot, opts = {}) {
  if (config.footer && config.footer.enabled === false) return '';

  const { base = '' } = opts;
  const footerPath = resolveFooterSourcePath(config, repoRoot);

  if (!fs.existsSync(footerPath)) {
    console.warn(`Warning: footer.source file not found: ${footerPath}; skipping footer`);
    return '';
  }

  const raw = fs.readFileSync(footerPath, 'utf8').trim();
  const content = substituteContextVars(raw, { base });
  return `${FOOTER_START}\n<footer class="poetic-footer">${content}</footer>\n${FOOTER_END}`;
}

// Matches a previously-inserted footer block (and any leading whitespace on
// its own line) regardless of reformatting by js-beautify between builds.
const FOOTER_BLOCK_RE = new RegExp(
  `[ \\t]*${FOOTER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${FOOTER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`
);

/**
 * Insert `footerBlock` as the last child of <body>, replacing any existing
 * marked footer block. Passing '' for `footerBlock` strips an existing block
 * without inserting a new one (used when the footer has been disabled since
 * the last build).
 *
 * @param {string} html
 * @param {string} footerBlock - output of renderFooter(), or ''
 * @returns {string}
 */
function upsertFooter(html, footerBlock) {
  const stripped = html.replace(FOOTER_BLOCK_RE, '');
  if (!footerBlock) return stripped;
  return stripped.replace(/<\/body>/, `${footerBlock}\n</body>`);
}

module.exports = {
  renderFooter, upsertFooter, resolveFooterSourcePath, DEFAULT_FOOTER_SOURCE, FOOTER_START, FOOTER_END,
};

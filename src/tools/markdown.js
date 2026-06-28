#!/usr/bin/env node
/**
 * Shared GitHub-Flavoured Markdown renderer for the poem pipeline.
 *
 * Used by every GFM context: the analysis section, the postscript section, and
 * `<<<markdown ... >>>` blocks. The poem body keeps its own WYSIWYG dialect
 * (see convertMarkup in poem-to-yaml.js) and does NOT go through this renderer.
 *
 * Configuration:
 *  - html: true        -> raw HTML embedded in content passes through (needed for
 *                         existing analyses that hand-write <ul>/<li>, and for
 *                         interactive blocks). The sole author is trusted; no
 *                         sanitisation is performed.
 *  - typographer: true -> smart quotes plus `--` -> en dash, `---` -> em dash,
 *                         `...` -> ellipsis, matching the poem body's typography.
 *
 * markdown-it's default preset already includes CommonMark + GFM tables +
 * ~~strikethrough~~.
 */

const MarkdownIt = require('markdown-it');

// Headings are offset by +2 so that `#`/`##`/`###` render as <h3>/<h4>/<h5>
// (clamped at <h6>). Analysis/postscript content sits under the template's
// <h2> "Analysis of ..." title, so a literal <h1> would be wrong mid-page and
// would shift the levels of every existing analysis.
const HEADING_OFFSET = 2;

const md = new MarkdownIt({ html: true, typographer: true });

function offsetHeading(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const level = Math.min(6, parseInt(token.tag.slice(1), 10) + HEADING_OFFSET);
  token.tag = 'h' + level;
  return self.renderToken(tokens, idx, options);
}
md.renderer.rules.heading_open = offsetHeading;
md.renderer.rules.heading_close = offsetHeading;

/**
 * Render a block of GFM to an HTML fragment.
 */
function renderGfm(text) {
  return md.render(text);
}

/**
 * Render a single line/run of GFM as inline HTML (no surrounding <p>).
 * Useful for labels.
 */
function renderGfmInline(text) {
  return md.renderInline(text);
}

module.exports = { md, renderGfm, renderGfmInline };

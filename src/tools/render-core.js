/**
 * Pure, filesystem-free rendering helpers shared by the Node build path
 * (poem-render.js) and the browser renderer (src/browser/render.js):
 *
 *   - build-time `%{name}` context-variable substitution, and
 *   - resolving a poem's `audio` section into the song render model.
 *
 * Keep this module browser-safe: its only dependency is song-handlers.js
 * (itself fs-free), so do NOT add `fs`/`path`/`__dirname` or any other
 * Node-only dependency here.
 */

const { resolveSongs } = require('./song-handlers');

/**
 * The closed set of build-time "context" variable names that `%{name}`
 * references resolve against at render time (distinct from author `${name}`
 * variables, which are resolved earlier by poem-to-yaml.js).
 */
const CONTEXT_VAR_NAMES = ['slug', 'title', 'author', 'date'];

/**
 * Substitute build-time context references in `text`:
 *   %{name}          - the context value for `name` (see CONTEXT_VAR_NAMES).
 *   %{name:-default} - `default` when `name` is not a known/defined context var.
 *   \%{name}         - a literal `%{name}` (the leading backslash is consumed).
 * An unknown context name with no fallback is left as a literal `%{name}`.
 */
function substituteContextVars(text, ctx) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '%' && text[i + 2] === '{') {
      out += '%{';
      i += 3;
      continue;
    }
    if (c === '%' && text[i + 1] === '{') {
      const close = text.indexOf('}', i + 2);
      if (close === -1) { out += c; i++; continue; }
      const inner = text.slice(i + 2, close);
      i = close + 1;
      if (inner === '') { out += '%{}'; continue; }
      let name = inner;
      let fallback = null;
      const sep = inner.indexOf(':-');
      if (sep !== -1) { name = inner.slice(0, sep); fallback = inner.slice(sep + 2); }
      if (Object.prototype.hasOwnProperty.call(ctx, name) && ctx[name] != null) {
        out += String(ctx[name]);
      } else if (fallback !== null) {
        out += fallback;
      } else {
        out += '%{' + inner + '}';
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Return a deep copy of `value` with every string run through
 * substituteContextVars(). Non-string leaves (including Date) are passed through
 * unchanged; shared/cached objects are never mutated in place.
 */
function applyContextVars(value, ctx) {
  if (typeof value === 'string') return substituteContextVars(value, ctx);
  if (Array.isArray(value)) return value.map((v) => applyContextVars(v, ctx));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyContextVars(v, ctx);
    return out;
  }
  return value;
}

/**
 * Resolve the `%{...}` context references in a poem's content from its own
 * fields, returning a new poem-data object (the input is left untouched).
 */
function resolveContextVars(poemData) {
  const ctx = {};
  for (const name of CONTEXT_VAR_NAMES) ctx[name] = poemData[name];
  return applyContextVars(poemData, ctx);
}

/**
 * Resolve a poem's audio section into the `songs` render model (see
 * song-handlers.js). Returns [] when the poem has no audio.
 */
function songsFor(data, config) {
  return resolveSongs(data.audio, {
    ctx: { slug: data.slug, title: data.title, author: data.author, date: data.date },
    config: config || {},
  });
}

module.exports = {
  CONTEXT_VAR_NAMES,
  substituteContextVars,
  applyContextVars,
  resolveContextVars,
  songsFor,
};

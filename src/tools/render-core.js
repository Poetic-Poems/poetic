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
 * Render the restricted inline-markup subset permitted in a poem title into
 * HTML for the visible heading only. Unlike the body renderer (convertMarkup in
 * poem-parser.js), this is deliberately *escape-first* and recognises ONLY:
 *
 *   *word* / _word_     -> <em>word</em>
 *   **word** / __word__ -> <strong>word</strong>
 *   ~word~              -> <s>word</s>
 *   \* \_ \~ \\         -> literal * _ ~ \
 *
 * No dashes, smart quotes, entity expansion, links, spans, raw HTML, or `\%`/
 * `\?` handling (the `\%` decode already happened once, in the parser). The only
 * tags this can ever emit are <em>, <strong>, <s> and their closers.
 *
 * Security keystone: `&`, `<`, `>` are HTML-escaped BEFORE any tag is emitted, so
 * no `<`/`>`/`&` from the source — or from a substituted variable value — can
 * ever produce a live tag. Because of this, callers may interpolate the result
 * unescaped (Pug `!=`). Pass the FULLY-SUBSTITUTED plain title (see §5.3 of
 * docs/design/title-inline-markup.md).
 */
function renderTitleMarkup(text) {
  if (text == null) return '';
  let out = String(text);

  // 1. HTML-escape metacharacters first (& before < > to avoid double-escaping).
  out = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. Protect the four backslash escapes via placeholders so their literal
  //    character survives the transforms below untouched.
  const escapes = new Map();
  let escapeIndex = 0;
  out = out.replace(/\\([*_~\\])/g, (match, char) => {
    const placeholder = `\x00ESCAPE${escapeIndex++}\x00`;
    escapes.set(placeholder, char);
    return placeholder;
  });

  // 3. Apply the three inline transforms, in the same order and with the same
  //    tokenisation as convertMarkup (strong before emphasis), so nesting
  //    degrades identically to body text (§11 Q3).
  out = out.replace(/~([^~]+)~/g, '<s>$1</s>'); // Strikethrough
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // Strong
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>'); // Strong (underscore)
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Emphasis
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>'); // Emphasis (underscore)

  // 4. Restore the protected literals.
  // eslint-disable-next-line no-control-regex -- \x00 matches the placeholder format built above
  out = out.replace(/\x00ESCAPE\d+\x00/g, (placeholder) => escapes.get(placeholder));

  return out;
}

/**
 * Resolve the `%{...}` context references in a poem's content from its own
 * fields, returning a new poem-data object (the input is left untouched). The
 * returned object also carries `titleHtml`, the restricted-markup rendering of
 * the fully-substituted title for the visible heading (see renderTitleMarkup);
 * `title` itself stays plain text for every non-heading sink.
 */
function resolveContextVars(poemData) {
  const ctx = {};
  for (const name of CONTEXT_VAR_NAMES) ctx[name] = poemData[name];
  const resolved = applyContextVars(poemData, ctx);
  resolved.titleHtml = renderTitleMarkup(resolved.title);
  return resolved;
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
  renderTitleMarkup,
  songsFor,
};

/**
 * Song-handler registry and resolver.
 *
 * Handlers describe how a music service named in a poem's `audio:` section
 * becomes markup. They are declarative — URL templates + labels only; styling
 * lives in poetic.css / custom.css. Builtins ship in ../song-handlers.yaml;
 * consumers add or override them under `song_handlers:` in .poetic-config.yaml.
 *
 * A handler may define:
 *   link_url  (+ link_label)   - a plain anchor
 *   embed_url (+ button_label) - a lazy-loaded iframe (built on click by poetic.js)
 * At least one of link_url / embed_url is required.
 *
 * Templates use {token} placeholders resolved server-side against:
 *   {value}                        - the text the author wrote after the service
 *                                    name (empty for a bare line, e.g. "Audiomack")
 *   {slug} {title} {author} {date} - poem context
 *   {<top-level config key>}       - any scalar at the top level of .poetic-config.yaml
 *   {<handler field>}              - any scalar on the matched handler itself, e.g.
 *                                    {artist} for the builtin audiomack handler, set
 *                                    via song_handlers.audiomack.artist
 * A fallback chain {a|b|c} resolves to the first token that is non-empty.
 *
 * A handler that serves several kinds of media (e.g. mega: audio and video)
 * declares `default_media` plus a `media_sizes` map of per-type size profiles
 * ({ height } OR { aspect_ratio }); a single-media handler declares `embed_height`
 * or `embed_aspect_ratio` directly. An author may override the size per song via
 * a trailing param list on the audio line, which reaches this module as an
 * object-form audio value { value, media?, ratio?, height? }. resolveSongs()
 * resolves the effective player size and records the media type (see below).
 *
 * Exports:
 *   loadSongHandlers(config)                 - merged builtin + user handler map
 *   resolveSongs(audio, { ctx, config, handlers })
 *                                            - ordered render model for a poem
 *   hasResolvableSongs(audio, config, handlers)
 *                                            - true if any entry has a handler
 *   substituteTemplate(template, scope)      - low-level {token} expansion
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BUILTIN_HANDLERS_PATH = path.join(__dirname, '..', 'song-handlers.yaml');

/** Read the framework's builtin handler definitions. */
function loadBuiltinHandlers() {
  try {
    const parsed = yaml.load(fs.readFileSync(BUILTIN_HANDLERS_PATH, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    console.error(`Error reading builtin song handlers (${BUILTIN_HANDLERS_PATH}): ${err.message}`);
    return {};
  }
}

/** True for a non-null, non-array object (a "plain" mergeable map). */
function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Deep-merge `source` into `target` in place and return `target`. Plain objects
 * merge recursively (key-by-key); any scalar/array value replaces the target
 * value wholesale; a `null` source value deletes the target key. Nested plain
 * objects on the source are cloned rather than shared, so the builtin
 * definitions are never mutated by a consumer override.
 */
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value === null) {
      delete target[key];
    } else if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Merge builtin handlers with a consumer's `song_handlers` config. Keys are
 * lower-cased. A consumer handler DEEP-MERGES into a builtin of the same name:
 * scalar keys are overridden, nested maps (e.g. `media_sizes`) merge key-by-key,
 * and a `null` value deletes a key (or, at the top level, the whole handler).
 * This lets a consumer retune just one size profile without redeclaring the
 * handler's `embed_url`.
 *
 * @param {object} [config] - parsed .poetic-config.yaml
 * @returns {Object<string, object>} handler map keyed by lower-case service name
 */
function loadSongHandlers(config = {}) {
  const handlers = {};
  const merge = (source) => {
    if (!isPlainObject(source)) return;
    for (const [name, def] of Object.entries(source)) {
      const key = String(name).toLowerCase();
      if (def === null) { delete handlers[key]; continue; }
      if (!isPlainObject(def)) continue;
      if (!isPlainObject(handlers[key])) handlers[key] = {};
      deepMerge(handlers[key], def);
    }
  };
  merge(loadBuiltinHandlers());
  merge(config.song_handlers);
  return handlers;
}

/**
 * Extract the author's `{value}` string from a raw audio entry. Accepts a plain
 * string, `true` (a bare service line — no value), or the object form
 * `{ value, media?, ratio?, height? }` produced when the audio line carried a
 * trailing param list. A missing/`true` value yields the empty string.
 */
function audioValueString(value) {
  const inner = (value && typeof value === 'object') ? value.value : value;
  return (typeof inner === 'string') ? inner : '';
}

/**
 * Build the {token} scope: top-level config scalars, then the matched
 * handler's own scalar fields (e.g. `artist` merged in from
 * song_handlers.audiomack.artist — see loadSongHandlers), then poem context,
 * then the author value. Later sources win on key collision.
 */
function buildScope(value, ctx = {}, config = {}, handler = {}) {
  const scope = {};
  const addScalars = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue;
      const t = typeof v;
      if (t === 'string' || t === 'number' || t === 'boolean') scope[k] = String(v);
    }
  };
  addScalars(config);
  addScalars(handler);
  for (const name of ['slug', 'title', 'author', 'date']) {
    if (ctx[name] != null) scope[name] = String(ctx[name]);
  }
  scope.value = audioValueString(value);
  return scope;
}

/**
 * Normalise an aspect ratio to the CSS `aspect-ratio` form `"x / y"`. Accepts
 * `x:y`, `x/y`, or `x / y` (integers or decimals). Returns null if malformed.
 */
function normaliseAspectRatio(raw) {
  const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  return m ? `${m[1]} / ${m[2]}` : null;
}

/**
 * Normalise a CSS height. A bare number becomes `<n>px`; an already-suffixed CSS
 * length passes through unchanged. Returns null if it is neither.
 */
function normaliseHeight(raw) {
  const s = String(raw).trim();
  if (/^\d+(?:\.\d+)?$/.test(s)) return `${s}px`;
  if (/^\d+(?:\.\d+)?(?:px|em|rem|ex|ch|vh|vw|vmin|vmax|%|pt|pc|cm|mm|in|q)$/i.test(s)) return s;
  return null;
}

/** Descriptor for an aspect-ratio player size (variable height, fixed ratio). */
function aspectSize(ratio) {
  return { sizeVar: '--song-embed-aspect-ratio', sizeValue: ratio, sizeIsAspect: true };
}

/** Descriptor for a fixed-height player size. */
function heightSize(height) {
  return { sizeVar: '--song-embed-height', sizeValue: height, sizeIsAspect: false };
}

/**
 * Resolve an embed's player size and media type from the raw audio value and
 * its handler. Returns `{ size, media }` where `media` is the resolved media
 * type (per-song token, else handler `default_media`, else undefined — recorded
 * even when a per-song `ratio=` overrode the size) and `size` is a size
 * descriptor (or null to fall back to the framework CSS default).
 *
 * Precedence: (1) per-song `ratio=` → aspect-ratio; (2) per-song `height=` →
 * fixed height; (3) media type → `media_sizes[media]` (`aspect_ratio` or
 * `height`); (4) handler base `embed_aspect_ratio` / `embed_height`; (5) none.
 * A malformed per-song `ratio`/`height` warns and falls through to the
 * media-type default.
 */
function resolveEmbedSize(value, handler, service) {
  const perSong = (value && typeof value === 'object') ? value : {};
  const media = perSong.media || handler.default_media || undefined;

  if (perSong.ratio != null && String(perSong.ratio) !== '') {
    const norm = normaliseAspectRatio(perSong.ratio);
    if (norm) return { size: aspectSize(norm), media };
    console.warn(
      `Warning: song handler "${service}" ignoring malformed ratio "${perSong.ratio}" — ` +
      `falling back to the media-type default.`
    );
  } else if (perSong.height != null && String(perSong.height) !== '') {
    const norm = normaliseHeight(perSong.height);
    if (norm) return { size: heightSize(norm), media };
    console.warn(
      `Warning: song handler "${service}" ignoring malformed height "${perSong.height}" — ` +
      `falling back to the media-type default.`
    );
  }

  const profile = (isPlainObject(handler.media_sizes) && media)
    ? handler.media_sizes[media]
    : undefined;
  if (isPlainObject(profile)) {
    if (profile.aspect_ratio != null && String(profile.aspect_ratio) !== '') {
      const norm = normaliseAspectRatio(profile.aspect_ratio);
      if (norm) return { size: aspectSize(norm), media };
    }
    if (profile.height != null && String(profile.height) !== '') {
      const norm = normaliseHeight(profile.height);
      if (norm) return { size: heightSize(norm), media };
    }
  }

  if (handler.embed_aspect_ratio != null && String(handler.embed_aspect_ratio) !== '') {
    const norm = normaliseAspectRatio(handler.embed_aspect_ratio);
    if (norm) return { size: aspectSize(norm), media };
  }
  if (handler.embed_height != null && String(handler.embed_height) !== '') {
    const norm = normaliseHeight(handler.embed_height);
    if (norm) return { size: heightSize(norm), media };
  }

  return { size: null, media };
}

/**
 * Expand {token} and {a|b|c} placeholders in a template string. A single token
 * resolves to its scope value (or '' when unknown/empty); a pipe chain resolves
 * to the first non-empty candidate.
 */
function substituteTemplate(template, scope) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, inner) => {
    const names = inner.split('|').map((s) => s.trim());
    for (const name of names) {
      const v = scope[name];
      if (v != null && v !== '') return v;
    }
    return '';
  });
}

/**
 * True when a raw audio entry has a value worth rendering. Accepts the plain
 * string / `true` forms and the object form `{ value, ... }` (in which case the
 * inner `.value` is tested).
 */
function hasValue(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (value && typeof value === 'object') return hasValue(value.value);
  return false;
}

/**
 * Resolve a poem's `audio` object into an ordered render model:
 *   [{ service, embed?: { src, buttonLabel, title }, link?: { href, label } }]
 * Preserves author order. Unknown services and handlers that produce no output
 * are warned about and skipped.
 *
 * @param {object} audio - the poem's `audio` map ({ service: value|true })
 * @param {{ ctx?: object, config?: object, handlers?: object }} [opts]
 * @returns {Array<object>}
 */
function resolveSongs(audio, opts = {}) {
  if (!audio || typeof audio !== 'object') return [];
  const { ctx = {}, config = {} } = opts;
  const registry = opts.handlers || loadSongHandlers(config);
  const songs = [];
  for (const [rawName, value] of Object.entries(audio)) {
    const service = String(rawName).toLowerCase();
    const handler = registry[service];
    if (!handler) {
      console.warn(
        `Warning: no song handler defined for "${rawName}" — skipping. ` +
        `Add it under song_handlers: in .poetic-config.yaml.`
      );
      continue;
    }
    const scope = buildScope(value, ctx, config, handler);
    const song = { service };
    if (handler.embed_url) {
      const { size, media } = resolveEmbedSize(value, handler, service);
      song.embed = {
        src: substituteTemplate(handler.embed_url, scope),
        buttonLabel: handler.button_label || `Load ${service} player`,
        title: ctx.title != null ? String(ctx.title) : '',
      };
      if (media) song.embed.media = media;
      if (size) {
        song.embed.sizeVar = size.sizeVar;
        song.embed.sizeValue = size.sizeValue;
        song.embed.sizeIsAspect = size.sizeIsAspect;
      }
    }
    if (handler.link_url) {
      song.link = {
        href: substituteTemplate(handler.link_url, scope),
        label: handler.link_label || service,
      };
    }
    if (!song.embed && !song.link) {
      console.warn(
        `Warning: song handler "${service}" defines neither embed_url nor link_url — skipping.`
      );
      continue;
    }
    songs.push(song);
  }
  return songs;
}

/**
 * True if `audio` has at least one entry with a defined handler and a value.
 * Used to flag poems on the all-poems index without building full markup.
 */
function hasResolvableSongs(audio, config = {}, handlers) {
  if (!audio || typeof audio !== 'object') return false;
  const registry = handlers || loadSongHandlers(config);
  return Object.entries(audio).some(([name, value]) => {
    const h = registry[String(name).toLowerCase()];
    return !!h && hasValue(value) && !!(h.embed_url || h.link_url);
  });
}

module.exports = {
  loadSongHandlers,
  resolveSongs,
  hasResolvableSongs,
  substituteTemplate,
};

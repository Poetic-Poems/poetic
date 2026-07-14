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
 * A handler may also declare `value_patterns` — an ordered list of
 * { match, value? } regexes tried against the raw {value} before template
 * substitution, so an author can paste any amount of a service's own URL (a
 * full share link, a partial path, a bare ID) and have the rest inferred; see
 * applyValuePatterns() below.
 *
 * A handler that serves several kinds of media (e.g. mega: audio and video)
 * declares `default_media` plus a `media_sizes` map of per-type size profiles
 * ({ height } OR { aspect_ratio }); a single-media handler declares `embed_height`
 * or `embed_aspect_ratio` directly. An author may override the size per song via
 * a trailing param list on the audio line, which reaches this module as an
 * object-form audio value { value, media?, ratio?, height? }. resolveSongs()
 * resolves the effective player size and records the media type (see below).
 *
 * A handler may also declare `embed_allow` and/or `embed_allowfullscreen` to
 * override the iframe `allow` / `allowfullscreen` attributes poetic.js applies
 * by default; either left unset falls back to poetic.js's global default (see
 * the loader's click handler in public/poetic.js).
 *
 * Exports:
 *   loadSongHandlers(config)                 - merged builtin + user handler map
 *   resolveSongs(audio, { ctx, config, handlers })
 *                                            - ordered render model for a poem
 *   hasResolvableSongs(audio, config, handlers)
 *                                            - true if any entry has a handler
 *   substituteTemplate(template, scope)      - low-level {token} expansion
 */

const BUILTIN_HANDLERS = require('./song-handlers-data');

/**
 * Read the framework's builtin handler definitions.
 *
 * Returns a deep clone so callers and the merge in loadSongHandlers() can never
 * mutate the shared module data. The builtins are authored in
 * src/song-handlers.yaml and emitted to ./song-handlers-data.js (a plain,
 * fs-free data module) by build-song-handlers-data.js — so this module, and the
 * browser renderer that depends on it (src/browser/render.js), stay
 * filesystem-free. Do NOT reintroduce `fs`/`path`/`__dirname` here.
 */
function loadBuiltinHandlers() {
  return JSON.parse(JSON.stringify(BUILTIN_HANDLERS));
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
 *
 * `__proto__`/`constructor`/`prototype` keys are skipped outright via direct
 * `===` comparisons rather than a `Set`/array lookup: `source` ultimately
 * comes from consumer-authored YAML (`song_handlers:` in .poetic-config.yaml),
 * so an untrusted or malformed config must not be able to reach
 * `Object.prototype` (CodeQL js/prototype-pollution-utility) — and CodeQL's
 * guard recognition for that query only treats an inline equality test against
 * the literal key as a sanitizing barrier, not an indirect membership check.
 */
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
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
 * handler's `embed_url`. A handler name of `__proto__`/`constructor`/`prototype`
 * is skipped via the same direct equality check as `deepMerge` (see above)
 * rather than merged, since `handlers[key]` would otherwise resolve to
 * `Object.prototype` itself.
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
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
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
 * then the author value (run through the handler's `value_patterns`, if any —
 * see applyValuePatterns). Later sources win on key collision.
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
  applyValuePatterns(scope, handler);
  return scope;
}

/**
 * Rewrite `scope.value` (and optionally other scope tokens, e.g. `{artist}`)
 * by matching the raw author value against a handler's `value_patterns` — an
 * ordered list of `{ match, value? }` entries. This lets an author paste any
 * amount of a service's own URL — a full share link, a partial path, or just
 * a bare ID — and have the rest inferred, rather than having to hand-extract
 * the exact substring a template needs.
 *
 * The first entry whose `match` regexp matches the raw value wins:
 *   - its named capture groups are merged into `scope` (e.g. a group named
 *     `artist` overrides `{artist}` for this song only)
 *   - if the entry has a `value` template, it is substituted (via the same
 *     {token} engine as URL templates) against the updated scope to produce
 *     the new `{value}`; otherwise a named group called `value` — merged in
 *     the step above — supplies it directly
 * A raw value that matches no pattern (including when the handler defines
 * none, or the value is empty) is left exactly as the author wrote it — this
 * is what keeps a plain override (e.g. `Audiomack: my-shepherd`) and every
 * existing bare-value handler working unchanged.
 */
function applyValuePatterns(scope, handler) {
  const raw = scope.value;
  if (!raw) return;
  const patterns = Array.isArray(handler.value_patterns) ? handler.value_patterns : [];
  for (const entry of patterns) {
    if (!entry || typeof entry.match !== 'string') continue;
    let re;
    try {
      re = new RegExp(entry.match);
    } catch (_) {
      console.warn(`Warning: song handler has an invalid value_patterns regex "${entry.match}" — ignoring it.`);
      continue;
    }
    const m = re.exec(raw);
    if (!m) continue;
    Object.assign(scope, m.groups || {});
    if (entry.value != null) scope.value = substituteTemplate(entry.value, scope);
    return;
  }
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
      // Per-handler iframe permission override (see the docblock above); left
      // unset, the template emits no data-allow[-fullscreen] attribute and
      // poetic.js's global default applies. allowFullscreen is stringified so
      // an explicit `false` still reaches the template as `data-allow-fullscreen="false"`
      // rather than being dropped as a falsy attribute value.
      if (handler.embed_allow != null) song.embed.allow = String(handler.embed_allow);
      if (handler.embed_allowfullscreen != null) song.embed.allowFullscreen = String(!!handler.embed_allowfullscreen);
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

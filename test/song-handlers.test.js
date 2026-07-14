'use strict';

/**
 * Unit tests for the song-handler resolver: player-size precedence, aspect-ratio
 * normalisation/validation, and the deep-merge semantics of loadSongHandlers.
 * See src/tools/song-handlers.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { resolveSongs, loadSongHandlers } = require('../src/tools/song-handlers');

const CTX = { title: 'T', slug: 's' };

// A self-contained handler registry so these tests do not depend on the builtin
// YAML (though they exercise the same code paths the builtins use).
const HANDLERS = {
  mega: {
    embed_url: 'https://mega.nz/embed/{value}',
    button_label: 'Load MEGA',
    default_media: 'audio',
    media_sizes: {
      audio: { height: '232px' },
      video: { aspect_ratio: '16 / 9' },
    },
  },
  fixed: {
    embed_url: 'https://x/{value}',
    embed_height: '300px',
  },
  ratioed: {
    embed_url: 'https://x/{value}',
    embed_aspect_ratio: '4 / 3',
  },
  plain: {
    embed_url: 'https://x/{value}',
  },
  permissioned: {
    embed_url: 'https://x/{value}',
    embed_allow: 'autoplay; encrypted-media',
    embed_allowfullscreen: false,
  },
};

// Resolve a single audio entry against HANDLERS and return its embed model.
function embed(service, value) {
  const songs = resolveSongs({ [service]: value }, { ctx: CTX, handlers: HANDLERS });
  return songs[0] && songs[0].embed;
}

function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// ── media-type size profiles ────────────────────────────────────────────────

test('media_sizes: default_media selects the audio height profile', () => {
  const e = embed('mega', 'ID#KEY');
  assert.strictEqual(e.media, 'audio');
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '232px');
  assert.strictEqual(e.sizeIsAspect, false);
});

test('media_sizes: an explicit video token selects the aspect-ratio profile', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video' });
  assert.strictEqual(e.media, 'video');
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '16 / 9');
  assert.strictEqual(e.sizeIsAspect, true);
});

// ── precedence ──────────────────────────────────────────────────────────────

test('precedence: per-song ratio= wins over the media-type size, media still recorded', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video', ratio: '21:9' });
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '21 / 9');
  assert.strictEqual(e.media, 'video', 'media type is recorded even when ratio overrides the size');
});

test('precedence: per-song height= wins over the media-type size', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video', height: '480' });
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '480px');
  assert.strictEqual(e.media, 'video');
});

test('precedence: handler base embed_height applies when there is no media profile', () => {
  const e = embed('fixed', 'X');
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '300px');
  assert.strictEqual(e.media, undefined);
});

test('precedence: handler base embed_aspect_ratio applies (normalised)', () => {
  const e = embed('ratioed', 'X');
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '4 / 3');
  assert.strictEqual(e.sizeIsAspect, true);
});

test('precedence: no size anywhere → CSS fallback (no size emitted)', () => {
  const e = embed('plain', 'X');
  assert.strictEqual(e.sizeVar, undefined);
  assert.strictEqual(e.sizeValue, undefined);
});

// ── ratio / height normalisation & validation ───────────────────────────────

test('ratio normalisation: "16/9" and "16:9" both become "16 / 9"', () => {
  assert.strictEqual(embed('mega', { value: 'X', ratio: '16/9' }).sizeValue, '16 / 9');
  assert.strictEqual(embed('mega', { value: 'X', ratio: '16:9' }).sizeValue, '16 / 9');
});

test('height normalisation: a bare number becomes px, a CSS length passes through', () => {
  assert.strictEqual(embed('mega', { value: 'X', height: '360' }).sizeValue, '360px');
  assert.strictEqual(embed('mega', { value: 'X', height: '30vh' }).sizeValue, '30vh');
});

test('validation: malformed ratio warns and falls back to the media-type default', () => {
  const { result, warnings } = captureWarnings(() =>
    embed('mega', { value: 'X', media: 'audio', ratio: 'nonsense' }));
  assert.strictEqual(result.sizeVar, '--song-embed-height');
  assert.strictEqual(result.sizeValue, '232px');
  assert.ok(warnings.some((w) => /malformed ratio/.test(w)));
});

test('validation: malformed height warns and falls back to the media-type default', () => {
  const { result, warnings } = captureWarnings(() =>
    embed('mega', { value: 'X', media: 'video', height: 'tall' }));
  assert.strictEqual(result.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(result.sizeValue, '16 / 9');
  assert.ok(warnings.some((w) => /malformed height/.test(w)));
});

// ── embed permissions (allow / allowfullscreen) ─────────────────────────────

test('embed_allow/embed_allowfullscreen: a handler override is exposed on the embed model', () => {
  const e = embed('permissioned', 'X');
  assert.strictEqual(e.allow, 'autoplay; encrypted-media');
  assert.strictEqual(e.allowFullscreen, 'false');
});

test('embed_allow/embed_allowfullscreen: absent on a handler leaves both unset (loader falls back to its default)', () => {
  const e = embed('plain', 'X');
  assert.strictEqual(e.allow, undefined);
  assert.strictEqual(e.allowFullscreen, undefined);
});

test('embed_allowfullscreen: true is stringified, not dropped as a falsy value', () => {
  const handlers = { x: { embed_url: 'https://x/{value}', embed_allowfullscreen: true } };
  const songs = resolveSongs({ x: 'X' }, { ctx: CTX, handlers });
  assert.strictEqual(songs[0].embed.allowFullscreen, 'true');
});

// ── loadSongHandlers deep-merge ──────────────────────────────────────────────

test('deep-merge: a consumer override merges a nested media_sizes profile key-by-key', () => {
  const handlers = loadSongHandlers({
    song_handlers: {
      mega: { media_sizes: { audio: { aspect_ratio: '4 / 3' } } },
    },
  });
  // Overridden audio ratio…
  assert.strictEqual(handlers.mega.media_sizes.audio.aspect_ratio, '4 / 3');
  // …while the untouched video profile and the embed_url survive.
  assert.deepStrictEqual(handlers.mega.media_sizes.video, { aspect_ratio: '16 / 9' });
  assert.strictEqual(handlers.mega.embed_url, 'https://mega.nz/embed/{value}');
});

test('deep-merge: a null value deletes a nested key', () => {
  const handlers = loadSongHandlers({
    song_handlers: {
      mega: { media_sizes: { video: null } },
    },
  });
  assert.strictEqual(handlers.mega.media_sizes.video, undefined);
  assert.ok(handlers.mega.media_sizes.audio, 'sibling profile is untouched');
});

test('deep-merge: a null handler deletes the whole builtin', () => {
  const handlers = loadSongHandlers({ song_handlers: { mega: null } });
  assert.strictEqual(handlers.mega, undefined);
  assert.ok(handlers.audiomack, 'other builtins are untouched');
});

test('deep-merge: overriding a builtin does not mutate it for the next load', () => {
  loadSongHandlers({ song_handlers: { mega: { media_sizes: { audio: { height: '999px' } } } } });
  const fresh = loadSongHandlers({});
  assert.strictEqual(fresh.mega.media_sizes.audio.aspect_ratio, '1 / 1');
  assert.strictEqual(fresh.mega.media_sizes.audio.height, undefined);
});

test('deep-merge: a "__proto__" handler name is skipped, not merged into Object.prototype', () => {
  const before = ({}).polluted;
  const handlers = loadSongHandlers({
    song_handlers: { __proto__: { polluted: 'yes' } },
  });
  assert.strictEqual(({}).polluted, before, 'Object.prototype must be untouched');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(handlers, '__proto__'), false);
  assert.ok(handlers.mega, 'other builtins are unaffected');
});

test('deep-merge: a "constructor" handler name is skipped, not merged', () => {
  const handlers = loadSongHandlers({
    song_handlers: { constructor: { embed_url: 'https://evil/{value}' } },
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(handlers, 'constructor'), false);
  assert.strictEqual(({}).constructor, Object, 'Object.prototype.constructor must be untouched');
});

test('deep-merge: a nested "__proto__"/"constructor" key inside a handler override is skipped', () => {
  const before = ({}).polluted;
  loadSongHandlers({
    song_handlers: {
      mega: { __proto__: { polluted: 'yes' }, constructor: { polluted2: 'yes' } },
    },
  });
  assert.strictEqual(({}).polluted, before);
  assert.strictEqual(({}).polluted2, undefined);
});

test('a consumer can add a brand-new handler alongside the builtins', () => {
  const handlers = loadSongHandlers({
    song_handlers: { youtube: { embed_url: 'https://youtube/{value}', button_label: 'Y' } },
  });
  assert.ok(handlers.youtube);
  assert.ok(handlers.mega, 'builtins remain');
});

// ── value_patterns (generic mechanism) ──────────────────────────────────────

const PATTERNED = {
  artistslug: {
    embed_url: 'https://x/{artist|default}/{value|slug}',
    embed_height: '1px',
    value_patterns: [
      { match: '^(?<artist>[^/]+)/(?:song/)?(?<value>[^/]+)$' },
    ],
  },
  prefixed: {
    embed_url: 'https://x/{value}',
    embed_height: '1px',
    value_patterns: [
      { match: '^(?<id>[A-Za-z0-9]{4})$', value: 'p/{id}' },
    ],
  },
};

test('value_patterns: named groups (no template) override scope directly', () => {
  const e = embed2('artistslug', 'someartist/song/some-slug');
  assert.strictEqual(e.src, 'https://x/someartist/some-slug');
});

test('value_patterns: a match with no "/" falls through unchanged (plain override)', () => {
  const e = embed2('artistslug', 'plain-value');
  assert.strictEqual(e.src, 'https://x/default/plain-value');
});

test('value_patterns: a "value" template is substituted using the matched groups', () => {
  const e = embed2('prefixed', 'ABCD');
  assert.strictEqual(e.src, 'https://x/p/ABCD');
});

test('value_patterns: an empty/bare value (true) is left alone, no pattern applied', () => {
  const e = embed2('prefixed', true);
  assert.strictEqual(e.src, 'https://x/');
});

test('value_patterns: an invalid regex warns and is skipped, falling through to plain value', () => {
  const handlers = {
    bad: {
      embed_url: 'https://x/{value}',
      value_patterns: [{ match: '(unterminated' }],
    },
  };
  const { result, warnings } = captureWarnings(() => {
    const songs = resolveSongs({ bad: 'raw' }, { ctx: CTX, handlers });
    return songs[0].embed;
  });
  assert.strictEqual(result.src, 'https://x/raw');
  assert.ok(warnings.some((w) => /invalid value_patterns regex/.test(w)));
});

// Resolve a single audio entry against PATTERNED (config carries a `default`
// top-level scalar for the artistslug handler's {artist|default} fallback).
function embed2(service, value) {
  const songs = resolveSongs(
    { [service]: value },
    { ctx: CTX, config: { default: 'default' }, handlers: PATTERNED },
  );
  return songs[0] && songs[0].embed;
}

// ── value_patterns (builtin handlers) ───────────────────────────────────────

const BUILTINS = loadSongHandlers({ song_handlers: { audiomack: { artist: 'saltysojourner' } } });

function builtinEmbed(service, value) {
  const songs = resolveSongs({ [service]: value }, { ctx: CTX, handlers: BUILTINS });
  return songs[0] && songs[0].embed;
}

function builtinLink(service, value) {
  const songs = resolveSongs({ [service]: value }, { ctx: CTX, handlers: BUILTINS });
  return songs[0] && songs[0].link;
}

test('audiomack: a plain slug override replaces only {value|slug}, artist stays configured', () => {
  const e = builtinEmbed('audiomack', 'my-shepherd');
  assert.strictEqual(e.src, 'https://audiomack.com/embed/saltysojourner/song/my-shepherd');
});

test('audiomack: an "artist/song/slug" value overrides both artist and slug', () => {
  const e = builtinEmbed('audiomack', 'other_account/song/my-shepherd');
  assert.strictEqual(e.src, 'https://audiomack.com/embed/other_account/song/my-shepherd');
});

test('audiomack: a full pasted URL is accepted the same way', () => {
  const e = builtinEmbed('audiomack', 'https://audiomack.com/embed/other_account/song/my-shepherd');
  assert.strictEqual(e.src, 'https://audiomack.com/embed/other_account/song/my-shepherd');
});

test('audiomack: a bare line (no value) still falls back to the poem slug', () => {
  const e = builtinEmbed('audiomack', true);
  assert.strictEqual(e.src, 'https://audiomack.com/embed/saltysojourner/song/s');
});

test('suno: a bare 16-char ID infers the "s/" short-link form', () => {
  const l = builtinLink('suno', 'A24WTEpznxVMtA5x');
  assert.strictEqual(l.href, 'https://suno.com/s/A24WTEpznxVMtA5x');
});

test('suno: a bare UUID infers the "song/" full-link form', () => {
  const l = builtinLink('suno', '12345678-1234-1234-1234-123456789abc');
  assert.strictEqual(l.href, 'https://suno.com/song/12345678-1234-1234-1234-123456789abc');
});

test('suno: an explicit "s/…" value passes through unchanged', () => {
  const l = builtinLink('suno', 's/A24WTEpznxVMtA5x');
  assert.strictEqual(l.href, 'https://suno.com/s/A24WTEpznxVMtA5x');
});

test('suno: a full pasted URL is reduced to its "s/…" tail', () => {
  const l = builtinLink('suno', 'https://suno.com/s/A24WTEpznxVMtA5x');
  assert.strictEqual(l.href, 'https://suno.com/s/A24WTEpznxVMtA5x');
});

test('mega: a full share URL is reduced to "<id>#<key>"', () => {
  const e = builtinEmbed('mega', 'https://mega.nz/file/AbC1dEfG#h1JkLmN0pQ');
  assert.strictEqual(e.src, 'https://mega.nz/embed/AbC1dEfG#h1JkLmN0pQ');
});

test('mega: the bare "<id>#<key>" form still works unchanged', () => {
  const e = builtinEmbed('mega', 'AbC1dEfG#h1JkLmN0pQ');
  assert.strictEqual(e.src, 'https://mega.nz/embed/AbC1dEfG#h1JkLmN0pQ');
});

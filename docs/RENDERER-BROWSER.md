# Browser-safe renderer

The framework exports a browser-/edge-safe renderer so a `.poem` can be rendered
to HTML in a plain JavaScript runtime — no filesystem, no `__dirname`, no Pug
compiler. It exists so a web app (Poetic Fiddle) can render a live preview
client-side and server-side-render (SSR) a shared poem's page from the **same
renderer the CLI build uses**, rather than forking the `.poem` parser/renderer.

The entry point is [`src/browser/render.js`](../src/browser/render.js).

## API

```js
const { renderPoem, renderPoemPage } = require('poetic/browser');
// or: import { renderPoem, renderPoemPage } from 'poetic/browser';

// A styled HTML fragment (no <html>/<head>/<body>) — for a live preview.
const fragment = renderPoem(sourceText, { config, slug });

// A full standalone HTML document (correct <title>, linked assets) — for SSR.
const page = renderPoemPage(sourceText, { config, slug, favicon, subtitle });
```

| Option     | Applies to        | Default            | Meaning |
|------------|-------------------|--------------------|---------|
| `config`   | both              | `{}`               | The friendly subset of `.poetic-config` (drives song handlers). Passed as an object — there is no file read. |
| `slug`     | both              | slug of the title  | The build derives a poem's slug from its source filename; an in-editor poem has none, so it defaults to `slugify(title)`. |
| `favicon`  | `renderPoemPage`  | `poetic-logo.svg`  | Favicon href (must already have any leading `public/` stripped). |
| `subtitle` | `renderPoemPage`  | `My Poems`         | Nav subtitle. |

Both functions produce output **byte-for-byte identical** to the Node build path
(`poem-render.js`'s `renderFragment`/`renderPage`) for the same poem. This is
asserted over the whole poem corpus by
[`test/browser-render.test.js`](../test/browser-render.test.js), so the two
paths cannot silently diverge.

## Packaging & consumption

`poetic` stays `private: true` — it is not published to the npm registry. Its
usual distribution path to a poem-collection repo is
`scripts/sync-framework.sh` (a file sync, not an npm dependency; see the root
`CLAUDE.md`), which doesn't fit an app like Poetic Fiddle that needs to
`import` the renderer as code. Instead, a consumer installs `poetic` as a
**git dependency pinned to a tag or commit**:

```bash
npm install github:Poetic-Poems/poetic#v6.0.0
```

(swap `v6.0.0` for whichever tag/commit to pin to — `package.json`'s `version`
field is the single source of truth for tags; see the root `CLAUDE.md`
"Release process". A commit SHA works the same way if pinning between
releases.)

`package.json` declares an `exports` map with two subpaths — a consumer
imports through these, not a deep `poetic/src/...` path (which `exports`
deliberately leaves unresolvable):

```js
const { renderPoem, renderPoemPage } = require('poetic/browser');
// or: import { renderPoem, renderPoemPage } from 'poetic/browser';
```

```js
// Resolves to this repo's committed public/poetic.css.
const cssPath = require.resolve('poetic/browser/poetic.css');
```

`public/poetic.css` is framework-authored, hand-maintained CSS — committed
source, not a build artefact (it is not listed in `.gitignore`, unlike the
generated `public/*.html`) — so it is present immediately after a git-dependency
install, with no `npm run build` step required. A consumer reads it however
suits its bundler (inline the contents, copy it into a static asset pipeline,
etc.) to get full styled fidelity alongside `renderPoem`'s output; `custom.css`
is poem-collection-specific and is never synced or exported, so it has no
package equivalent.

## Security — the output is UNTRUSTED

The renderer is built on markdown-it configured with `html: true` and performs
**no sanitisation** — the framework's model is a single trusted author writing
their own poems (see [`src/tools/markdown.js`](../src/tools/markdown.js)). That
assumption does **not** hold for a multi-user web app, where poem content is
untrusted and is shown on surfaces other people view.

`poetic` is deliberately left unchanged: the consumer sanitises at the boundary.
A consumer (Fiddle) **must**, before any rendered HTML reaches a viewer:

- **Sanitise** the returned HTML (e.g. DOMPurify) — raw `<script>`/`<iframe>`/
  event-handler content authored inside a poem must not execute.
- Serve it under a strict **Content-Security-Policy**.
- **Allow-list and sandbox** media/song embeds (the song handlers emit
  provider iframes; only known providers, in `sandbox`ed frames).

Sanitising downstream (rather than turning off markdown-it's `html`) keeps
`poetic`'s trusted-author rendering intact for poem-collection repos while
letting Fiddle apply the stricter policy it needs.

## How it stays filesystem-free

The Node build path reads templates, builtin song-handler data and config off
disk. Three couplings are broken for the browser graph:

1. **Pug templates → precompiled functions.** `poem-render.js` compiles
   `src/templates/*.pug` at runtime with `pug.compileFile` (needs Pug + `fs`).
   [`build-templates.js`](../src/tools/build-templates.js) precompiles them to
   standalone functions in
   [`src/tools/poem-templates.js`](../src/tools/poem-templates.js) — the Pug
   runtime inlined, no compiler, no `fs`. The precompiled output is byte-identical
   to the runtime compile (guarded by `test/poem-templates.test.js`).
2. **Builtin song handlers → inlined data.** `song-handlers.js` read
   `src/song-handlers.yaml` with `fs`. It now loads
   [`src/tools/song-handlers-data.js`](../src/tools/song-handlers-data.js), a
   plain data module generated from that YAML by
   [`build-song-handlers-data.js`](../src/tools/build-song-handlers-data.js)
   (guarded by `test/song-handlers-data.test.js`). The YAML stays the
   human-authored source.
3. **Config → an argument.** The render functions already take `config` as an
   object, so the browser entry just accepts it as `opts.config` — no file read.

The whole graph reachable from the entry (`poem-parser`, `render-core`,
`song-handlers` + `song-handlers-data`, `poem-templates`, `slugify`,
`date-utils`, plus the npm deps `markdown-it` and `js-yaml`) is filesystem-free.
`test/browser-render.test.js` asserts it loads **zero Node built-ins** and
references no `__dirname`/`__filename`.

### Regenerating the generated modules

`src/tools/poem-templates.js` and `src/tools/song-handlers-data.js` are
generated and committed. Regenerate them whenever a `.pug` template or
`song-handlers.yaml` changes:

```bash
npm run build:generated
```

The freshness tests fail if the committed files are stale, so CI catches a
missed regeneration.

## Notes on rendering fidelity

- **Parse object vs YAML round-trip.** The build path is `.poem` → parse → write
  YAML → reload → render; the browser path skips the file round-trip (parse →
  object → render). These are byte-identical because the parser stores the poem
  date as a `YYYY-MM-DD` **string** and js-yaml dumps/reloads it as the same
  string (it quotes it, so it never becomes a `Date`) — the identical value then
  reaches `formatDateForDisplay` in both paths.
- **`$ref` resolution.** Cross-file `$ref` is a multi-file, build-time concern
  resolved before rendering. A single in-editor poem has none, and the render
  path needs none.
- **Preview CSS.** Full styled fidelity needs `public/poetic.css` (and any
  `custom.css`); that is a stylesheet asset the consumer bundles, not part of
  the renderer itself. It is exposed alongside the renderer as
  `poetic/browser/poetic.css` — see "Packaging & consumption" above.

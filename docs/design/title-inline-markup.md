# Design: inline markup in poem titles

- **Status:** Accepted / ready to implement (not yet implemented)
- **Date:** 2026-07-19
- **Repo:** `poetic` (framework) — a framework change, propagated to consumers via `scripts/sync-framework.sh`
- **Scope decision:** restricted inline subset only — **emphasis, strong, strikethrough**. No links, spans, smart quotes, dashes, entity expansion, or raw HTML.

> This document is a forward-looking design, deliberately kept out of the as-built `docs/`
> top level. When the feature ships, fold the author-facing parts into
> `docs/POEM-SYNTAX.md` and record the change in `CHANGELOG.md`, then this file can be
> removed or archived.

---

## 1. Summary

Today a poem title is inert plain text: `title_line = text_content` in
[poem-syntax.ebnf:84](../../poem-syntax.ebnf), and the parser stores it after only
`.trim()`, `${…}` substitution, and `\%` decoding
([poem-parser.js:836-843](../../src/tools/poem-parser.js)). Every template sink
HTML-escapes it, so `**bold**`, `_em_`, `~struck~` appear literally.

This design adds a **restricted** inline-markup pass so that a title can render
emphasis (`*…*` / `_…_`), strong (`**…**` / `__…__`), and strikethrough (`~…~`) —
and *only* those. Crucially it does **not** reuse the body renderer
`convertMarkup()` ([poem-parser.js:1778](../../src/tools/poem-parser.js)), because
that renderer passes raw HTML through unsanitised and also transforms dashes,
quotes and entities — both of which we explicitly want to avoid here.

The plain-text title is retained unchanged for every context that needs plain text
(`<title>`, slugs, Open Graph, Blogger, attributes, `%{title}`). A second,
rendered representation (`titleHtml`) is introduced for the visible poem heading
only.

## 2. Motivation

Authors want light typographic emphasis in a title (e.g. a single stressed word)
without dropping to a raw `<em>` tag — which today would be escaped and shown
literally anyway. Restricting to em/strong/strikethrough keeps the feature small,
safe, and free of the injection and backward-compatibility hazards that a full
`text_with_markup` title would carry (see the consequences analysis that preceded
this doc).

## 3. Goals and non-goals

**Goals**
- Render `*…*`, `_…_` → `<em>`; `**…**`, `__…__` → `<strong>`; `~…~` → `<s>` in the
  visible poem-page/fragment title.
- Preserve a plain-text title for all non-heading sinks.
- Introduce **no** raw-HTML / script-injection surface on the title — including the
  untrusted multi-author path used by poetic-fiddle.
- No visible change to any existing poem's title (zero-regression on the current
  corpus).

**Non-goals (this iteration)**
- Links (`[text|url]`), spans (`/.class{…}`), smart quotes, en/em dashes, entity
  expansion, or hard line breaks in titles — explicitly excluded from the subset.
- Rendering markup in the **index grid** and **all-poems listing** titles — these
  stay plain text for now (see §10).
- Any change to body/segment/label/analysis markup semantics.

## 4. The markup subset

| Author writes | Renders as | Notes |
|---|---|---|
| `*word*` or `_word_` | `<em>word</em>` | emphasis |
| `**word**` or `__word__` | `<strong>word</strong>` | strong |
| `~word~` | `<s>word</s>` | strikethrough |
| `\*` `\_` `\~` `\\` | literal `*` `_` `~` `\` | backslash escape for the four special chars |

Everything else in a title stays literal: `-`, `'`, `"`, `` ` ``, `&`, `<`, `>`, `%`,
`[`, `]`, `{`, `}`, `/`, `#`, `$`, `^`, `|`, `.`, digits, letters, whitespace. In
particular `--`/`---` do **not** become dashes, `` ` ``/`"` do **not** become smart
quotes, and `&…;` is **not** treated as an entity — all differences from the body
renderer, chosen so existing titles are byte-stable (§8).

## 5. Design

### 5.1 Two title representations

- `title` — plain text, exactly as produced today. Unchanged. Remains the value in
  YAML and the source for every plain-text sink.
- `titleHtml` — the rendered, restricted-markup HTML for the visible heading. Derived
  from the fully-substituted plain title. New field.

Keeping `title` untouched means every existing plain-text consumer keeps working with
no change and no new escaping obligations.

### 5.2 The restricted renderer

Add a dedicated function, `renderTitleMarkup(text)`, defined in
[render-core.js](../../src/tools/render-core.js) — *not* in `poem-parser.js`. It is a
render-stage concern (the parser stores only the plain title), and placing it in
`render-core` keeps that module's lean dependency contract (its only require is
`song-handlers.js`) while giving both the Node and browser render paths one shared
implementation. It mirrors `convertMarkup`'s tokenisation approach but is
**escape-first** and recognises only the four escapes and three transforms above:

1. **HTML-escape metacharacters first:** `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`.
   This is the security keystone: because escaping happens before any tag is emitted,
   no `<`/`>`/`&` from the source *or from a substituted variable value* can ever
   produce a live tag. (`"`/`'` need not be escaped: `titleHtml` is only ever placed in
   element content, never an attribute — attributes use the plain `title`.)
2. **Protect backslash escapes** (`\*` `\_` `\~` `\\`) via placeholders, as
   `convertMarkup` already does for its escape set.
3. **Apply the three inline transforms** (`**`/`__` → `<strong>`, `*`/`_` → `<em>`,
   `~` → `<s>`), reusing the same tokenisation approach as `convertMarkup` but with the
   dash/quote/entity/link/span steps omitted.
4. **Restore** the escaped literals.

The only tags this function can ever emit are `<em>`, `<strong>`, `<s>` and their
closers. It does **not** import `convertMarkup`'s `\%`/`\?` handling — see §6.

### 5.3 Ordering and substitution safety

The title is finalised through substitution before markup is rendered:

- `${…}` author-variable substitution and `\%` decoding already run at parse time
  ([poem-parser.js:836-843](../../src/tools/poem-parser.js)).
- `%{…}` context-variable substitution runs at render time — `title` is in
  `CONTEXT_VAR_NAMES` ([render-core.js:20](../../src/tools/render-core.js)) and is
  walked by `applyContextVars`.

`titleHtml` must be computed **after all substitution is complete**, so it reflects the
final text and — combined with escape-first rendering — a variable value that happens
to contain `<`, `&`, `*`, `_`, or `~` cannot inject a tag; its metacharacters are
escaped, and `*/_/~` in a *value* would at worst render emphasis, never HTML.

Integration point: attach `titleHtml` inside **`resolveContextVars()`**
([render-core.js:85](../../src/tools/render-core.js)), immediately after
`applyContextVars` returns the substituted poem data. All four render entry points
funnel through it — `renderFragment`/`renderPage` in
[poem-render.js:292,312](../../src/tools/poem-render.js) and
`renderPoem`/`renderPoemPage` in [render.js:69,85](../../src/browser/render.js) — so
one change gives the Node build and the browser renderer the same code path and the
same ordering guarantee. `titleHtml` is thereby part of the render model passed to
the templates; it is a render-stage artefact and is **not** persisted in YAML (§11
Q2), which keeps the YAML schema and golden fixtures stable.

### 5.4 Sink routing

Only the visible single-poem heading consumes `titleHtml`. Everything else keeps
`title`.

| Sink | File | Uses |
|---|---|---|
| Poem-page heading | [poem-page.pug:25](../../src/templates/poem-page.pug) `h2.poem-title` | `!= titleHtml` |
| Fragment heading | [_poem-content.pug:54](../../src/templates/_poem-content.pug) `h2.poem-title` | `!= titleHtml` |
| Fragment title span | [_poem-content.pug:57](../../src/templates/_poem-content.pug) `span.title` | `!= titleHtml` |
| Analysis headings | [_poem-content.pug:194,200,205](../../src/templates/_poem-content.pug) | `!= titleHtml` inside the existing `<em>` wrapper (decision — see §11 Q1) |
| `<head><title>` | [poem-page.pug:13](../../src/templates/poem-page.pug), [poem-templates.js:939](../../src/tools/poem-templates.js) | **`title` (plain)** — element cannot hold tags |
| Slug (browser path) | [render.js:47](../../src/browser/render.js) | **`title` (plain)** |
| Song embed `data-title` → iframe | [song-handlers.js:362](../../src/tools/song-handlers.js) → [poetic.js:32](../../public/poetic.js) | **`title` (plain)** — attribute |
| `%{title}` context var | [render-core.js:87](../../src/tools/render-core.js) | **`title` (plain)** |
| Blogger post title + permalink | [sync-blogger.js:791,808](../../src/tools/sync-blogger.js) | **`title` (plain)** |
| Index grid card / all-poems listing | [index.js:71](../../public/index.js), [aggregate-render-core.js:206,219](../../src/tools/aggregate-render-core.js) | **`title` (plain)** — out of scope this iteration |

Wherever a sink switches to `titleHtml`, the Pug interpolation changes from the
escaping `=` / `#{}` to the unescaped `!=` / `!{}`. This is safe **only** because
`titleHtml` is produced by the escape-first restricted renderer, whose output contains
no attacker-controllable tags.

## 6. Grammar and spec changes

- **[poem-syntax.ebnf:84](../../poem-syntax.ebnf):** replace `title_line = text_content ;`
  with a new production, e.g.:

  ```
  title_line = { title_char | title_markup } ;
  title_markup = strong | emphasis | strikethrough ;
  ```

  where `strong`, `emphasis`, `strikethrough` reuse the existing definitions but the
  title's `escaped_char` set is restricted to `\* \_ \~ \\` (plus the pre-existing
  `\%` / `\%{` handling, unchanged).

- **Constraint 41** ([poem-syntax.ebnf:888-900](../../poem-syntax.ebnf)): the phrase
  "title_line does not otherwise go through text_with_markup" must be reworded. The
  `\%` decode still happens exactly once, in `parseHeader`; `renderTitleMarkup` must
  **not** re-run `\%`/`\%{` handling, so there is no double-decode. State this
  explicitly.

- **Constraint 39** ([poem-syntax.ebnf:864-874](../../poem-syntax.ebnf)): the reserved
  `\?` error must **not** newly apply to titles. `renderTitleMarkup` recognises only
  its four escapes and leaves `\?` (and any other `\x`) untouched, exactly as titles
  behave today. Note this so titles keep their current lenient escape behaviour.

- **Constraint 40** ([poem-syntax.ebnf:876-886](../../poem-syntax.ebnf)): unchanged —
  the preamble/title boundary and the bare-`%` directive rule are unaffected.

- **[docs/POEM-SYNTAX.md](../POEM-SYNTAX.md):** two places must change, and one must
  not:
  - the **Fields** section's Title bullet (~line 83, currently "any text, may include
    variable references") — document the three markup forms and the `\* \_ \~ \\`
    escapes;
  - the **markup-dialect note** (~line 988, "The **title** does not go through this
    dialect (no emphasis, links, smart quotes …)") — reword to say the title supports
    the restricted em/strong/strikethrough subset only;
  - the **Escaped Characters** `\%`-in-title note (~line 954) stays as-is — that
    behaviour is unchanged.

## 7. Security analysis

The escape-first design closes the injection concern that a naive
`title_line = text_with_markup` swap would have opened:

- Raw HTML in a title (`<script>`, `<img onerror=…>`, `<a href=javascript:…>`) is
  HTML-escaped to inert text before any transform runs — it can never emit a tag.
- The only tags `titleHtml` can contain are `<em>`, `<strong>`, `<s>`. poetic-fiddle
  sanitises the rendered fragment with DOMPurify's **default** configuration
  ([PoemPreview.tsx:73](../../../poetic-fiddle/src/components/PoemPreview.tsx)), which
  already permits all three, so title markup survives the preview unchanged.
- Variable-substitution injection (substitute-then-render) is neutralised because
  escaping happens *after* substitution (§5.3).
- The plain `title` continues to flow to `<title>`, attributes, slugs, OG and Blogger
  unchanged, so none of those contexts gains a new surface.

Net: titles become *strictly no less safe* than today, and safer than body text
(which does pass raw HTML through by design).

## 8. Backward compatibility

Because the subset excludes dashes, smart quotes and entity handling, the only
characters that gain new meaning are `* _ ~ \`. A corpus scan (84 `.poem` files across
`poetic` and `fragments-and-unity`, re-verified 2026-07-19) found:

- **No** title containing `*`, `_`, `~`, or `**` → no title renders unintended markup.
- Apostrophe titles (e.g. `Ruru's First Call`, `Simplicity's Virtue`,
  `Mark's Confession`) are **byte-stable**: the body renderer would turn `'` into
  `&#39;`, but the restricted title renderer leaves `'` alone.
- Hyphenated titles (e.g. `Dimly-Lit Path`) are **byte-stable**: no dash transform.

So the change is zero-regression on the current corpus. The one theoretical break is a
future/imported title that intentionally contains a literal `*`, `_`, or `~`; such an
author now writes `\*`, `\_`, `\~`. This is the same escape authors already use in body
text, and is documented in the spec change.

## 9. Consumer propagation

This is a framework change touching
[render-core.js](../../src/tools/render-core.js), the templates (and generated
`poem-templates.js`), [poem-syntax.ebnf](../../poem-syntax.ebnf) and
[docs/POEM-SYNTAX.md](../POEM-SYNTAX.md); `poem-parser.js` itself is untouched (§5.2).
It reaches consumers only through `scripts/sync-framework.sh`. Note:

- `fragments-and-unity` carries a synced copy of the framework **test suite**, so the
  test updates below duplicate there after a sync.
- poetic-fiddle renders titles via the framework's browser renderer, so title markup
  flows into the live preview automatically once `titleHtml` is emitted — subject to
  DOMPurify's default sanitiser configuration, which already permits
  `<em>/<strong>/<s>` (§7). The fiddle's own
  plain-text assumptions ([SharedPoemView.tsx:30](../../../poetic-fiddle/src/components/SharedPoemView.tsx)
  `escapeHtml(title)` and the OG metadata in
  [share/[share_id]/page.tsx:20](../../../poetic-fiddle/src/app/share/%5Bshare_id%5D/page.tsx))
  keep using the plain title and need **no** change.

## 10. Out of scope / future work

- **Index grid and all-poems listing markup.** Showing `titleHtml` there requires
  threading it through the JSON data island
  ([aggregate-render-core.js:61](../../src/tools/aggregate-render-core.js)) and setting
  `innerHTML` instead of `textContent` ([index.js:71](../../public/index.js)) — a
  larger change deferred to a follow-up.
- **Pre-existing unescaped-title bug.** The all-poems template already interpolates the
  raw title **unescaped** ([aggregate-render-core.js:206,219](../../src/tools/aggregate-render-core.js)),
  inconsistent with the escaped single-poem view. This is independent of this feature
  but should be fixed (escape it, or move to `titleHtml`) — tracked as **TD26071901**
  in [TECH-DEBT.md](../../TECH-DEBT.md).

## 11. Resolved questions

- **Q1 — Analysis headings: keep the `<em>` wrapper, inject `titleHtml` inside it.**
  [_poem-content.pug:194,200,205](../../src/templates/_poem-content.pug) become
  `Analysis of <em>!{titleHtml}</em>`, consistent with the other visible headings and
  with no visible change to existing poems (the wrapper's italics are untouched).
  Accepted quirk: `<em>` nested inside `<em>` renders as plain italic in browsers, so
  a title's `*emphasis*` is visually invisible in these headings — `**strong**` and
  `~strike~` render normally. Decided 2026-07-19.
- **Q2 — Field persistence: render-time only, no YAML change.** `titleHtml` is
  attached in `resolveContextVars()` (§5.3) and never persisted, keeping the YAML
  schema, `poem-to-yaml` output, and golden fixtures stable. Decided 2026-07-19.
- **Q3 — Nesting: confirmed against the body tokeniser**
  ([poem-parser.js:1826-1831](../../src/tools/poem-parser.js)). Cross-delimiter
  nesting works: `**bold _and italic_**` → strong runs first, and the later `_…_`
  pass matches inside the emitted tag's content, giving
  `<strong>bold <em>and italic</em></strong>`. Same-delimiter nesting
  (`**bold *and em* bold**`) degrades — the `[^*]+` content classes cannot span the
  inner marker — but it degrades identically to body text, so the restricted renderer
  matches body behaviour by construction and needs no extra handling. Resolved
  2026-07-19.

## 12. Implementation checklist

- [ ] Add `renderTitleMarkup()` to `render-core.js` (escape-first; em/strong/strike;
      `\* \_ \~ \\` only; no `\%`/`\?` handling).
- [ ] Attach `titleHtml` in `resolveContextVars()` after `applyContextVars` (§5.3).
- [ ] Switch the visible-heading sinks (§5.4) to `!= titleHtml`, including the
      analysis headings' `<em>` wrappers (§11 Q1); regenerate
      `poem-templates.js` (`npm run build:generated`).
- [ ] Update [poem-syntax.ebnf](../../poem-syntax.ebnf) (title_line + constraints 39/40/41).
- [ ] Update [docs/POEM-SYNTAX.md](../POEM-SYNTAX.md) — Fields Title bullet and the
      markup-dialect note (§6); add a `CHANGELOG.md` entry under `[Unreleased]`.
- [ ] Update tests asserting escaped/plain titles: e.g.
      [poem-render.test.js:301](../../test/poem-render.test.js),
      [aggregate-render-core.test.js](../../test/aggregate-render-core.test.js),
      [poem-to-raw.test.js:192](../../test/poem-to-raw.test.js), golden/parity guards;
      add positive tests for em/strong/strike rendering and for `\*` escaping and
      HTML-escaping of `<`/`&` in a title.
- [ ] Update fiddle tests if the derived plain title is unaffected (it should be):
      [poem-title.test.ts](../../../poetic-fiddle/src/lib/poem-title.test.ts).
- [ ] Sync to consumers via `scripts/sync-framework.sh`.
</content>
</invoke>

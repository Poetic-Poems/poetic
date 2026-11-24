# Findings — SEC

**Strengths:** No live secrets found anywhere in the repository or its full commit history
(targeted `git log --all -p` grep plus a working-tree grep turned up only obviously-fake fixture
values, e.g. `test/fixtures/blogger-credentials.json`'s `fixture-client-secret`/
`fixture-refresh-token`); `.gitignore` covers `.blogger-credentials.json` and its atomic-write
temp siblings. `js-yaml`'s `load()` uses the safe schema by default — verified directly
(`yaml.load('a: !!js/function "..."')` throws rather than constructing a function).
`path-guard.js`'s traversal guard (`isWithinRoot`) is symlink-aware (re-resolves via
`fs.realpathSync` after the lexical check), used consistently across all `serve-static.js` call
sites. `serve-static.js` binds to `127.0.0.1` by default and only emits a wildcard CORS header
when explicitly opted into a non-loopback `--host`. `blogger-auth.js`'s OAuth flow uses PKCE
(S256) and CSRF `state` verification on the loopback redirect, masks the client-secret prompt,
and writes credentials atomically at mode 0600 via write-then-rename resisting a pre-planted
symlink (`O_CREAT|O_EXCL`). The previously-flagged `markdown-it` ReDoS advisory (2026-10-27
review's F-SEC-01) is resolved — installed version is `15.0.3`. Issue #305 ("`blogger-auth.js`'s
OAuth redirect wait has no timeout") is confirmed fixed: `AUTH_WAIT_TIMEOUT_MS = 5 * 60_000`
bounds `waitForCode()` (src/tools/blogger-auth.js:60,350-417).

## F-SEC-01 — Transitive `glob`/`minimatch` moderate advisories via `js-beautify` (prod) and `c8`/`eslint` (dev) · Low

**Evidence:** `npm audit` reports 6 moderate advisories: `glob` 9.0.0–14.0.1
(GHSA-3g3m-2fjr-6pw4) and `minimatch` 7.0.0–11.0.0 (GHSA-g3hv-75wg-m249). Paths: `js-beautify` →
`editorconfig` → `glob`/`minimatch` (production dependency, used at
`src/tools/build-all-poems.js:27` and `src/tools/build-poems.js:177`), and `c8`/`eslint` →
`test-exclude`/`glob` (dev only). `npm audit fix --force` would bump `js-beautify` to a breaking
major.

**Impact:** Low. Both packages are reached only through build-time, locally-trusted inputs —
`js-beautify`/`editorconfig` read this repo's own `.editorconfig` and reformat HTML this build
itself generated; no attacker-controlled path or glob pattern reaches either package. `c8`/
`eslint`'s exposure is dev-only.

**Direction:** no urgent action; revisit when a non-breaking `js-beautify` line picks up patched
`editorconfig`/`glob`.

## F-SEC-02 — Poem-body link markup interpolates the URL into `href` unescaped · Low

**Evidence:** `src/tools/poem-markup.js:109`:
`text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="https://$2">$1</a>')` — the captured URL is
inserted into a double-quoted attribute with no attribute-escaping; an unpaired `"` in the URL
survives (paired quotes are already folded to smart-quote entities earlier in
`convertMarkup()`).

**Impact:** Low, and consistent with this codebase's existing documented trust model —
`markdown-it`'s `html: true` is already a deliberate "trusted-single-author" choice, and
`.poem` source is authored/reviewed by that same party. Today's failure mode is a malformed
page from a stray quote, not exploitable XSS, since the author already controls the output HTML
via the same pipeline. Would matter if this framework were ever used with less-trusted poem
contributors.

**Direction:** optional — attribute-escape the URL capture next time `poem-markup.js` is
touched.

## F-SEC-03 — Production dependency set is otherwise clean · Informational

**Evidence:** `npm audit --omit=dev` shows only the `js-beautify`-rooted advisories; `js-yaml`,
`pug`, `markdown-it` carry none.

**Impact:** None — recorded for completeness alongside F-SEC-01.

**Direction:** none needed.

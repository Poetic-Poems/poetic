Poetic v6.1.0

Release date: 2026-07-19

Summary

Minor release adding restricted inline markup in poem titles, browser-safe rendering support, and a batch of security hardening fixes (ReDoS, prototype pollution, XSS, and sanitisation issues) found by CodeQL.

Added

- Restricted inline markup in poem titles: emphasis, strong, and strikethrough, escape-first so a title can never inject a tag (commit 5307b14)
- Browser-safe renderer (`renderPoem`/`renderPoemPage`) exposed via `package.json` exports (commits b204140, c541ae2)
- Browser-safe aggregate renderers (`renderAllPoems`/`renderIndex`) (commit 81f8ce7)
- `scripts/new-poem TITLE` scaffolding command (commit 3ad2c5d)

Changed

- `npm run sync:blogger` and `npm run blogger:auth` now explain Blogger auth failures instead of relaying Google's bare error (commit f8c9376)

Fixed

- All-poems page no longer breaks on titles containing `<`, `&`, or `"` (commit c8d54ff)
- `blogger-auth` no longer fails to overwrite a read-only credentials file (commit 97d8462)
- `renderPoem()`'s fragment now shows the poem's title in standalone use (commit 8fa64ff)
- Blogger themes build again after CSS comments broke the theme's skin variables (commit 3af6a06)
- `convertMarkup()`'s escape restoration is no longer quadratic in the number of escapes (commit 0d3ae9b)
- `sync-framework.sh` uses an optional `SYNC_PAT` so workflow-file syncs no longer fail outright (commit 0ca7c9f)
- `poem-syntax.ebnf`'s preamble grammar now derives comment blocks (commit b56c9cd)

Security

- `poem-parser.js` line-continuation folding no longer risks catastrophic regex backtracking (commit 91ad8ec)
- `blogger-auth.js` no longer echoes credentials in its "Next steps" summary (commit 323f8a3)
- `poem-parser.js` audio (song-service) line matching no longer risks catastrophic regex backtracking (commit 4ce4d40)
- `poem-parser.js` directive-line, label-line, and reserved-`\?`-escape matching no longer risk catastrophic regex backtracking (commit a4dc37d)
- `poem-to-raw.js`'s tag-stripping now runs to a fixed point, closing an incomplete-sanitisation gap (commit 8a295c4)
- `public/index.js`'s poem card rendering no longer builds HTML via `innerHTML` template literals (commit 8e4d6ac)
- `serve-static.js`'s generated directory listing no longer interpolates filenames/paths into HTML unescaped (commit 3eb8bd9)
- `sync-blogger.test.js`'s Suno-link-removal assertion no longer relies on a raw substring check (commit a5f8d96)
- `yaml-to-poem.js`'s entity decoding no longer double-decodes reconstituted entities (commits 9f04966, b1d2986)
- `song-handlers.js`'s `deepMerge`/`loadSongHandlers` no longer risk prototype pollution (commits 714f83b, 7709d94)

Commits included

3294cda docs(tech-debt): group live items under a Current Items heading (#66) (Warwick Allen)
023ce48 docs: remove shipped title inline-markup design doc (#65) (Warwick Allen)
5307b14 feat(render): restricted inline markup in poem titles (#64) (Warwick Allen)
c8d54ff fix(aggregate-render): HTML-escape poem title in all-poems template (#63) (Warwick Allen)
000b9f4 docs: complete title inline-markup design, mark accepted (#62) (Warwick Allen)
8a9dd50 docs: add title inline-markup design doc and log unescaped-title tech debt (#61) (Warwick Allen)
15966ef build(release): pack and publish a release tarball for npm 11+ compatibility (#59) (Warwick Allen)
e8e3136 build(deps): bump actions/setup-node from 6 to 7 (#58) (dependabot[bot])
97d8462 fix(blogger-auth): overwrite read-only credentials file atomically (#57) (Warwick Allen)
c2cdcc8 docs(tech-debt): record blogger-auth's read-only credentials file failure (#56) (Warwick Allen)
f8c9376 feat(blogger): explain auth failures instead of relaying Google's 403 (#55) (Warwick Allen)
8fa64ff fix(browser-render): show poem title in Poetic Fiddle's live preview (#54) (Warwick Allen)
3af6a06 fix(blogger): stop CSS comments breaking the theme's skin variables (#52) (Warwick Allen)
13c1e8e docs(tech-debt): cross-reference the review recommendations R-01 and R-06 (#51) (Warwick Allen)
fae5c4b fix: update project root path in implementation log (#50) (Warwick Allen)
0d3ae9b fix(poem-parser): make convertMarkup escape restoration linear (#49) (Warwick Allen)
7709d94 fix(song-handlers): make deepMerge's prototype-pollution guard CodeQL-recognizable (#48) (Warwick Allen)
b1d2986 fix(yaml-to-poem): make entity decoding a single order-immune pass (#47) (Warwick Allen)
714f83b fix(song-handlers): resolve prototype pollution in deepMerge (#46) (Warwick Allen)
a4dc37d fix(poem-parser): resolve polynomial regex denial of service (#45) (Warwick Allen)
a5f8d96 fix(sync-blogger): resolve incomplete URL substring sanitization in test (#44) (Warwick Allen)
4ce4d40 fix(poem-parser): resolve polynomial regex denial of service (#43) (Warwick Allen)
91ad8ec fix(poem-parser): resolve polynomial regex denial of service (#42) (Warwick Allen)
9f04966 fix(yaml-to-poem): resolve double escaping in entity decoding (#38) (Warwick Allen)
323f8a3 fix(blogger-auth): redact credentials from console output (#41) (Warwick Allen)
3eb8bd9 fix(serve-static): resolve stored XSS in directory listing (#40) (Warwick Allen)
8e4d6ac fix(public/index.js): resolve DOM XSS in poem card rendering (#39) (Warwick Allen)
8a295c4 fix(poem-to-raw): resolve incomplete multi-character sanitization (#37) (Warwick Allen)

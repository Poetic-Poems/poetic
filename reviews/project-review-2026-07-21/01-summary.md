# Summary

## What this project is

Poetic is a Node.js framework — not a poem collection — for authoring poems in a plain-text
`.poem` format, converting them to a YAML intermediate representation, and rendering them to
HTML via a Pug template for publication on GitHub Pages, with optional syncing to Blogger.
Consumer repositories (e.g. "Fragments & Unity") pull the framework's build scripts, templates,
and editor tooling in via `scripts/sync-framework.sh`, pinning a version with `.poetic-version`;
poem source files themselves are never touched by that sync.

The stack is plain CommonJS Node.js (>=18 per `package.json`, though see F-DEPS-02), with four
runtime dependencies (`js-yaml`, `markdown-it`, `pug`, `js-beautify`) and ESLint as the sole dev
dependency. The codebase is compact — roughly 380 KB across 28 hand-written-plus-generated files
in `src/tools/`, plus a filesystem-free "core" shared between the Node build path and a browser
bundle (`src/browser/`, published as the `poetic/browser` export). It is an actively developed,
solo-maintained project (100% of human commit history traces to one person, working partly
through AI coding agents under an elaborate documented multi-agent workflow) at v6.1.1, with two
prior full project reviews (2026-07-07, 2026-07-11) both substantially remediated.

## Overall assessment

The project is in good and improving health. Since the 2026-07-11 review, 93 commits landed,
including a sustained, disciplined wave of real security fixes (XSS, ReDoS, prototype
pollution, sanitization, credential handling) driven by CodeQL — all 13 historical CodeQL
alerts are confirmed `state: fixed` via the GitHub API, not just marked resolved in
`TECH-DEBT.md`, and this review's own checks (`npm audit`, a full `git log` secret scan) came
back clean. The build pipeline, test suite (493 tests, all passing), linting, and
trailing-whitespace gate all pass cleanly on a fresh clone. Architecturally the project is
unusually disciplined for its size: a genuinely clean, cycle-free core/build/browser layering,
verified — not merely claimed — by a byte-for-byte parity test between the Node and browser
render paths.

Against that strength, this review's most important findings are almost all in documentation and
process rather than in the shipped code path a poem author actually exercises day to day.
`docs/BUILD.md` describes a superseded implementation and contradicts itself on a filename in two
more places; `docs/QUICKSTART-VIM.md`'s very first command is broken. Both are Critical/High
purely because a reader following them literally hits a wall or a wrong mental model, not
because anything is exploitable. The one governance finding of real substance — that the
project's sole enforced review gate is satisfied by the maintainer approving their own PR from a
second account — is worth naming plainly rather than leaving implicit, since the codebase's
elaborate branch-protection apparatus otherwise reads as stronger than it is. Two further
findings sit closer to the code: a live keyboard-accessibility gap in the postscript toggle
(the same defect class the last review fixed elsewhere), and `yaml-to-poem.js`, the
YAML-to-`.poem` reverse-conversion tool, silently dropping several data shapes that
`poem-to-yaml.js` now produces — a real but narrow-blast-radius seam-consistency gap in a tool
that isn't on the main build path. No Critical or High finding touches security, data handling,
or the core `.poem`-to-HTML pipeline that matters most for this project's actual purpose.

## Headline strengths

- All 13 historical CodeQL security alerts are confirmed genuinely fixed (via the GitHub API,
  not just `TECH-DEBT.md`'s own record), and `npm audit` plus a full git-history secret scan came
  back clean [F-SEC].
- The Node/browser renderer duplication is architecturally sound and actually verified: a
  dedicated test asserts byte-for-byte parity between the two render paths and that the browser
  bundle never touches the filesystem [strengths, ARCH].
- The incremental-build system (`needs-rebuild.js`) is correct, well-tested, and keeps builds
  fast regardless of collection size, with the one previously-fixed quadratic hotspot
  (`convertMarkup`'s escape restoration) re-verified as still linear [strengths, PERF].
- `docs/BLOGGER.md`'s troubleshooting section and `sync-blogger.js`'s failure-diagnosis code are
  an unusually strong operational pairing for a project this size [strengths, OPS].
- The dual-licence scheme (MIT for framework code, a documented CC menu for poem content) is
  deliberate, consistent, and clearly explained to consumers [strengths, GOV].
- Vim syntax support is a genuine, currently-maintained differentiator, and the documented
  newcomer setup path was verified to work end to end on a fresh clone [strengths, TOOL].

## Headline risks

- `docs/BUILD.md` describes a superseded build implementation and contains two further internal
  filename contradictions, risking a maintainer or agent debugging against the wrong mental model
  [F-DOC-01, F-DOC-02, F-DOC-04].
- `docs/QUICKSTART-VIM.md`'s documented "30-second" install references a `vim/` path that doesn't
  exist in this repo [F-DOC-03].
- The postscript "See more" toggle cannot be reached or activated by keyboard, a live WCAG 2.1.1
  violation of the same class the last review fixed elsewhere [F-UX-01].
- The one enforced code-review gate on `main` is satisfied by the maintainer's own second GitHub
  account, so no independent review currently stands between an agent-authored change and `main`
  [F-GOV-01], compounded by a 100%-single-person bus factor with no succession plan [F-GOV-02].
- `yaml-to-poem.js` silently drops audio-embed parameters, mixed-content segments, and all
  labels/directives on a YAML→`.poem` round trip, with no test at the level that would catch it
  [F-ARCH-01].
- Three root-level `RELEASE_NOTES_*.md` files duplicate `CHANGELOG.md` and already contradict the
  project's own "changelog is the only place" documentation policy after only two releases
  [F-CI-01, F-GOV-03, F-DOC-05].

## Scope and method

**Revision reviewed:** `4dfacac` (`main`, v6.1.1 + 0 commits — reviewed at tip), in a fresh clone
separate from any shared working copy, per this repo's own multi-agent-safety convention.

**Coverage:** All 13 review-checklist dimensions were covered; none were judged wholly
inapplicable, though OPS/DATA were judged to have a genuinely small surface for this project
(a batch CLI tool, not a running service) and that judgement is recorded explicitly in their
findings rather than stretched for content. Core modules were read in full rather than sampled,
given the project's manageable size (~380 KB of hand-written tool code): `poem-parser.js`,
`poem-to-yaml.js`, `yaml-to-poem.js`, `poem-render.js`, `build-poems.js`, `build-all-poems.js`,
`aggregate-render-core.js`, `render-core.js`, `serve-static.js`, `sync-blogger.js`,
`blogger-auth.js`, `song-handlers.js`, `poetic-config.js`, `path-guard.js`, all of `src/browser/`,
and all six GitHub Actions workflows. Generated files (`song-handlers-data.js`,
`poem-templates.js`) were judged only by their generators' correctness, not their output style.
All 29 test files and all 10 files under `docs/` were read.

**Automated checks run (all against a clean `npm ci`, Node v22 in CI / v26.5 locally):**
`npm test` (493 tests, 489 pass, 4 skipped — vim not installed in the review sandbox), `npm run
lint`, `npm run check` (trailing whitespace, 153/153 clean), `npm run build` +
`npm run check:build`, `npm audit` (both `--omit=dev` and full — 0 vulnerabilities both times),
a full `git log --all -p` scan for common secret patterns, `gh api` queries against the live
GitHub repository (branch ruleset, collaborators, CodeQL alert states, PR review timestamps,
milestones), and `npm view`/`npm outdated` against the npm registry for dependency-recency and
licence checks. The documented newcomer setup path (clone → `npm install` → `scripts/new-poem`
→ `scripts/sync-framework.sh` → `npm start`) was traced live in a separate scratch clone.

**Not covered / limitations:** No load testing or performance benchmarking was run (judged
disproportionate for a static-site batch-build tool at its current scale — see F-PERF-03). No
axe or other automated accessibility scanner was run against generated HTML; the accessibility
findings in this review (F-UX-01, F-UX-02, F-UX-03) come from manual code/CSS inspection, which
typically catches a different, narrower slice of issues than automated tooling and should not
be read as an exhaustive accessibility audit. The Blogger sync path's live behaviour against the
real Blogger API was not exercised (no credentials available in this sandbox); its review rests
on reading `sync-blogger.js`/`blogger-auth.js` and their tests rather than a live sync.

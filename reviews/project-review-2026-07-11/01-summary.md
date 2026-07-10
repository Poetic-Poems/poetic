# Summary

## What this project is

Poetic is a Node.js framework for writing poems in a plain-text `.poem` format, building them
to a static HTML site, and publishing to GitHub Pages and (optionally) a Blogger blog. This
repository is the **framework/provider**: separate consumer repositories (the author's
fragments-and-unity site is the live example) pull framework files via
`scripts/sync-framework.sh`, pinned to tagged releases through a `.poetic-version` file with a
releases/main channel model.

The stack is deliberately small: CommonJS Node tools (≈6,250 lines across 19 files in
`src/tools/`), Pug templates, four runtime dependencies (js-beautify, js-yaml, markdown-it,
pug), bash helper scripts, first-class Vim integration, and four GitHub Actions workflows. It
is a single-author project (123 commits, all by Warwick Allen) under very active development —
v5.1.0 was released the day before this review, and the last commit landed minutes before it
began. Despite the solo authorship it has the release discipline of a much larger project:
SemVer tags, a Keep-a-Changelog `CHANGELOG.md`, Conventional Commits enforced by a hook, and a
working tech-debt register protocol.

## Overall assessment

The project is in good health, and markedly better than at its previous review four days
earlier: the dependency vulnerabilities are gone (`npm audit` is clean), the tests are now
hermetic, the build scripts anchor on the repository root instead of the working directory, and
the consistency checks recommended then now exist and run in CI. The engineering culture —
evidence in the code comments, golden tests with regeneration instructions, declarative
extension points, disciplined changelog — is a genuine asset.

Two things rise above everything else. First, the project has **no licence**: for a framework
whose whole model is other people copying its files into their own repositories, that leaves
every consumer without a legal basis to do so, and it costs one file to fix. Second, the
consumer site name **"Fragments & Unity" is hard-coded** into the generated `all-poems.html`
and the default `index.html`; because generated HTML is gitignored and rebuilt in CI, any
consumer other than the author's own site deploys pages carrying the wrong site name — the one
place where the framework's provider/consumer separation actually fails. Below those, a small
cluster of medium findings share one theme: parts of the pipeline degrade silently (a poem that
fails conversion is quietly dropped from the deployed site) or have drifted where nothing tests
the seam (the two Blogger tools disagree on the credentials-file format, so the local
file-based flow is broken end-to-end).

## Headline strengths

- One canonical parser backs every output (YAML, HTML, plain-text raw), so variable and markup semantics cannot drift between pipelines (`src/tools/poem-to-yaml.js`).
- The song-handler system is declarative end-to-end — adding a music service needs YAML and CSS, never framework code — with documented deep-merge override semantics (`src/song-handlers.yaml`).
- 292 fast, dependency-free tests including golden-file tests and real Vim syntax tests that CI provisions Vim to run.
- Security posture fits the threat model and is documented as a decision, not an accident: no secrets anywhere in history, clean audit, least-privilege workflows, lazy-loaded embeds that keep third-party trackers off the page until clicked.
- `scripts/sync-framework.sh` is an unusually careful updater: it syncs itself first and re-execs, documents its CI auth workaround, respects local overrides, and writes an upstream-change summary into the commit.
- Documentation is comprehensive and, on spot-checking, accurate — the quick start works exactly as written.

## Headline risks

- No licence file or `license` field anywhere, while the README invites template use and contributions [F-GOV-01].
- Every consumer's generated pages are titled "Fragments & Unity" — there is no site-name config key [F-ARCH-01].
- A `.poem` file that fails conversion exits 0 and the site deploys without that poem, visible only in CI logs [F-ARCH-02].
- The local Blogger credential flow is broken: the auth helper writes a JSON shape the sync tool cannot read, and no test covers the seam [F-CODE-06, F-TEST-02].
- ~370 lines of client-side JavaScript live inside server-side template literals, untested and unlintable, including a fragile regex that patches previously built pages [F-CODE-01, F-TEST-01].
- `package.json` has no name, version, licence, or engines metadata and is synced verbatim to consumers [F-DEPS-01].

## Scope and method

Reviewed at commit `55863e5` (main, v5.1.0 plus two commits) on 2026-07-11, in the working
repository with full shell access. The core was read exhaustively: the parser
(`poem-to-yaml.js` in full), both HTML generators, the render model, song handlers, the three
Blogger tools, the dev server, all shell scripts including `sync-framework.sh`, all four
workflows, the Pug templates, `public/poetic.js`, and the builtin handler registry. Sampled
rather than exhaustive: the test suite (about half read closely, all executed), the Vim syntax
files (tests and structure checked, Vimscript not line-audited), `yaml-to-poem.js` and
`build-blogger.js` (skimmed; both are tested), and the nine docs (inventoried, with
spot-checks of README quick-start, the config reference against `poetic-config.js`, and the
CHANGELOG against the v5.1.0 diff).

Automated checks run: `npm test` (292/292 pass, 1.7 s), `npm audit` (0 vulnerabilities),
`npm outdated`, `npm run check` (whitespace, clean), `npm run build` and `npm run check:build`
(pass), a repo-wide and git-history secrets scan (clean — the one credentials-named fixture
contains dummy values), and TODO/FIXME marker counts (zero). All thirteen review dimensions
were assessed; data handling (DATA) yielded no rated findings and observability (OPS) applies
only in reduced form to a build-time tool, both recorded explicitly in the findings document.
The previous review (`reviews/project-review-2026-07-07`) was read and its findings re-verified
rather than re-reported: of its five, three are resolved, one is partially resolved
(path anchoring, residue noted in F-ARCH-04), and one (build robustness) is superseded by the
more specific F-ARCH-02.

# Findings — ARCH

**Strengths:** The `.poem`→YAML→HTML pipeline and the Node/browser renderer seam are both
genuinely single-sourced rather than parallel reimplementations — `src/browser/render.js` and
`render-aggregate.js` import the exact same `render-core.js`/`aggregate-render-core.js` helpers
`poem-render.js`/`build-all-poems.js` use, and both seams carry explicit round-trip/parity tests
(`test/browser-render.test.js`, `test/browser-render-aggregate.test.js`,
`test/yaml-to-poem-roundtrip.test.js`, `test/golden.test.js`) rather than relying on each side's
own assumptions about the other. `npx madge --circular src/` finds zero circular dependencies
across the 36 `src/tools`/`src/browser` modules, and since the last cycle the previously
three-different-ways staleness logic has been consolidated into one shared `needs-rebuild.js`
used identically by `poem-to-yaml.js`, `build-poems.js` and `build-all-poems.js`, and the
previously-duplicated `--help` handling now goes through one shared `cli-help.js` across all 12
CLI entry points — both are architectural improvements over the prior cycle, not regressions.

## F-ARCH-01 — `PoemParser` is a single god-object class spanning eight unrelated parsing concerns · Low

**Evidence:** `src/tools/poem-parser.js` is one 1652-line, 40-method class (`class PoemParser` at
line 49) that owns comment/continuation preprocessing (`removeCommentBlocks`,
`joinContinuedLines`), variable substitution (`processVariables`, `substituteVariables`), a
hand-rolled shell-word scanner (`scanShellWord`, the file's longest method at 123 lines),
header/version/segment parsing (`parseHeader`, `parseVersions`, `parseSegment`), audio-param
parsing (`parseAudioParams`, `matchAudioLine`, `parseAudio`), postscript parsing
(`parsePostscriptNote`, 108 lines), analysis parsing (`parseAnalysis`, `parseAnalysisContent`),
and metadata/directive parsing (`parseMetadata`, `parseDirectiveLine`) — eight largely
independent sub-grammars sharing one `this` and one lexer cursor (`peek`/`next`/`eof` at
lines 623-641).

**Impact:** For this project specifically, the cost shows up at the point named in the prior
cycle's F-ARCH-04: every new `.poem` syntax feature (a new section type, a new audio param) has
nowhere to land except inside this one class, growing an already-large blast radius rather than
adding a new unit with its own boundary. The risk is bounded today by the project's own
maturity — round-trip and golden-file tests (`test/yaml-to-poem-roundtrip.test.js`,
`test/golden.test.js`, `test/poem-to-yaml*.test.js`) exercise the class thoroughly, so the
complexity is a maintainability tax rather than a live correctness risk; this is why the finding
stays Low rather than Medium despite the line count.

**Direction:** If another sub-grammar is added, consider extracting the already-separable
pieces (shell-word scanning, audio-param parsing) into standalone, independently-testable
helper modules the class composes, rather than growing the method count further.

## F-ARCH-02 — `serve-static.js`'s HTTP request handler remains a single ~180-line function covering every route · Low

**Evidence:** `createServer()` in `src/tools/serve-static.js` (line 219) wraps one
`http.createServer((req, res) => { ... })` callback (line 234) that runs to line ~400 — roughly
180 lines handling `/all-poems`, directory listing, static file serving and error paths all in
one `try` block, unchanged in shape from the prior review cycle's corresponding finding.

**Impact:** This is a local dev tool, not a production service, so the blast radius of a bug
here is limited to the author's own `npm start` session; severity stays Low. The persistent
shape (same finding, same file, prior cycle to this one) means it has not drifted further, but
a new route (e.g. a future API endpoint) would most naturally be added as one more branch in the
same function rather than a new unit.

**Direction:** Extract each route's body (the `/all-poems` branch, the directory-listing branch,
the static-file branch) into a named function the callback dispatches to, if another route is
ever added.

## F-ARCH-03 — No ADRs; design rationale lives in code comments and `AGENTS.md`/`docs/` prose rather than a dedicated decision log · Informational

**Evidence:** No `docs/adr/` or similarly-named directory exists (`find . -iname "*adr*"` returns
nothing outside `node_modules`). Design decisions that would typically warrant an ADR — e.g. the
browser/Node renderer split's filesystem-free contract (`docs/RENDERER-BROWSER.md`), the
needs-rebuild staleness model (`src/tools/needs-rebuild.js`'s own header comment), the
self-review branch-protection model (`AGENTS.md`'s "Branch protection in this repository"
section) — are instead documented inline at the point of use.

**Impact:** For a single-maintainer framework repo this is proportionate rather than a gap: the
docs above are current, specific, and co-located with the code they describe, and this same
observation has recurred across prior review cycles without the project adopting (or needing)
a separate ADR directory. Recorded here only because the checklist asks the question directly;
not actionable.

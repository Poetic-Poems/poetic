# Findings — CODE

**Strengths:** `eslint.config.js` is actively maintained rather than a boilerplate drop-in — its
header comments explain *why* each relaxed rule exists (e.g. `eqeqeq: smart` for the codebase's
`!= null` idiom, `no-constant-condition` ignoring loops for a documented `while (true) { break }`
pattern) and it is clean on `npm run lint`. Error handling at I/O boundaries is consistently
either logged (`console.warn`/`console.error` with the underlying message, e.g.
`build-all-poems.js:103-105`, `blogger-auth.js:558-560`) or accompanied by a comment explaining
why a catch is intentionally silent (e.g. `build-blogger.js:81-83`, `poem-parser.js:1448-1450`);
there are no genuinely bare/swallowed catches. `grep -rn "TODO\|FIXME\|HACK" src/ scripts/`
returns zero hits — self-reported shortcuts are tracked as GitHub issues per `AGENTS.md`'s
tech-debt policy instead of accumulating as inline markers.

## F-CODE-01 — `poem-parser.js` remains the project's largest and most complex file; its longest method is 123 lines · Medium

**Evidence:** `src/tools/poem-parser.js` is 1652 lines across 40 methods on one class. The
longest methods: `scanShellWord` (123 lines, starting line 333), `parsePostscriptNote` (108
lines, line 1320), `processVariables` (103 lines, line 511), `parseSegment` (94 lines, line 937),
`joinContinuedLines` (76 lines, line 176), `processWysiwygLines` (74 lines, line 1031). This is
unchanged in scale from the prior review cycle (same file, same approximate line count).

**Impact:** A 100+-line method mixes multiple decision branches in one scope, raising the cost
of a correct edit (easy to fix one branch and silently break an unrelated one a few dozen lines
away) and of review (a diff against a 123-line method is harder to reason about locally than one
against a 20-line method). Mitigated in practice by the extensive round-trip/golden-file test
suite (`test/yaml-to-poem-roundtrip.test.js`, `test/golden.test.js`,
`test/poem-to-yaml*.test.js`), which would catch most regressions even without a diff review
catching them first — kept at Medium rather than High because of that safety net, and because
the file's own risk has not grown since the last review (no regression, just no improvement).

**Direction:** No action required unless another `.poem` syntax feature is added; at that point,
extract the new feature's parsing into a standalone helper rather than another `PoemParser`
method (see F-ARCH-01 for the structural framing of the same file).

## F-CODE-02 — `sync-blogger.js`'s `explainBloggerFailure` is a 126-line string catalog with deep conditional nesting · Low

**Evidence:** `explainBloggerFailure({ operation, status, body, blogId, access })` in
`src/tools/sync-blogger.js` (line 632) runs 126 lines, branching on `operation`/`status`/`body`
combinations to assemble a human-readable diagnostic message per failure mode (e.g. the
`status === 401`/`403` branches around lines 650-660 nest an inner `if` on `access` inside the
outer `if` on `status`).

**Impact:** The function is pure (string in, string out) and isolated — no state, no I/O — so
its size is lower-risk than a method of equivalent length embedded in a stateful class; this is
why it stays Low. The risk is purely in diagnosing a wrong message for a given failure: adding a
new Blogger API failure mode means finding the right spot in an already-126-line cascade rather
than adding a new case to a lookup table.

**Direction:** If another failure mode is added, consider restructuring as a table of
`{ match(operation, status, body) => message }` entries rather than growing the `if`/`else`
cascade further.

## F-CODE-03 — Type discipline is JSDoc-only, applied selectively rather than uniformly, with no `@ts-check` anywhere · Informational

**Evidence:** `grep -rl "@ts-check" src/` returns nothing — there is no `@ts-check` anywhere in
the codebase, and no `tsconfig.json`/`jsconfig.json` type-checks JS via JSDoc in CI. JSDoc itself
is used heavily in the largest/most complex files (`sync-blogger.js`: 94 `@param`/`@returns`
tags; `poem-parser.js`: 52; `build-all-poems.js`: 33) but is entirely absent from several small
utility modules (`html-escape.js`, `slugify.js`, `repo-root.js`, `markdown.js`,
`poem-parse-errors.js`, `render-core.js` — all 0 `@param`/`@returns` tags).

**Impact:** For this project's scale this reads as a deliberate, reasonable choice (JSDoc effort
scales with a file's own complexity, not applied as a blanket mandate) rather than drift —
`render-core.js` in particular is the shared seam between the Node and browser renderers (see
ARCH findings) and would arguably benefit from doc coverage proportionate to that role, but
nothing here is incorrect or inconsistent enough to rate above Informational.

**Direction:** Optional: add `@param`/`@returns` JSDoc to `render-core.js`'s exports
(`resolveContextVars`, `songsFor`, `postscriptPreviewSettings`, `processAnalysisText`) given its
role as the shared contract both renderer paths depend on.

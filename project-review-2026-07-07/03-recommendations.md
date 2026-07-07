# Recommendations

## R-01 — Make the test suite hermetic
- Priority: High
- Severity: Medium
- Effort: Medium
- Finding IDs: F-TEST-01
- Description: Refactor the affected tests so they no longer depend on ambient `.shared.poem` and `.blogger-credentials.json` files from the current working directory. The goal is for the parser and config helpers to receive explicit inputs, so the test suite behaves the same in the framework repo and in downstream consumer repos.

## R-02 — Update transitive dependencies to remove known vulnerabilities
- Priority: High
- Severity: Medium
- Effort: Medium
- Finding IDs: F-SEC-01
- Description: Run the dependency update path that removes the vulnerable packages exposed by `npm audit`, then re-run the test suite and build to confirm no regressions. This is a good candidate for a small maintenance sprint because the direct API surface is limited and the impact is broad.

## R-03 — Reduce path and environment assumptions in the build entry points
- Priority: Medium
- Severity: Low
- Effort: Medium
- Finding IDs: F-ARCH-01, F-DX-01
- Description: Make the core build scripts resolve paths relative to the repository root or to the source file being processed rather than relying implicitly on `process.cwd()`. This will make the pipeline easier to invoke from different contexts and reduce surprises in CI and consumer repos.

## R-04 — Add lightweight automation for consistency checks
- Priority: Medium
- Severity: Low
- Effort: Small
- Finding IDs: F-DOC-01
- Description: Add a simple pre-commit or CI check for obvious project hygiene, such as trailing whitespace, missing generated artefacts, or basic script execution. The aim is not to over-engineer the toolchain, but to make it easier to keep the project conventions intact as it evolves.

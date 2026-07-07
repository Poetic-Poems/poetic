# Improvement prompts

## Prompt 1 — Make the test suite hermetic
Run this prompt in a fresh agent session for the repository at the path of this project.

You are improving the Poetic framework repository. The current issue is that several tests are not hermetic: they depend on ambient files such as `.shared.poem` and `.blogger-credentials.json` from the current working directory, which makes them pass here but fail in a clean consumer checkout. Your task is to make those tests deterministic and explicit.

### What to change
- Inspect the affected tests and the helper functions they exercise in [src/tools/poem-to-yaml.js](src/tools/poem-to-yaml.js) and [src/tools/sync-blogger.js](src/tools/sync-blogger.js).
- Make the code accept explicit test inputs rather than implicitly reading repository-local or CWD state.
- Keep the public behaviour unchanged for real users; only the testability and portability should improve.

### Acceptance criteria
- The relevant tests pass without relying on ambient files outside the test fixture.
- The behaviour of the production code remains unchanged for ordinary usage.
- The updated tests clearly document the intended input and expected output.

### Verification
- Run `npm test` and confirm the suite still passes.
- If you change config-loading behaviour, add or update the corresponding tests to cover the new explicit-input path.

## Prompt 2 — Update the dependency tree to remove known vulnerabilities
Work on the Poetic framework repository to reduce the number of known vulnerabilities reported by the package manager.

### What to change
- Review the vulnerable packages surfaced by `npm audit --omit=dev`.
- Upgrade the relevant dependencies in [package.json](package.json) and refresh the lockfile as needed.
- Prefer minimal, targeted changes that preserve the current public behaviour.

### Acceptance criteria
- `npm audit --omit=dev` reports fewer vulnerabilities than before, ideally none at the current supported dependency set.
- The project still builds and tests successfully after the dependency changes.

### Verification
- Run `npm test`.
- Run `npm run build`.
- Re-run `npm audit --omit=dev` and report the resulting vulnerability count.

## Prompt 3 — Make the build entry points less dependent on the current working directory
Improve the build pipeline so it is less brittle about its execution context.

### What to change
- Review [src/tools/build-poems.js](src/tools/build-poems.js), [src/tools/poem-to-yaml.js](src/tools/poem-to-yaml.js), and related helpers for assumptions about `process.cwd()`.
- Resolve paths relative to the repository root or the relevant source file instead of assuming a single working directory.
- Keep the change scoped to robustness and maintainability rather than changing the visible output format unless necessary.

### Acceptance criteria
- The build scripts behave predictably when invoked from a normal repository checkout and from common CI contexts.
- The code still generates the expected output files.

### Verification
- Run `npm run build` and confirm the expected HTML and YAML artefacts are created.
- Add or update a small regression test if the path-handling logic is covered by tests.

## Prompt 4 — Add a lightweight consistency check for future maintenance
Add a simple automated guardrail for the framework repository so that basic conventions are less likely to drift.

### What to change
- Add a lightweight quality check, preferably in CI or as a simple npm script, that covers one or two low-cost checks such as trailing whitespace, required generated artefacts, or a basic build smoke test.
- Keep the solution simple and cheap to maintain.

### Acceptance criteria
- The repository has a repeatable check that can be run locally and in CI.
- The check is documented in the relevant developer docs.

### Verification
- Run the new check locally and confirm it passes.
- If the check is wired into CI, mention the workflow file that now includes it.

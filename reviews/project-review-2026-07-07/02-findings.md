# Findings

## Architecture and design

### F-ARCH-01 — The framework is well-structured, but the build entry points still assume a single, framework-owned repo layout
- Severity: Medium
- Evidence: The build pipeline in [src/tools/build-poems.js](src/tools/build-poems.js) and [src/tools/poem-to-yaml.js](src/tools/poem-to-yaml.js) uses hard-coded paths such as `src/poems/poem`, `src/poems/yaml`, and `public/` relative to the current working directory. The sync workflow in [scripts/sync-framework.sh](scripts/sync-framework.sh) also assumes a fixed set of framework-owned paths.
- Impact: This is workable for the current framework repo and its consumer repos, but it makes the project more brittle to structural changes and reduces portability for future variants.

## Testing and quality assurance

### F-TEST-01 — Several tests are not hermetic and depend on ambient consumer-owned files
- Severity: Medium
- Evidence: The existing tech-debt note already records this issue in [TECH-DEBT.md](TECH-DEBT.md). The parser in [src/tools/poem-to-yaml.js](src/tools/poem-to-yaml.js) prepends a repository-local `.shared.poem` file when present, and the Blogger config logic in [src/tools/sync-blogger.js](src/tools/sync-blogger.js) falls back to a `.blogger-credentials.json` file in the current working directory. That behaviour makes tests sensitive to local state rather than the explicit inputs they pass.
- Impact: Tests can pass in this repo while failing in a clean consumer checkout, which undermines confidence in the framework when it is synced elsewhere.

## Security and supply chain

### F-SEC-01 — The dependency tree contains known vulnerabilities
- Severity: Medium
- Evidence: Running `npm audit --omit=dev` reported 6 vulnerabilities, including 4 high-severity issues in transitive packages such as `glob`, `minimatch`, and `js-cookie`.
- Impact: Downstream repos that install these dependencies inherit the risk, even if the project’s direct runtime surface is small.

## Tooling and developer experience

### F-DX-01 — The build command succeeds in the framework repo, but the build output is sensitive to the current working directory and repo state
- Severity: Low
- Evidence: The build script in [src/tools/build-poems.js](src/tools/build-poems.js) reads from `process.cwd()` and the build command in [package.json](package.json) depends on the expected folder layout. A local verification run produced a warning that no YAML files were found in `src/poems/yaml` in this repository after the initial build step, even though the repo contains example YAML fixtures under the same path. That indicates the pipeline’s assumptions around generated artefacts are somewhat brittle.
- Impact: The experience is still usable, but it can be confusing when a build runs from a slightly different context or when generated files are missing or stale.

## Documentation and project health

### F-DOC-01 — The docs are strong, but the framework still relies on a few conventions that are not enforced by automation
- Severity: Low
- Evidence: The docs in [README.md](README.md), [docs/BUILD.md](docs/BUILD.md), and [docs/SCRIPTS.md](docs/SCRIPTS.md) describe the intended workflow clearly, but the repository does not appear to enforce consistency through linting, formatting, or a pre-commit hook.
- Impact: Documentation quality is high, but the project has to rely on human discipline to keep conventions consistent across future changes.

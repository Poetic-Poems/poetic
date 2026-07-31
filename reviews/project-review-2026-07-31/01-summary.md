# Summary

## What this project is

Poetic is a Node.js (>=22) framework for authoring poems in a custom `.poem` plain-text format, converting them to YAML, and rendering them to static HTML via a Pug template, for publication to GitHub Pages and, optionally, a Blogger blog. It is a single-maintainer, MIT-licensed framework repository — poem *collections* are separate consumer repositories that pull framework files in via `scripts/sync-framework.sh`, so this repo's own `src/poems/` holds only example/test poems, not real content.

The codebase is medium-sized (~9,900 lines of source, matched almost 1:1 by ~9,450 lines of test) and mature: this is its fifth full project review, following four prior reviews (2026-07-07, -11, -21, -26) that between them raised, tracked, and resolved 66 tech-debt items, most within a day or two of being filed. The tooling reflects that maturity — a per-item tech-debt register with its own CI-gated consistency checker, license-compatibility and accessibility checks, Dependabot, CodeQL, and a squash-only branch-protection ruleset with required status checks.

## Overall assessment

Poetic remains in strong health. Every automated gate re-run from scratch this session passed cleanly: 672 tests (668 pass, 4 deliberately skipped), lint, `npm audit` (0 vulnerabilities), the whitespace gate, the licence-compatibility check, the tech-debt register's own consistency checker, and a full build — with coverage at 83.28% lines against an 80% CI-enforced floor. The 24 commits landed since the last review (2026-07-26) continue a genuine pattern of same-day-to-few-day tech-debt resolution, and several of that review's own findings (the `sync-blogger.js` complexity hot-spot, an inline-`onclick` template violation, XSS/path-containment fixes) are confirmed fully resolved by this review's independent re-verification rather than taken on trust.

The single most important thing to act on is not a defect in the product but in the process meant to track defects: `TECH-DEBT.md`'s own register has drifted from reality. `TD26072604` — "changelog-check missing from the branch ruleset's required status checks" — is still marked `open`, but the live GitHub ruleset has included that check (and a newer one, `register`) since 2026-07-28, applied out-of-band by the maintainer and never reflected back into the register (F-CI-01). A stale root-level file, `RULESET-CHANGELOG-CHECK.md`, compounds the confusion by narrating the fix as already done. This review corrects the register entry directly and files a new tech-debt item for the underlying gap — the register's consistency gate checks its own internal bookkeeping, but has no way to detect drift against live GitHub state.

Beyond that, this review found a real but narrow dead-code bug (`yaml-to-poem.js --all` silently converts zero files because it looks in the wrong directory — F-ARCH-01), two coverage gaps in code that would benefit from the same test-extraction pattern already applied elsewhere in this codebase (`build-blogger.js`'s orchestration, and a flaky-test-fix pattern not yet extended to one more test file), a genuine WCAG AA contrast regression-of-omission in `.back-to-top` that the earlier site-wide contrast fix missed, and a README example that does not round-trip as written. None of these are severe; all are concrete and independently verified, and several (the register drift, the dead-code bug) are the kind of finding that only surfaces from re-verifying claims against current reality rather than trusting prior reviews or commit messages.

## Headline strengths

- Every automated check re-run this session — tests, lint, audit, coverage, licences, whitespace, tech-debt register consistency, and the build — passed cleanly from a fresh `npm ci`, not merely "configured to look green."
- The "extract pure logic, export it, unit-test it, leave a thin CLI entry" convention introduced for `sync-blogger.js`'s `main()` in the last review has been mechanically and correctly repeated for `poem-to-yaml.js` and `poem-to-raw.js`'s `--all` orchestration this window.
- Security posture is solid: no live secrets anywhere in the repo or its history, a textbook PKCE+CSRF OAuth flow in `blogger-auth.js`, masked credential prompts, 0600 atomic credential writes, and 0 dependency vulnerabilities.
- Four dimensions — performance, observability, data handling, and (mostly) governance — are judged proportionately light for a CLI build tool and are genuinely clean, not merely unexamined.
- Accessibility work continues in good faith: `<main>`/`<header>` landmarks and a non-blocking automated `npm run a11y` check landed since the last review, and every interactive control sampled is a real, natively keyboard-operable `<button>`.

## Headline risks

- The tech-debt register itself is stale on one High-severity item, undermining the "trustworthy source of what's still open" role it exists to serve [F-CI-01].
- `yaml-to-poem.js --all` is dead code — it silently converts zero files due to a stale directory path, the one CLI entry point the last review's own test-coverage initiative didn't reach [F-ARCH-01, F-CODE-02].
- `build-blogger.js`'s file-read/write orchestration — including its security-relevant path-containment check — is invoked from no test and no CI job [F-TEST-02].
- `.back-to-top`'s white-on-`#007AFF` styling reproduces the exact WCAG AA contrast failure a dedicated prior PR fixed everywhere else [F-UX-02].
- README's documented YAML round-trip example fails on its third command as written, because the first command's output lands in a different directory than the third expects [F-DOC-01].

## Scope and method

This is the fifth full review of this repository. Given four prior thorough reviews and a same-day-to-few-day tech-debt-resolution culture, this review's strategy was to (a) re-run every automated gate from scratch rather than trust prior results, (b) read the full diff and every commit since the last review (2026-07-26, commit `700123a`, 24 commits) closely, verifying current file contents rather than commit-message summaries, and (c) sample previously-reviewed, unchanged code rather than re-reading it line-by-line, treating prior findings as accurate unless this session's evidence contradicted them — which it did once, materially (F-CI-01).

All thirteen checklist dimensions were covered, six by parallel subagents each handed the project map and the relevant checklist sections, one lead-reviewer verification pass, and this consolidation. Three dimensions — performance, observability, and data handling — are judged largely inapplicable to a CLI/build-tool project with no running service or user-data store, and are recorded as such rather than padded with generic advice. The accessibility review (`npm run a11y`, wrapping axe-core via puppeteer-core) could not execute a live automated check in this session's sandbox — no Chrome/Chromium could be installed without root — so UX contrast findings were derived from direct WCAG contrast-ratio computation against the generated CSS/HTML instead; this is narrower than a live axe-core run and is flagged as such (F-UX-01). Dependency freshness (`npm outdated`) and the live GitHub branch-ruleset state (`gh api`) were both checked with working network/API access this session, unlike some categories in a fully offline review.

# Security Policy

## Supported versions

Security fixes are provided for the latest released version of Poetic only.
Please upgrade to the most recent release before reporting an issue.

## Reporting a vulnerability

Please report security vulnerabilities privately rather than opening a public
issue.

Use GitHub's private vulnerability reporting: go to this repository's
**Security** tab and choose **Report a vulnerability**. This opens a private
advisory visible only to the maintainers.

Please include enough detail to reproduce the issue (affected file or tool,
steps, and impact). We aim to acknowledge reports within a few days and will
keep you informed as we work on a fix.

## Maintainer structure

This project presently has a single maintainer, who also performs the
code-owner review required to merge changes (see `CLAUDE.md`'s "Branch
workflow" section) — reports and fixes are not independently peer-reviewed
by a second person. There is currently no succession plan.

## Automated scanning

[CodeQL](https://codeql.github.com/) (`.github/workflows/codeql.yml`) analyzes
this repo's JavaScript and GitHub Actions workflows on every pull request and
push to `main`, plus a weekly schedule. Results appear under the repository's
**Security** &rarr; **Code scanning** tab.

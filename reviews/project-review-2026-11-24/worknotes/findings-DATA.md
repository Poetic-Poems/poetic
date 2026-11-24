# Findings — DATA

**Strengths:** DATA is largely inapplicable to this project — a hobby poem-publishing tool with
no user accounts, no analytics/tracking code (grepped `src/`, `docs/` for `analytics`/
`tracking`/`gtag`: no hits), and no multi-user data model; poem content is the author's own. The
one real personal/sensitive-data surface, Blogger OAuth credential material, is handled soundly
end-to-end: `.blogger-credentials.json` is gitignored (`.gitignore` lines 11-12) together with
its atomic-write temp siblings, written at mode 0600 via `saveFileMode0600()`
(src/tools/blogger-auth.js:73-97), carried in GitHub Actions secrets for CI and never logged (no
`console.log`/`console.error` of a token or secret found in `sync-blogger.js` or
`blogger-auth.js` besides the one documented, unconditional terminal print of the freshly-minted
refresh token itself — see note below). `test/fixtures/blogger-credentials.json` contains only
obviously-fake placeholder values. `docs/BLOGGER.md` documents a real retention/deletion
pathway (`blogger.removed: draft|delete|keep`, default `draft`) and `blogger.sync` defaults to
`false` (safe default, confirmed in `docs/BLOGGER.md:41`).

## F-DATA-01 — No regulatory exposure beyond what's already noted · Informational

**Evidence:** No EU/US-regulated personal data categories (health, financial, biometric) appear
anywhere in the codebase, fixtures, or examples; the only cross-border data flow is the Blogger
OAuth token exchange with Google's own APIs over HTTPS (`src/tools/blogger-auth.js:46-48`,
`src/tools/sync-blogger.js`).

**Impact:** None — recorded explicitly per the assignment's instruction to say so rather than
invent risk.

**Direction:** none needed.

**Note:** the prior review's F-DATA-01 (refresh token printed unconditionally to stdout,
`blogger-auth.js:538-540` now) remains true and was already assessed as Informational/no-action
in the prior cycle — not re-filed here as it carries no new angle.

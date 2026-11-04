'use strict';

// Shared helpers for test/changelog-grammar.test.js,
// test/check-changelog-section.test.js and test/assemble-changelog.test.js —
// the three suites covering lib/changelog-grammar.sh and the two scripts
// that source it (requirement 25c / roadmap decision D27).

const { spawnSync } = require('child_process');

// Isolate git from the developer's global/system config, matching
// test/sync-framework.test.js's own GIT_ENV (identity, gpg signing, hook
// paths, existing insteadOf rules all fixed, so runs are deterministic
// everywhere this suite runs).
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Poetic Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Poetic Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
};

// Runs `call` (a snippet invoking a function from `libPath`, e.g.
// `changelog_grammar_walk "$BODY"`) in a throwaway bash process after
// sourcing `libPath`. Every value in `vars` is passed through the
// environment, never shell-interpolated, so arbitrary content — quotes,
// backticks, embedded newlines — can only ever be read as data.
// Deliberately no `set -e`: changelog_grammar_walk's own last statement is
// an `(( flag )) && printf ...` whose exit status is 0 only when the flag
// is set — a legitimate "no UNCLOSED-* record" outcome, not a failure. Its
// real callers (scripts/check-changelog-section.sh,
// scripts/assemble-changelog.sh) never see this because they only ever
// consume it from a `< <(changelog_grammar_walk ...)` process substitution,
// whose exit status `set -e` does not track; a direct top-level call here
// needs the same exemption made explicit instead.
function runShellFunction(libPath, call, vars = {}) {
  return spawnSync(
    'bash',
    ['-c', `set -uo pipefail; . "$GRAMMAR_LIB"; ${call}`],
    { env: { ...GIT_ENV, GRAMMAR_LIB: libPath, ...vars }, encoding: 'utf8' }
  );
}

// The fixed leading-field count (after the event name, before the final
// free-text field) for each record shape lib/changelog-grammar.sh emits —
// see its own header comment. A record with no trailing free-text field
// (SECTION-START, SECTION-END, CATEGORY, CATEGORY-END, and the two
// zero-field UNCLOSED-* records) is listed with its exact total field count
// instead, keyed under `exact`, since none of its fields need protecting
// from an embedded tab the way a `<line>` field does.
const EXACT_FIELDS = {
  'SECTION-START': 1,
  'SECTION-END': 2,
  CATEGORY: 4,
  'CATEGORY-END': 3,
  'UNCLOSED-FENCE': 0,
  'UNCLOSED-COMMENT': 0,
};
const LEADING_FIELDS_BEFORE_LINE = {
  NONE: 1,
  'NONE-BAD': 2,
  'BAD-FIRST': 1,
  BULLET: 1,
  CONTINUATION: 3,
  LOOSE: 2,
};

// Parses changelog_grammar_walk's tab-separated stdout into an array of
// field arrays, one per record, the first field always the event name. A
// trailing `<line>` field is captured as the literal remainder of the
// record line so an embedded tab inside it (as opposed to a tab used as a
// field separator) is never mistaken for one — see the module header.
function parseRecords(stdout) {
  const lines = stdout.split('\n').filter((l) => l.length > 0);
  return lines.map((rawLine) => {
    const firstTab = rawLine.indexOf('\t');
    const event = firstTab === -1 ? rawLine : rawLine.slice(0, firstTab);
    let rest = firstTab === -1 ? '' : rawLine.slice(firstTab + 1);

    if (event in EXACT_FIELDS) {
      const fields = [event];
      const n = EXACT_FIELDS[event];
      for (let i = 0; i < n; i++) {
        const idx = rest.indexOf('\t');
        if (idx === -1) { fields.push(rest); rest = ''; }
        else { fields.push(rest.slice(0, idx)); rest = rest.slice(idx + 1); }
      }
      return fields;
    }

    const leading = LEADING_FIELDS_BEFORE_LINE[event];
    if (leading === undefined) {
      throw new Error(`unrecognised changelog-grammar record event: ${event}`);
    }
    const fields = [event];
    for (let i = 0; i < leading; i++) {
      const idx = rest.indexOf('\t');
      if (idx === -1) { fields.push(rest); rest = ''; }
      else { fields.push(rest.slice(0, idx)); rest = rest.slice(idx + 1); }
    }
    fields.push(rest); // the final field: the rest of the line, verbatim
    return fields;
  });
}

module.exports = { GIT_ENV, runShellFunction, parseRecords };

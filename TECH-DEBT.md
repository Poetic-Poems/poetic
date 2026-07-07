# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format: a dated `## <short title>` describing what, why it matters, where, and a
suggested fix.

## Framework self-tests are not hermetic — they read ambient consumer files

_Logged 2026-07-06._

Four tests pass in this repo but fail once synced into a consumer, because they
read on-disk state that a real consumer has but the framework's clean checkout
does not. They are not regressions — they are portability gaps in the tests. The
tests and golden fixtures are synced to consumers, but the ambient files they
depend on (`.shared.poem`, `.blogger-credentials.json`) are user-owned and are
not, so the tests can only pass where those files happen to match the framework.

- `test/golden.test.js` — `_minimal.poem` and `_params-example.poem` "matches the
  golden fixture": `convertPoemToYaml()` prepends the poem directory's
  `.shared.poem`, which differs per repo. Both fixtures omit their author line, so
  `author` defaults to `${author}` — "A Poet" here (baked into the golden YAML)
  but e.g. "Warwick Allen" in a consumer. Only the `author` line differs.
- `test/sync-blogger.test.js` — `resolveConfig: defaults when config is empty` and
  `resolveConfig: hasCredentials false when any var missing`: `resolveConfig()`
  falls back to reading `.blogger-credentials.json` from the CWD when an env var
  is absent. A consumer that syncs to Blogger has that file, so `hasCredentials`
  comes out `true` where the tests (which pass an empty/partial `env`) expect
  `false`.

**Suggested fix:** make these tests hermetic. For the golden tests, convert
fixtures from a temp directory with a controlled (or absent) `.shared.poem`, or
add an option to `convertPoemToYaml()` to skip the shared-prepend for fixtures.
For `resolveConfig`, take the credentials file path (or its contents) as an
argument so a real `.blogger-credentials.json` in the CWD cannot leak into the
test.
## Test portability should be made explicit in the public API

_Logged 2026-07-07._

The review confirmed that the current test suite passes in this repository but
still depends on ambient repository state in a way that makes downstream usage
less predictable. The parser and Blogger config helpers are functional, but the
project would benefit from making the relevant inputs explicit so the same code
can be exercised reliably in both the framework repo and synced consumer repos.

**Suggested fix:** add explicit parameters for shared-poem and credentials-file
input paths where they are used, then update tests to pass fixture-controlled
values rather than relying on the process working directory.

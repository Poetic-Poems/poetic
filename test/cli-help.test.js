'use strict';

/**
 * Tests for --help/-h handling across src/tools/'s CLIs (TD-PPpoet-26080804).
 *
 * isHelpRequested() itself (src/tools/cli-help.js) gets direct unit tests;
 * every tool's entry point is then exercised as a real subprocess (rather
 * than required in-process) because several of them run side-effecting code
 * at module scope or as an unconditional `if (require.main === module)`
 * block — a subprocess is the only way to observe "no side effects" and a
 * true process exit code for each of them.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const { isHelpRequested } = require('../src/tools/cli-help');

const REPO_ROOT = path.join(__dirname, '..');
const TOOLS_DIR = path.join(REPO_ROOT, 'src', 'tools');

// Every CLI entry point in src/tools/ that reads process.argv, run from a
// throwaway cwd so a tool that (incorrectly) fell through past its --help
// check would fail loudly (ENOENT/missing directory) rather than silently
// touching this repo's own public/, raw/, or generated files.
const CLI_TOOLS = [
  'a11y-check.js',
  'blogger-auth.js',
  'build-all-poems.js',
  'build-blogger.js',
  'build-poems.js',
  'build-song-handlers-data.js',
  'build-templates.js',
  'poem-to-raw.js',
  'poem-to-yaml.js',
  'serve-static.js',
  'sync-blogger.js',
  'yaml-to-poem.js',
];

test('isHelpRequested is true for --help or -h anywhere in argv', () => {
  assert.strictEqual(isHelpRequested(['--help']), true);
  assert.strictEqual(isHelpRequested(['-h']), true);
  assert.strictEqual(isHelpRequested(['foo.poem', '--help']), true);
  assert.strictEqual(isHelpRequested(['--all', '-h']), true);
});

test('isHelpRequested is false when neither flag is present', () => {
  assert.strictEqual(isHelpRequested([]), false);
  assert.strictEqual(isHelpRequested(['foo.poem', 'out.yaml']), false);
  assert.strictEqual(isHelpRequested(['--all']), false);
});

function tmpCwd(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-cli-help-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

for (const tool of CLI_TOOLS) {
  for (const flag of ['--help', '-h']) {
    test(`${tool} ${flag} prints usage and exits 0 with no side effects`, (t) => {
      const cwd = tmpCwd(t);
      const toolPath = path.join(TOOLS_DIR, tool);

      const result = spawnSync(process.execPath, [toolPath, flag], {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
      });

      assert.strictEqual(
        result.status, 0,
        `expected exit 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
      assert.match(result.stdout, /Usage:/);
      assert.deepStrictEqual(
        fs.readdirSync(cwd), [],
        `${tool} ${flag} should not write anything to disk`
      );
    });
  }
}

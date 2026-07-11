'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const FIXTURE = path.join(REPO_ROOT, 'src', 'poems', 'poem', '_example.poem');
const DUMP_SCRIPT = path.join(__dirname, 'fixtures', 'dump-syntax.vim');
const GOLDEN_PATH = path.join(__dirname, 'golden', '_example.vim-syntax.txt');
const VIM_SYNTAX_DIR = path.join(REPO_ROOT, 'editors', 'vim');
const RAW_GROUPS_SCRIPT = path.join(__dirname, 'fixtures', 'dump-syntax-groups.vim');

function vimSkipReason() {
  let versionOutput;
  try {
    versionOutput = execFileSync('vim', ['--version'], { encoding: 'utf8' });
  } catch {
    return 'vim is not installed';
  }
  if (!versionOutput.includes('+syntax')) {
    return 'vim is built without +syntax support';
  }
  return undefined;
}

function dumpSyntax() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poem-vim-syntax-'));
  const outPath = path.join(tmpDir, 'dump.txt');
  try {
    execFileSync(
      'vim',
      [
        '-Es', '-u', 'NONE', '-N', '-i', 'NONE', '-n',
        '-c', 'let &runtimepath = $POEM_VIM_DIR . "," . &runtimepath',
        '-c', 'syntax enable',
        '-c', 'set filetype=poem',
        '-S', DUMP_SCRIPT,
        '-c', 'qa!',
        FIXTURE,
      ],
      { env: { ...process.env, POEM_VIM_DIR: VIM_SYNTAX_DIR, DUMP_OUT: outPath } }
    );
    return fs.readFileSync(outPath, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Returns, for each 1-indexed source line of `file` (FIXTURE by default),
// the array of raw (untranslated, unfolded) syntax group names present on
// that line. Powers the version-tolerant markdown-delegation smoke check
// below -- see test/fixtures/dump-syntax-groups.vim for why this is a
// separate dump from dumpSyntax()'s golden-comparison one.
function dumpRawGroupsByLine(file = FIXTURE) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poem-vim-syntax-raw-'));
  const outPath = path.join(tmpDir, 'dump.txt');
  try {
    execFileSync(
      'vim',
      [
        '-Es', '-u', 'NONE', '-N', '-i', 'NONE', '-n',
        '-c', 'let &runtimepath = $POEM_VIM_DIR . "," . &runtimepath',
        '-c', 'syntax enable',
        '-c', 'set filetype=poem',
        '-S', RAW_GROUPS_SCRIPT,
        '-c', 'qa!',
        file,
      ],
      { env: { ...process.env, POEM_VIM_DIR: VIM_SYNTAX_DIR, DUMP_OUT: outPath } }
    );
    return fs
      .readFileSync(outPath, 'utf8')
      .replace(/\n$/, '')
      .split('\n')
      .map((line) => (line === '' ? [] : line.split(',')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Locates the analysis section's 1-indexed, inclusive line range in FIXTURE:
// from its first {Synopsis}/{Full} label to just before the ==== marker that
// closes it (or end of file, if unclosed). Derived from the poem source
// itself -- not from Vim's highlighting -- so it stays exact across Vim
// versions.
function analysisSectionLineRange(poemText) {
  const lines = poemText.split('\n');
  const startIndex = lines.findIndex((line) => /^\{(?:Synopsis|Full)\}/.test(line));
  if (startIndex === -1) {
    throw new Error(`${FIXTURE} has no {Synopsis} or {Full} analysis label`);
  }
  let endIndex = lines.findIndex((line, i) => i > startIndex && /^====/.test(line));
  if (endIndex === -1) {
    endIndex = lines.length;
  }
  return { start: startIndex + 1, end: endIndex };
}

test(
  '_example.poem syntax highlighting matches the golden fixture',
  { skip: vimSkipReason() },
  () => {
    const actual = dumpSyntax();
    const golden = fs.readFileSync(GOLDEN_PATH, 'utf8');
    assert.strictEqual(
      actual,
      golden,
      'Output drifted from test/golden/_example.vim-syntax.txt. If intentional, regenerate it ' +
        '(from the repo root):\n' +
        '  DUMP_OUT=test/golden/_example.vim-syntax.txt POEM_VIM_DIR=editors/vim vim -Es -u NONE -N -i NONE -n ' +
        '-c \'let &runtimepath = $POEM_VIM_DIR . "," . &runtimepath\' -c \'syntax enable\' -c \'set filetype=poem\' ' +
        '-S test/fixtures/dump-syntax.vim -c \'qa!\' src/poems/poem/_example.poem'
    );
  }
);

test(
  'analysis section delegates to the embedded Markdown syntax (contains=@poemMarkdown wiring)',
  { skip: vimSkipReason() },
  () => {
    const poemText = fs.readFileSync(FIXTURE, 'utf8');
    const { start, end } = analysisSectionLineRange(poemText);
    const rawGroupsByLine = dumpRawGroupsByLine();
    // start/end are 1-indexed and inclusive/exclusive respectively; slice()
    // takes 0-indexed bounds, which is exactly [start - 1, end - 1).
    const analysisGroups = rawGroupsByLine.slice(start - 1, end - 1).flat();
    const hasMarkdownGroup = analysisGroups.some((name) => /^markdown/i.test(name));
    assert.ok(
      hasMarkdownGroup,
      `Expected at least one builtin markdown* highlight group somewhere in the analysis ` +
        `section (${FIXTURE} lines ${start}-${end - 1}), but found none among: ` +
        `${JSON.stringify([...new Set(analysisGroups)])}. This is a version-tolerant smoke ` +
        'check (it does not pin exact group names or run boundaries -- see ' +
        'test/golden/_example.vim-syntax.txt for that); a failure here most likely means the ' +
        'poemAnalysis region\'s contains=@poemMarkdown wiring in editors/vim/syntax/poem.vim is ' +
        'broken.'
    );
  }
);

test(
  'trailing-backslash line continuation and the reserved "\\?" sequence are highlighted',
  { skip: vimSkipReason() },
  () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poem-vim-syntax-continuation-'));
    const tmpFile = path.join(tmpDir, 'continuation.poem');
    try {
      fs.writeFileSync(
        tmpFile,
        [
          'A line that continues here\\',
          'onto the next line.',
          '',
          'A reserved \\? sequence here.',
          '',
          'A literal backslash at the end, escaped\\\\',
        ].join('\n')
      );
      const rawGroupsByLine = dumpRawGroupsByLine(tmpFile);
      assert.ok(
        rawGroupsByLine[0].includes('poemLineContinuation'),
        `Expected poemLineContinuation on the single-trailing-backslash line, got: ` +
          `${JSON.stringify(rawGroupsByLine[0])}`
      );
      assert.ok(
        rawGroupsByLine[3].includes('poemReservedEscape'),
        `Expected poemReservedEscape on the "\\?" line, got: ${JSON.stringify(rawGroupsByLine[3])}`
      );
      assert.ok(
        !rawGroupsByLine[5].includes('poemLineContinuation'),
        `A doubled trailing backslash is an escaped literal backslash (poemEscaped), not a ` +
          `continuation marker, so poemLineContinuation must not match it: ` +
          `${JSON.stringify(rawGroupsByLine[5])}`
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

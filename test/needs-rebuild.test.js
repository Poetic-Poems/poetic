'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { needsRebuild, forceRebuildRequested } = require('../src/tools/needs-rebuild');

// A throwaway temp directory, cleaned up when the test ends.
function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-needs-rebuild-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Write a file and set its mtime explicitly (both atime and mtime — only
// mtime matters here, but utimesSync requires both).
function writeAt(filePath, content, mtimeMs) {
  fs.writeFileSync(filePath, content, 'utf8');
  const seconds = mtimeMs / 1000;
  fs.utimesSync(filePath, seconds, seconds);
}

test('needsRebuild: true when the output does not exist', (t) => {
  const dir = tmpDir(t);
  const input = path.join(dir, 'in.txt');
  fs.writeFileSync(input, 'x', 'utf8');
  const output = path.join(dir, 'out.txt');
  assert.strictEqual(needsRebuild(output, input), true);
});

test('needsRebuild: false when the output is newer than every input', (t) => {
  const dir = tmpDir(t);
  const input = path.join(dir, 'in.txt');
  const output = path.join(dir, 'out.txt');
  writeAt(input, 'x', 1_000_000);
  writeAt(output, 'y', 2_000_000);
  assert.strictEqual(needsRebuild(output, input), false);
});

test('needsRebuild: true when an input is newer than the output', (t) => {
  const dir = tmpDir(t);
  const input = path.join(dir, 'in.txt');
  const output = path.join(dir, 'out.txt');
  writeAt(output, 'y', 1_000_000);
  writeAt(input, 'x', 2_000_000);
  assert.strictEqual(needsRebuild(output, input), true);
});

test('needsRebuild: multiple outputs — stale if ANY output is missing or older than an input', (t) => {
  const dir = tmpDir(t);
  const input = path.join(dir, 'in.txt');
  const outputA = path.join(dir, 'a.html');
  const outputB = path.join(dir, 'b.html');
  writeAt(input, 'x', 1_000_000);
  writeAt(outputA, 'a', 2_000_000);
  writeAt(outputB, 'b', 2_000_000);
  assert.strictEqual(needsRebuild([outputA, outputB], input), false);

  // Backdate just one output to before the input.
  writeAt(outputB, 'b', 500_000);
  assert.strictEqual(needsRebuild([outputA, outputB], input), true);

  // A missing output is also stale, even if the other exists and is fresh.
  fs.rmSync(outputB);
  assert.strictEqual(needsRebuild([outputA, outputB], input), true);
});

test('needsRebuild: multiple inputs — stale if the newest input is newer than the output', (t) => {
  const dir = tmpDir(t);
  const inputA = path.join(dir, 'a.txt');
  const inputB = path.join(dir, 'b.txt');
  const output = path.join(dir, 'out.html');
  writeAt(inputA, 'a', 1_000_000);
  writeAt(inputB, 'b', 1_000_000);
  writeAt(output, 'out', 2_000_000);
  assert.strictEqual(needsRebuild(output, [inputA, inputB]), false);

  writeAt(inputB, 'b', 3_000_000);
  assert.strictEqual(needsRebuild(output, [inputA, inputB]), true);
});

test('needsRebuild: a directory input catches an added file', (t) => {
  const dir = tmpDir(t);
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir);
  const output = path.join(dir, 'out.html');
  writeAt(path.join(srcDir, 'one.txt'), '1', 1_000_000);
  // mkdirSync stamps srcDir's own mtime as "now" — backdate it too so the
  // output (also backdated, but later) starts out genuinely fresh.
  const srcDirSeconds = 1_000_000 / 1000;
  fs.utimesSync(srcDir, srcDirSeconds, srcDirSeconds);
  writeAt(output, 'out', 2_000_000);
  assert.strictEqual(needsRebuild(output, srcDir), false);

  // Adding a new file bumps the directory's own mtime to "now" — well after
  // the output's backdated (1970) mtime.
  fs.writeFileSync(path.join(srcDir, 'two.txt'), '2', 'utf8');
  assert.strictEqual(needsRebuild(output, srcDir), true);
});

test('needsRebuild: force always reports stale, even when nothing changed', (t) => {
  const dir = tmpDir(t);
  const input = path.join(dir, 'in.txt');
  const output = path.join(dir, 'out.txt');
  writeAt(input, 'x', 1_000_000);
  writeAt(output, 'y', 2_000_000);
  assert.strictEqual(needsRebuild(output, input), false);
  assert.strictEqual(needsRebuild(output, input, { force: true }), true);
});

test('forceRebuildRequested: true when --force is in argv', () => {
  assert.strictEqual(forceRebuildRequested(['node', 'script.js', '--force']), true);
  assert.strictEqual(forceRebuildRequested(['node', 'script.js']), false);
});

test('forceRebuildRequested: true when POETIC_FORCE_REBUILD is set', () => {
  const prev = process.env.POETIC_FORCE_REBUILD;
  try {
    delete process.env.POETIC_FORCE_REBUILD;
    assert.strictEqual(forceRebuildRequested(['node', 'script.js']), false);
    process.env.POETIC_FORCE_REBUILD = '1';
    assert.strictEqual(forceRebuildRequested(['node', 'script.js']), true);
  } finally {
    if (prev === undefined) delete process.env.POETIC_FORCE_REBUILD;
    else process.env.POETIC_FORCE_REBUILD = prev;
  }
});

'use strict';

/**
 * Shared mtime-based staleness check for the build pipeline.
 *
 * Each build script knows its own dependency set better than any generic
 * discovery logic could (see docs/BUILD.md) — this helper just answers "is
 * `outputs` older than `inputs`", given paths the caller has already worked
 * out. A directory passed as an input catches additions/removals of its
 * direct children (creating/deleting a file bumps the parent directory's own
 * mtime on POSIX and NTFS), but this is a best-effort dev-convenience cache,
 * not a correctness-critical one — it isn't guaranteed portable to every
 * filesystem or sync tool.
 */

const fs = require('fs');

function toArray(pathOrPaths) {
  return Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
}

/**
 * @param {string|string[]} outputs - output file(s) that would be (re)written
 * @param {string|string[]} inputs - file(s)/directory(ies) the outputs depend on
 * @param {{ force?: boolean }} [options] - force: true always reports stale
 * @returns {boolean} true if any output is missing, or the newest input is
 *   newer than the oldest existing output
 */
function needsRebuild(outputs, inputs, { force = false } = {}) {
  if (force) return true;

  let oldestOutputMtime = Infinity;
  for (const output of toArray(outputs)) {
    if (!fs.existsSync(output)) return true;
    oldestOutputMtime = Math.min(oldestOutputMtime, fs.statSync(output).mtimeMs);
  }

  let newestInputMtime = -Infinity;
  for (const input of toArray(inputs)) {
    newestInputMtime = Math.max(newestInputMtime, fs.statSync(input).mtimeMs);
  }

  return newestInputMtime > oldestOutputMtime;
}

/**
 * True if `--force` was passed on the command line (checked against argv by
 * each script's own entry point) or POETIC_FORCE_REBUILD is set in the
 * environment (convenient for the `npm run build` chain, e.g.
 * `POETIC_FORCE_REBUILD=1 npm run build`).
 *
 * @param {string[]} [argv] - defaults to process.argv
 * @returns {boolean}
 */
function forceRebuildRequested(argv = process.argv) {
  return argv.includes('--force') || !!process.env.POETIC_FORCE_REBUILD;
}

module.exports = { needsRebuild, forceRebuildRequested };

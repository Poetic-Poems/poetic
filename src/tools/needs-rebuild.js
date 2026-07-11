'use strict';

/**
 * Shared staleness checks for the build pipeline.
 *
 * Each build script knows its own dependency set better than any generic
 * discovery logic could (see docs/BUILD.md) — these helpers just answer "is
 * `outputs` stale?", given inputs the caller has already worked out. Two
 * shapes are provided:
 *
 *   - needsRebuild() — an mtime comparison against a fixed list of input
 *     files. Used where the dependency set is known up front (a poem plus the
 *     specific files it $refs, plus framework-wide inputs).
 *   - needsRebuildAggregate() — for an output built from a whole *set* of
 *     source files (e.g. all-poems.html spans every poem). It compares the
 *     source set against a sidecar manifest, so a file being added to or
 *     removed from the set is detected without relying on the parent
 *     directory's own mtime (which not every filesystem or sync tool bumps).
 *
 * These are a best-effort dev-convenience cache, not a correctness-critical
 * one: a fresh checkout (e.g. in CI) stamps every file with the checkout time,
 * so everything is rebuilt regardless.
 */

const fs = require('fs');
const path = require('path');

function toArray(pathOrPaths) {
  return Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
}

/**
 * @param {string|string[]} outputs - output file(s) that would be (re)written
 * @param {string|string[]} inputs - file(s)/directory(ies) the outputs depend on
 * @param {{ force?: boolean }} [options] - force: true always reports stale
 * @returns {boolean} true if any output is missing, any declared input is
 *   missing, or the newest input is newer than the oldest existing output
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
    let stat;
    try {
      stat = fs.statSync(input);
    } catch (err) {
      // A declared dependency that no longer exists (e.g. a poem's $ref target
      // that was deleted) means the outputs can't be trusted — rebuild so the
      // missing reference is re-resolved (and its error re-reported).
      if (err.code === 'ENOENT') return true;
      throw err;
    }
    newestInputMtime = Math.max(newestInputMtime, stat.mtimeMs);
  }

  return newestInputMtime > oldestOutputMtime;
}

/**
 * Compute a manifest signature for a set of source files: a map from each
 * file's path (relative to `baseDir`, so keys are stable and don't leak the
 * absolute build location) to its `{ mtimeMs, size }`. A file that doesn't
 * exist is omitted, so a source being added or removed changes the set of
 * keys — this is how the manifest detects additions/removals of a directory's
 * children without depending on the parent directory's own mtime.
 *
 * @param {string[]} files - absolute source-file paths
 * @param {string} baseDir - directory the keys are made relative to
 * @returns {Object<string, {mtimeMs: number, size: number}>}
 */
function computeManifest(files, baseDir) {
  const manifest = {};
  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue; // a missing source simply isn't part of the current set
    }
    manifest[path.relative(baseDir, file)] = { mtimeMs: stat.mtimeMs, size: stat.size };
  }
  return manifest;
}

/**
 * True if the manifest recorded at `manifestPath` differs from `current`
 * (or is missing/unreadable). A differing key set means a source was added or
 * removed; a differing `mtimeMs`/`size` for a shared key means one was edited.
 */
function manifestChanged(manifestPath, current) {
  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return true; // no (or unreadable) prior manifest -> treat as changed
  }
  const previousKeys = Object.keys(previous);
  const currentKeys = Object.keys(current);
  if (previousKeys.length !== currentKeys.length) return true;
  for (const key of currentKeys) {
    const prev = previous[key];
    const cur = current[key];
    if (!prev || prev.mtimeMs !== cur.mtimeMs || prev.size !== cur.size) return true;
  }
  return false;
}

/**
 * Staleness check for an aggregate output built from a *set* of source files
 * (e.g. all-poems.html, which spans every poem). Unlike needsRebuild(), which
 * compares mtimes of a fixed input list, this also detects a source being
 * added to or removed from `sources` — via a sidecar manifest at
 * `manifestPath` — so it does not depend on the parent directory's own mtime.
 *
 * A rebuild is needed when: `force` is set; any output is missing; any
 * `extraInputs` (framework-wide inputs such as the template/config/footer) is
 * newer than the oldest output; or the `sources` set differs from the recorded
 * manifest (a file added, removed, or edited).
 *
 * On a rebuild the caller MUST call recordManifest(manifestPath, sources,
 * baseDir) after (re)writing the outputs, to persist the new signature.
 *
 * @param {string|string[]} outputs
 * @param {string[]} sources - the current set of source files (absolute paths)
 * @param {object} options
 * @param {string} options.manifestPath - where the source-set signature lives
 * @param {string} options.baseDir - directory manifest keys are relative to
 * @param {string[]} [options.extraInputs] - non-source inputs compared by mtime
 * @param {boolean} [options.force]
 * @returns {boolean}
 */
function needsRebuildAggregate(outputs, sources, { manifestPath, baseDir, extraInputs = [], force = false }) {
  if (force) return true;
  for (const output of toArray(outputs)) {
    if (!fs.existsSync(output)) return true;
  }
  if (extraInputs.length > 0 && needsRebuild(outputs, extraInputs)) return true;
  return manifestChanged(manifestPath, computeManifest(sources, baseDir));
}

/**
 * Persist the current source-set signature so the next needsRebuildAggregate()
 * call can detect changes. Call after successfully (re)writing the outputs.
 */
function recordManifest(manifestPath, sources, baseDir) {
  fs.writeFileSync(manifestPath, JSON.stringify(computeManifest(sources, baseDir)), 'utf8');
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

module.exports = {
  needsRebuild,
  needsRebuildAggregate,
  computeManifest,
  recordManifest,
  forceRebuildRequested,
};

'use strict';

/**
 * Path-containment helpers shared by the static dev server.
 *
 * Extracted so the traversal guards can be unit-tested without starting a
 * server. No dependencies beyond Node's built-in `path` and `fs` — the
 * latter for the `realpath` resolution that makes containment symlink-aware.
 */

const fs = require('fs');
const path = require('path');

/**
 * Join a request path onto a base directory, stripping any leading
 * slashes/backslashes and normalising away `..` segments first, so the
 * result cannot escape `base` via an absolute or `../`-prefixed target.
 */
function safeJoin(base, target) {
  const targetPath = path.normalize(target).replace(/^([/\\])+/, '');
  return path.join(base, targetPath);
}

function lexicallyWithin(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * `fs.realpathSync`, or `null` if it can't be resolved (missing target,
 * permissions, a symlink loop, ...). Callers treat `null` as "nothing on
 * disk to have escaped via a symlink", not as a containment failure — a
 * path that doesn't exist can't have been published, and the caller's own
 * not-found handling (a 404, an `existsSync` fallback to a default) is what
 * actually deals with it.
 */
function tryRealpath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/**
 * True when `candidate` is `root` itself or a path strictly inside it, once
 * symlinks are resolved.
 *
 * Comparing against `root + path.sep` (rather than a bare `startsWith(root)`)
 * prevents a sibling directory whose name merely extends the root — e.g.
 * `publicX` when the root is `public` — from being treated as contained.
 *
 * A purely lexical comparison would accept a symlink committed inside `root`
 * whose target lies outside it (e.g. `public/theme.html -> /etc/passwd`): the
 * link's own path is in-root, but what it resolves to isn't. So once the
 * lexical check passes, both `root` and `candidate` are re-resolved with
 * `fs.realpathSync` and compared again. Either side can fail to resolve
 * (most commonly `candidate`, when the caller is testing whether a path that
 * doesn't exist yet — a 404 candidate, a config default — is in-root); in
 * that case there's no symlink to have escaped through, so the lexical
 * result already computed above stands.
 */
function isWithinRoot(root, candidate) {
  if (!lexicallyWithin(root, candidate)) return false;

  const resolvedRoot = tryRealpath(root);
  const resolvedCandidate = tryRealpath(candidate);
  if (resolvedRoot === null || resolvedCandidate === null) return true;

  return lexicallyWithin(resolvedRoot, resolvedCandidate);
}

module.exports = { safeJoin, isWithinRoot };

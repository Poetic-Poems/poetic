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

/**
 * Resolve a user-configured path against `repoRoot` and contain it there,
 * falling back to `fallback` if it escapes — the "resolve via `safeJoin`,
 * check `isWithinRoot`, warn, fall back" composition shared by every config
 * key that names a file the build then reads (a footer source, a Blogger
 * template, ...). An absolute `configuredPath` is taken as given; a relative
 * one is joined onto `repoRoot`.
 *
 * `onOutsideRoot`, if given, is called with the resolved (but rejected) path
 * before falling back — callers use it to log a warning naming their own
 * config key, since the message differs per call site.
 *
 * `fallback` is returned verbatim, so a caller with more candidates still to
 * try (`build-blogger.js`'s template cascade) can pass `null` and treat that
 * as "not this tier, keep looking".
 *
 * @param {string} repoRoot
 * @param {string} configuredPath
 * @param {{ fallback: string|null, onOutsideRoot?: (resolved: string) => void }} opts
 * @returns {string|null} the contained path, or `fallback` if it escapes
 */
function resolveContainedConfigPath(repoRoot, configuredPath, { fallback, onOutsideRoot } = {}) {
  const resolved = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : safeJoin(repoRoot, configuredPath);

  if (isWithinRoot(repoRoot, resolved)) {
    return resolved;
  }

  if (onOutsideRoot) onOutsideRoot(resolved);
  return fallback;
}

module.exports = { safeJoin, isWithinRoot, resolveContainedConfigPath };

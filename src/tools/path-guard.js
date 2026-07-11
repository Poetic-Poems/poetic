'use strict';

/**
 * Path-containment helpers shared by the static dev server.
 *
 * Extracted so the traversal guards can be unit-tested without starting a
 * server. No dependencies beyond Node's built-in `path`.
 */

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

/**
 * True when `candidate` is `root` itself or a path strictly inside it.
 *
 * Comparing against `root + path.sep` (rather than a bare `startsWith(root)`)
 * prevents a sibling directory whose name merely extends the root — e.g.
 * `publicX` when the root is `public` — from being treated as contained.
 */
function isWithinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

module.exports = { safeJoin, isWithinRoot };

'use strict';

const path = require('path');

/**
 * Absolute path to the repository root, anchored to this file's location
 * (src/tools/) rather than process.cwd() — so build scripts resolve the same
 * paths regardless of the directory they're invoked from.
 */
const REPO_ROOT = path.join(__dirname, '..', '..');

module.exports = { REPO_ROOT };

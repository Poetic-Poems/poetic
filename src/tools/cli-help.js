'use strict';

/**
 * True if `--help` or `-h` appears anywhere in `argv`. Every CLI in
 * src/tools/ checks this ahead of its own argument parsing, so `--help`
 * always prints usage and exits 0 rather than being misread as a filename
 * or silently ignored (see TD-PPpoet-26080804).
 *
 * @param {string[]} argv - the tool's own arguments (e.g. process.argv.slice(2))
 * @returns {boolean}
 */
function isHelpRequested(argv) {
  return argv.includes('--help') || argv.includes('-h');
}

module.exports = { isHelpRequested };

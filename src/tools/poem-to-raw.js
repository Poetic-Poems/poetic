#!/usr/bin/env node
//
// poem-to-raw.js — wrapper that delegates to scripts/poem-to-raw.sh.
//
// The shell script is the authoritative implementation.  This file exists so
// that `npm run poem-to-raw` and the build pipeline work without callers
// needing to invoke bash directly.

'use strict';

const path = require('path');
const { execSync, spawnSync } = require('child_process');

function getRepoTop() {
	try {
		return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
	} catch {
		return process.cwd();
	}
}

function main() {
	const repo = getRepoTop();
	const script = path.join(repo, 'scripts', 'poem-to-raw.sh');
	const result = spawnSync('bash', [script], { stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

if (require.main === module) main();

#!/usr/bin/env node
/**
 * Convert .poem files to raw text format
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getRepoTop() {
	try {
		return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
	} catch (e) {
		return process.cwd();
	}
}

function processFile(fullPath, rawDir) {
	const content = fs.readFileSync(fullPath, { encoding: 'utf8' });
	const lines = content.split(/\r?\n/);
	const title = (lines[0] || '').trim() || path.basename(fullPath, '.poem');

	let started = false;
	let comment = false;
	const outLines = [];

	for (const line of lines) {
		if (!started) {
				if (/^\s*$/.test(line)) { started = true; /* include this blank line, like awk */ }
				else { continue; }
			}
		if (/^====\s*(#.*)?$/.test(line)) break;
		if (/^\s*{[^{]/.test(line)) continue;
		if (/^<<#/.test(line)) { comment = true; continue; }
		if (/^#>>/.test(line)) { comment = false; continue; }
		if (comment) continue;
		outLines.push(line);
	}

	let out = outLines.join('\n');

	// Apply the same series of substitutions as the original shell+perl pipeline
	out = out.replace(/\/\.\w+\{([^}]*)\}/g, '$1');
	out = out.replace(/&hellip;|\.\.\./g, '…');
	out = out.replace(/&ldquo;/g, '“');
	out = out.replace(/&rdquo;/g, '”');
	out = out.replace(/&mdash;|(?<!-)---(?!-)/g, '—');
	out = out.replace(/&ndash;/g, '–');
	out = out.replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
	out = out.replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)));

	// Prefix the output with the title and an underline (match the shell script)
	const underline = title.replace(/./g, '-');
	out = title + '\n' + underline + '\n' + out;

	// Normalize trailing newlines to exactly one LF (perl: s:\n*$:\n:s)
	out = out.replace(/(?:\r\n|\r|\n)*$/, '\n');

	const outPath = path.join(rawDir, title);
	fs.writeFileSync(outPath, out, { encoding: 'utf8' });
}

function main() {
	const repo = getRepoTop();
	// Delegate to the original shell script to ensure byte-for-byte parity.
	try {
		execSync(path.join(repo, 'scripts', 'poem-to-raw.sh'), { stdio: 'inherit' });
	} catch (e) {
		// If the shell script fails, fall back to the JS implementation.
		const rawDir = path.join(repo, 'raw');
		if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

		const poemsDir = path.join(repo, 'src', 'poems', 'poem');
		if (!fs.existsSync(poemsDir)) return;

		const files = fs.readdirSync(poemsDir);
		for (const f of files) {
			if (f.startsWith('.')) continue;
			if (!f.endsWith('.poem')) continue;
			const full = path.join(poemsDir, f);
			if (full.includes(path.sep + '_')) continue;
			processFile(full, rawDir);
		}
	}
}

if (require.main === module) main();

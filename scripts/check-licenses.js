#!/usr/bin/env node
'use strict';

// Verifies that every production dependency's licence is on the allow-list
// below. Reads package-lock.json (the source of truth for the resolved
// transitive tree) rather than shelling out to a third-party licence-scanner
// package: the two npm packages built for this (license-checker,
// license-checker-rseidelsohn) both turned out to be a dead end for this
// repo — the actively-maintained major requires Node >=24 (this repo's
// floor is 22, enforced by .npmrc's engine-strict), and the Node-22-
// compatible majors depend on a pre-npm-7 `read-installed`/`read-package-
// json` chain that either can't read a modern npm-installed tree at all, or
// only works by way of a `brace-expansion` version too old to carry the
// GHSA-mh99-v99m-4gvg DoS fix (and forcing that fix in via an override
// breaks their bundled minimatch, which expects the pre-fix callable-
// function export shape). package-lock.json already carries a `license`
// field for the overwhelming majority of entries (npm records it at
// install time from each package's own package.json); the rare entry
// missing it falls back to reading that package's package.json directly
// out of node_modules.
// Usage: node scripts/check-licenses.js
// Run this after `npm ci`/`npm install`; it does not install anything itself.

const fs = require('fs');
const path = require('path');

// Adjust as this repo's licence policy evolves. Every licence below is a
// permissive licence compatible with this repo's own MIT licence.
const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  '0BSD',
  'CC0-1.0',
]);

// Normalises the pre-SPDX `license`/`licenses` shapes still found in a few
// old packages (e.g. config-chain's `{ type: "MIT", url: "..." }`, or an
// array of those) down to the plain SPDX identifier string newer packages
// use directly.
function normaliseLicense(license) {
  if (typeof license === 'string') {
    return license;
  }
  if (Array.isArray(license) && license.length === 1) {
    return normaliseLicense(license[0]);
  }
  if (license && typeof license === 'object' && typeof license.type === 'string') {
    return license.type;
  }
  return null;
}

function licenseFromNodeModules(pkgPath) {
  const manifestPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return normaliseLicense(manifest.license || manifest.licenses);
}

function main() {
  const lockPath = path.join('package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  const violations = [];
  const unresolved = [];
  let checked = 0;

  for (const [pkgPath, info] of Object.entries(lock.packages)) {
    if (!pkgPath || info.dev || info.devOptional) {
      continue;
    }
    checked++;

    const name = pkgPath.slice(pkgPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const license = normaliseLicense(info.license) || licenseFromNodeModules(pkgPath);

    if (!license) {
      unresolved.push(`${name}@${info.version}`);
    } else if (!ALLOWED_LICENSES.has(license)) {
      violations.push(`${name}@${info.version}: ${license}`);
    }
  }

  console.log(`Checked ${checked} production package(s) against the allow-list.`);

  if (unresolved.length > 0) {
    console.error('\nCould not determine a licence for:');
    unresolved.forEach((entry) => console.error(`  - ${entry}`));
    console.error('\nAdd it to package-lock.json (reinstall) or extend check-licenses.js if the licence is known and acceptable.');
  }

  if (violations.length > 0) {
    console.error('\nDisallowed licence(s) found:');
    violations.forEach((entry) => console.error(`  - ${entry}`));
    console.error(`\nAllowed licences: ${[...ALLOWED_LICENSES].join(', ')}`);
  }

  if (unresolved.length > 0 || violations.length > 0) {
    process.exit(1);
  }

  console.log('All production dependency licences are on the allow-list.');
}

main();

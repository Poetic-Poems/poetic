'use strict';

/**
 * Non-blocking accessibility check for the generated site.
 *
 * Runs axe-core (https://github.com/dequelabs/axe-core) against public/index.html
 * and one built poem page, using puppeteer-core driving a Chrome/Chromium
 * already installed on the runner (GitHub's ubuntu-latest images ship Google
 * Chrome out of the box — see docs/BUILD.md) rather than downloading a bundled
 * browser, so this stays a small, dependency-light devDependency.
 *
 * Exits non-zero when violations are found, when no built pages exist yet (run
 * `npm run build` first), or when the check itself crashes; exits 0 when no
 * usable Chrome is found, since that is an environment gap the check can name
 * precisely, not an accessibility finding. Either way the
 * CI step invoking this (`.github/workflows/build-poems.yml`) runs it with
 * `continue-on-error: true`, so this check never blocks a merge — see
 * TD26072616.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./repo-root');

const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

/**
 * Pick the pages to check: the site index, plus the first individual poem
 * page found directly under publicDir (skipping `raw/`, which holds plain-text
 * mirrors, not poem markup).
 *
 * @param {string} publicDir
 * @returns {Array<{ name: string, filePath: string }>}
 */
function discoverCheckTargets(publicDir) {
  const targets = [];

  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    targets.push({ name: 'index.html', filePath: indexPath });
  }

  const poemDirName = fs.readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'raw')
    .map((entry) => entry.name)
    .sort()
    .find((name) => fs.existsSync(path.join(publicDir, name, 'index.html')));

  if (poemDirName) {
    targets.push({
      name: `${poemDirName}/index.html`,
      filePath: path.join(publicDir, poemDirName, 'index.html'),
    });
  }

  return targets;
}

/**
 * Render one page's axe-core violations as a human-readable report block.
 *
 * @param {string} pageName
 * @param {Array<{ id: string, impact: string, help: string, helpUrl: string, nodes: unknown[] }>} violations
 * @returns {string}
 */
function formatViolations(pageName, violations) {
  if (violations.length === 0) {
    return `✅ ${pageName}: no violations`;
  }
  const lines = [`❌ ${pageName}: ${violations.length} violation(s)`];
  violations.forEach((violation) => {
    lines.push(
      `  - [${violation.impact}] ${violation.id}: ${violation.help} ` +
      `(${violation.nodes.length} node(s)) — ${violation.helpUrl}`
    );
  });
  return lines.join('\n');
}

/**
 * Locate a Chrome/Chromium binary to drive with puppeteer-core. Checks the
 * usual override env vars first, then the paths GitHub's ubuntu-latest images
 * install Google Chrome/Chromium at.
 *
 * @param {string[]} [candidates] - override for testing; defaults to the
 *   real env vars + known install paths.
 * @returns {string|undefined}
 */
function findChromeExecutable(candidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function main() {
  const executablePath = findChromeExecutable();
  if (!executablePath) {
    console.log(
      'No Chrome/Chromium executable found (checked PUPPETEER_EXECUTABLE_PATH, ' +
      'CHROME_BIN, and common install paths) — skipping accessibility check.'
    );
    return;
  }

  const targets = discoverCheckTargets(PUBLIC_DIR);
  if (targets.length === 0) {
    console.error(`No built pages found under ${PUBLIC_DIR} — run "npm run build" first.`);
    process.exitCode = 1;
    return;
  }

  const puppeteer = require('puppeteer-core');
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

  const browser = await puppeteer.launch({ executablePath, headless: true });
  let anyViolations = false;
  try {
    for (const target of targets) {
      const page = await browser.newPage();
      try {
        await page.goto(`file://${target.filePath}`, { waitUntil: 'load' });
        await page.evaluate(axeSource);
        // eslint-disable-next-line no-undef -- runs in the page's browser context, not Node's
        const results = await page.evaluate(() => window.axe.run());
        console.log(formatViolations(target.name, results.violations));
        if (results.violations.length > 0) anyViolations = true;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  process.exitCode = anyViolations ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    // A crash (browser launch, navigation, axe injection) is a broken check,
    // not a clean bill of health, so it exits non-zero like a violation would
    // — the CI step is `continue-on-error: true`, so this still never blocks a
    // merge, but someone running `npm run a11y` locally gets a truthful status.
    console.error('Accessibility check failed to run:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { discoverCheckTargets, formatViolations, findChromeExecutable };

#!/usr/bin/env node
/**
 * Build script to generate all-poems.html and index.html for GitHub Pages.
 * Individual poems are already built by the previous step in the npm script chain.
 *
 * Changes vs. v0.1:
 *   - Renders poem fragments in-memory via poem-render (no longer reads <slug>.html files).
 *   - Adds <script src="poetic.js" defer> to all-poems.html (shared Audiomack loader).
 *   - Index links now point to <slug>/ (clean URL) instead of <slug>.html.
 */

const fs = require('fs');
const path = require('path');
const { slugFromFile } = require('./slugify');
const { parseDateForSorting, formatDateForDisplay, toISODate } = require('./date-utils');
const { readPoeticConfig, CONFIG_FILENAME } = require('./poetic-config');
const { loadPoemData, renderFragment, listPoemYamlFiles, refFilesForPoem, readYamlCached, FRAGMENT_TEMPLATE } = require('./poem-render');
const { hasResolvableSongs } = require('./song-handlers');
const { renderTitleMarkup, BEAUTIFY_OPTIONS } = require('./render-core');
const { renderFooter, upsertFooter, resolveFooterSourcePath } = require('./footer');
const { REPO_ROOT } = require('./repo-root');
const { needsRebuild, needsRebuildAggregate, recordManifest, forceRebuildRequested } = require('./needs-rebuild');
const {
  escapeAmpersand, buildPoemDataIsland, renderFreshIndexHtml, renderAllPoemsHtml,
} = require('./aggregate-render-core');
const beautify = require('js-beautify');
const { isHelpRequested } = require('./cli-help');

// The builtin song handlers are a global build input (their YAML source, still
// the human-authored form even though song-handlers.js now loads the generated
// data module) — editing them must rebuild the aggregate pages.
const BUILTIN_HANDLERS_PATH = path.join(REPO_ROOT, 'src', 'song-handlers.yaml');

// public/all-poems.js calls date-utils.js's parseDateForSorting() to sort the
// table's date column, so date-utils.js must also be reachable as a plain
// browser script under public/. Rather than hand-maintaining a second copy
// (the drift risk this replaces), copy the Node source verbatim on every
// build — src/tools/date-utils.js stays the single source of truth, and
// public/date-utils.js is a build artefact (see .gitignore).
function copyDateUtilsAsset(publicDir) {
  const src = path.join(__dirname, 'date-utils.js');
  const dest = path.join(publicDir, 'date-utils.js');
  fs.copyFileSync(src, dest);
}

/**
 * Build all-poems.html by rendering every poem fragment into one page.
 *
 * @param {string} dirPath - publicDir (kept as the original parameter name).
 * @param {string} [favicon]
 * @param {object} [config] - Parsed .poetic-config.yaml.
 * @param {object} [options]
 * @param {string} [options.poemsDir] - Override the default REPO_ROOT-derived
 *   src/poems/yaml (tests only; the npm run build / CLI entry point below
 *   always uses the default) — see the matching option on buildAllPoems() in
 *   build-poems.js.
 * @param {Map<string, *>} [options.yamlCache] - Shared parse cache passed in
 *   by main() so a poem's YAML parsed for the staleness-check sources set or
 *   generateIndexHtml() isn't parsed again here; see readYamlCached() in
 *   poem-render.js. Defaults to a private, call-scoped cache when omitted.
 */
function concatenateAllHtmlFiles(
  dirPath,
  favicon = 'poetic-logo.svg',
  config = {},
  { poemsDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml'), yamlCache = new Map() } = {}
) {
  try {
    const siteTitle = escapeAmpersand(config.title || 'My Poems');
    // Read YAML files from the poems directory for metadata
    const yamlFiles = listPoemYamlFiles(poemsDir);

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((file) => {
      const yamlPath = path.join(poemsDir, file);

      try {
        const data = readYamlCached(yamlPath, yamlCache);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${file}, skipping`);
          return;
        }

        const slug = slugFromFile(file);
        const fileName = slug;

        // Skip index.html and all-poems.html
        if (fileName === 'index' || fileName === 'all-poems') {
          return;
        }

        const titleHtml = renderTitleMarkup(title);
        const date = data.date ? formatDateForDisplay(data.date) : 'Unknown Date';
        const isoDate = data.date ? toISODate(data.date) : '';
        const hasAudio = hasResolvableSongs(data.audio, config);

        poemData.push({ slug, title, titleHtml, date, isoDate, yamlPath, hasAudio });
      } catch (err) {
        console.warn(`Warning: Could not read ${file}:`, err.message);
      }
    });

    // Sort poems by date (oldest first) for display order
    poemData.sort((a, b) => {
      const aDate = parseDateForSorting(a.date);
      const bDate = parseDateForSorting(b.date);
      return aDate - bDate; // oldest first
    });

    // Render each poem fragment in-memory (no file reads) — a poem whose
    // fragment fails to render is excluded from the aggregate entirely
    // (table of contents row included), not just its poem-section.
    let errorCount = 0;
    const entries = [];
    poemData.forEach((poem) => {
      try {
        const poemDataObj = loadPoemData(poem.yamlPath, yamlCache);
        if (!poemDataObj) {
          throw new Error(`Failed to load poem data from ${poem.yamlPath}`);
        }
        const content = renderFragment(poemDataObj, { config });
        entries.push({ ...poem, content });
      } catch (err) {
        console.error(`Error rendering poem '${poem.title}' (${poem.yamlPath}):`, err.message);
        errorCount++;
      }
    });

    const html = renderAllPoemsHtml(entries, { siteTitle, favicon });

    return { html, errorCount };
  } catch (err) {
    return {
      html: `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`,
      errorCount: 1,
    };
  }
}

/**
 * Find a balanced HTML element by its opening tag, returning byte offsets for
 * its open tag, inner content, and closing tag. Tracks the nesting depth of
 * same-named tags rather than matching a single fixed-shape regex against the
 * whole document, so it finds the *matching* close tag through nested
 * same-named children and regardless of indentation or line breaks — needed
 * because selfHealLandmarks (below) runs against previously-built HTML whose
 * exact formatting this codebase doesn't control.
 *
 * @param {string} html
 * @param {RegExp} openTagPattern - matches only the element's opening tag,
 *   e.g. /<div class="container">/i
 * @param {string} tagName - the element name (e.g. "div"), used to track
 *   nesting depth
 * @returns {{start: number, openEnd: number, closeStart: number, end: number}|null}
 */
function findBalancedBlock(html, openTagPattern, tagName) {
  const openMatch = openTagPattern.exec(html);
  if (!openMatch) return null;

  const start = openMatch.index;
  const openEnd = start + openMatch[0].length;
  const tagRe = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}\\s*>`, 'gi');
  tagRe.lastIndex = openEnd;

  let depth = 1;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0][1] === '/') {
      depth -= 1;
      if (depth === 0) {
        return { start, openEnd, closeStart: match.index, end: match.index + match[0].length };
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

/**
 * Self-heal the `<header>`/`<main>` landmarks TD26072616 (#129) added to the
 * fresh-build template (renderFreshIndexHtml, aggregate-render-core.js) into
 * an existing `public/index.html` that predates them, e.g. one a consumer
 * repo tracks in git rather than treating as a build artefact — see
 * TD26072902.
 *
 * Structural rather than regex-over-the-whole-document: it locates the
 * `.container` wrapper and, within it, any `<div class="header">` block by
 * tracking tag-nesting depth (findBalancedBlock above), so varied
 * indentation or nested markup inside those elements doesn't throw it off
 * the way a single fixed-shape regex would.
 *
 * Recognises only the shapes this framework itself has ever produced. If it
 * can't find a `.container` wrapper at all — the body structure has been
 * replaced by hand — it leaves the file untouched; `npm run a11y` still
 * reports the missing landmarks non-blockingly rather than this silently
 * misrewriting arbitrary hand-authored HTML.
 *
 * @param {string} html
 * @returns {string}
 */
function selfHealLandmarks(html) {
  let result = html;

  if (!/<header[\s>]/i.test(result)) {
    const headerDiv = findBalancedBlock(result, /<div class="header">/i, 'div');
    if (headerDiv) {
      const headerInner = result.slice(headerDiv.openEnd, headerDiv.closeStart);
      result = `${result.slice(0, headerDiv.start)}<header class="header">${headerInner}</header>${result.slice(headerDiv.end)}`;
    }
  }

  if (!/<main[\s>]/i.test(result)) {
    const container = findBalancedBlock(result, /<div class="container">/i, 'div');
    if (container) {
      const inner = result.slice(container.openEnd, container.closeStart);
      const headerBlock = findBalancedBlock(inner, /<header\b[^>]*>/i, 'header');
      const prefix = headerBlock ? inner.slice(0, headerBlock.end) : '';
      const rest = headerBlock ? inner.slice(headerBlock.end) : inner;
      result = `${result.slice(0, container.openEnd)}${prefix}\n\n        <main>${rest}</main>\n    ${result.slice(container.closeStart)}`;
    }
  }

  return result;
}

/**
 * Build or refresh index.html's poem-data JSON island (and, on an existing
 * file, sync favicon/title/subtitle and self-heal older formats).
 *
 * @param {string} publicDir
 * @param {string} [favicon]
 * @param {string} [subtitle]
 * @param {object} [config] - Parsed .poetic-config.yaml.
 * @param {object} [options]
 * @param {string} [options.poemsDir] - Override the default REPO_ROOT-derived
 *   src/poems/yaml (tests only; the npm run build / CLI entry point below
 *   always uses the default) — see the matching option on buildAllPoems() in
 *   build-poems.js.
 * @param {Map<string, *>} [options.yamlCache] - Shared parse cache passed in
 *   by main() so a poem's YAML parsed for the staleness-check sources set or
 *   concatenateAllHtmlFiles() isn't parsed again here; see readYamlCached() in
 *   poem-render.js. Defaults to a private, call-scoped cache when omitted.
 */
function generateIndexHtml(
  publicDir,
  favicon = 'poetic-logo.svg',
  subtitle = undefined,
  config = {},
  { poemsDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml'), yamlCache = new Map() } = {}
) {
  try {
    // Read YAML files from the poems directory for metadata
    const yamlFiles = listPoemYamlFiles(poemsDir).sort(); // Sort alphabetically for consistent ordering

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((yamlFile) => {
      const yamlPath = path.join(poemsDir, yamlFile);

      try {
        const data = readYamlCached(yamlPath, yamlCache);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${yamlFile}, skipping`);
          return;
        }

        const slug = slugFromFile(yamlFile);

        // Skip index and all-poems
        if (slug === 'index' || slug === 'all-poems') {
          return;
        }

        // Clean URL: point to slug/ directory instead of slug.html
        const file = `${slug}/`;
        const titleHtml = renderTitleMarkup(title);
        const hasAudio = hasResolvableSongs(data.audio, config);
        const date = toISODate(data.date);
        const labels = Array.isArray(data.labels) ? data.labels : [];

        poemData.push({
          file: file,
          title: title,
          titleHtml: titleHtml,
          hasAudio: hasAudio,
          date: date,
          labels: labels,
        });
      } catch (err) {
        console.warn(`Warning: Could not read ${yamlFile}:`, err.message);
      }
    });

    // Poem data consumed by public/index.js at runtime, embedded as a JSON
    // data island rather than interpolated into a JS blob — see
    // buildPoemDataIsland (aggregate-render-core.js) for the "<" escaping
    // this relies on, needed before it reaches either the refresh branch
    // below or the fresh-template/migration paths that also use this value.
    const poemDataJson = JSON.stringify(poemData, null, 2).replace(/</g, '\\u003c');
    const poemDataIsland = buildPoemDataIsland(poemData);

    const indexPath = path.join(publicDir, 'index.html');

    // Check if index.html exists, if not create a default template
    let indexContent;
    if (fs.existsSync(indexPath)) {
      // Read the existing index.html file
      indexContent = fs.readFileSync(indexPath, 'utf8');

      // Keep the favicon in sync with config
      indexContent = indexContent.replace(
        /<link rel="icon" href="[^"]*"/,
        `<link rel="icon" href="${favicon}"`
      );
      // Keep the subtitle in sync with config (only if explicitly set)
      if (subtitle) {
        indexContent = indexContent.replace(
          /<p class="subtitle">[^<]*<\/p>/,
          `<p class="subtitle">${subtitle}</p>`
        );
      }
      // Keep the title in sync with config (only if explicitly set)
      if (config.title) {
        const escapedTitle = escapeAmpersand(config.title);
        indexContent = indexContent.replace(
          /<title>[^<]*<\/title>/,
          `<title>${escapedTitle}</title>`
        );
        indexContent = indexContent.replace(
          /<h1>[^<]*<\/h1>/,
          `<h1>${escapedTitle}</h1>`
        );
      }

      // Strip the legacy inline <style> block now that its rules live in poetic.css
      indexContent = indexContent.replace(/\n?\s*<style>[\s\S]*?<\/style>/, '');

      // Ensure CSS/JS links are present (inject after favicon if missing)
      const needsCss = !indexContent.includes('href="poetic.css"');
      const needsCustomCss = !indexContent.includes('href="custom.css"');
      const needsJs = !indexContent.includes('src="poetic.js"');
      if (needsCss || needsCustomCss || needsJs) {
        const linksToAdd = [
          needsCss ? '<link rel="stylesheet" href="poetic.css">' : '',
          needsCustomCss ? '<link rel="stylesheet" href="custom.css">' : '',
          needsJs ? '<script src="poetic.js" defer></script>' : '',
        ].filter(Boolean).join('\n    ');
        indexContent = indexContent.replace(
          /(<link rel="icon"[^>]*>)/,
          `$1\n    ${linksToAdd}`
        );
      }

      // Self-heal the poem data + rendering logic. Two shapes can be found in
      // a previously-built index.html:
      //   - Already migrated (id="poem-data" present): just refresh the JSON
      //     payload — the rendering logic lives entirely in public/index.js,
      //     so there is nothing else in the page to patch.
      //   - Pre-migration (the framework's older inline `<script>` carrying
      //     `const allPoems = [...]` plus the formatPoemDate/renderPoems
      //     helpers verbatim): replace that whole `<script>...</script>`
      //     block in one shot with the JSON data island + `<script src=
      //     "index.js">`, migrating the file to the external-script format
      //     on its next build.
      if (/<script type="application\/json" id="poem-data">/.test(indexContent)) {
        // Function replacement, not a string: a string replacement is scanned
        // for "$$", "$&", "$`", "$'" etc. patterns, which would corrupt the
        // insertion if poemDataJson contains one of those sequences (e.g. a
        // poem titled "Big $$ Deal"). A function's return value is inserted
        // verbatim.
        indexContent = indexContent.replace(
          /<script type="application\/json" id="poem-data">[\s\S]*?<\/script>/,
          () => `<script type="application/json" id="poem-data">\n${poemDataJson}\n    </script>`
        );
      } else {
        indexContent = indexContent.replace(
          /<script>\s*const allPoems[\s\S]*?<\/script>/,
          () => poemDataIsland
        );
      }

      // Self-heal the <header>/<main> landmarks: see TD26072902.
      indexContent = selfHealLandmarks(indexContent);
    } else {
      // Create a default index.html template
      const siteTitle = escapeAmpersand(config.title || 'My Poems');
      indexContent = renderFreshIndexHtml(poemData, {
        siteTitle,
        subtitle: subtitle || 'My Poems',
        favicon,
      });
    }

    return indexContent;
  } catch (err) {
    console.warn('Warning: Could not update index.html:', err.message);
    return null;
  }
}

// Main execution
function main() {
  if (isHelpRequested(process.argv.slice(2))) {
    console.log('Usage: node src/tools/build-all-poems.js [--force]');
    console.log('');
    console.log('Build public/all-poems.html (every poem concatenated) and update');
    console.log('public/index.html from src/poems/yaml/ sources.');
    console.log('');
    console.log('Options:');
    console.log('  --force      Rebuild, ignoring mtime-based staleness checks');
    console.log('  --help, -h   Show this help');
    return;
  }

  const publicDir = path.join(REPO_ROOT, 'public');

  if (!fs.existsSync(publicDir)) {
    console.error(`Error: Public directory not found: ${publicDir}`);
    process.exit(1);
  }

  const force = forceRebuildRequested();

  const dateUtilsDest = path.join(publicDir, 'date-utils.js');
  const dateUtilsSrc = path.join(__dirname, 'date-utils.js');
  if (needsRebuild(dateUtilsDest, dateUtilsSrc, { force })) {
    copyDateUtilsAsset(publicDir);
  }

  const config = readPoeticConfig(REPO_ROOT);
  // Strip a leading "public/" so the href resolves correctly when public/ is
  // served as the web root (both locally and once GitHub Pages deploys its
  // contents to the site root) — see build-poems.js for the same rule.
  const rawFavicon = config.favicon || 'poetic-logo.svg';
  const favicon = rawFavicon.replace(/^public\//, '');
  if (config.favicon) {
    console.log(`Using favicon from .poetic-config.yaml: ${favicon}`);
  }
  const subtitle = config.subtitle;
  if (subtitle) {
    console.log(`Using subtitle from .poetic-config.yaml: ${subtitle}`);
  }
  if (config.title) {
    console.log(`Using title from .poetic-config.yaml: ${config.title}`);
  }
  // all-poems.html and index.html both live at the public/ root.
  const footerBlock = renderFooter(config, REPO_ROOT, { base: '' });
  const footerSourcePath = resolveFooterSourcePath(config, REPO_ROOT);
  if (config.footer && config.footer.enabled === false) {
    console.log('Footer disabled via .poetic-config.yaml (footer.enabled: false)');
  } else if (config.footer && config.footer.source) {
    console.log(`Using footer.source from .poetic-config.yaml: ${config.footer.source}`);
  }

  const poemsDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml');
  const configPath = path.join(REPO_ROOT, CONFIG_FILENAME);
  const allPoemsOutputPath = path.join(publicDir, 'all-poems.html');
  const indexPath = path.join(publicDir, 'index.html');
  const manifestPath = path.join(publicDir, '.all-poems.manifest.json');
  // all-poems.html/index.html are aggregates over every poem, so — unlike
  // build-poems.js's per-poem check — the whole source set is relevant: any
  // poem (or shared partial) being added, removed, or edited legitimately
  // invalidates both outputs. That source set is every file in the poems
  // directory, plus every file those poems transitively $ref (so an external,
  // non-underscore-prefixed reference target counts too). Additions and
  // removals within the set are detected by comparing it against a sidecar
  // manifest (see needsRebuildAggregate), not by the directory's own mtime —
  // which not every filesystem or sync tool updates.
  // Shared across the sources set below and the two generators further down,
  // so each poem's YAML is parsed at most once per build (see
  // readYamlCached() in poem-render.js) rather than once per site.
  const yamlCache = new Map();
  const dirEntries = fs.readdirSync(poemsDir).map((f) => path.join(poemsDir, f));
  const refTargets = listPoemYamlFiles(poemsDir)
    .flatMap((f) => refFilesForPoem(path.join(poemsDir, f), yamlCache));
  const sources = [...new Set([...dirEntries, ...refTargets])];
  const extraInputs = [
    FRAGMENT_TEMPLATE,
    BUILTIN_HANDLERS_PATH,
    ...(fs.existsSync(configPath) ? [configPath] : []),
    ...(fs.existsSync(footerSourcePath) ? [footerSourcePath] : []),
  ];
  if (!needsRebuildAggregate([allPoemsOutputPath, indexPath], sources, { manifestPath, baseDir: poemsDir, extraInputs, force })) {
    console.log('⏭  all-poems.html and index.html are up to date, skipping.');
    return;
  }

  console.log('Step 1: Building all-poems.html...');

  const { html: allPoemsHtml, errorCount: poemErrorCount } =
    concatenateAllHtmlFiles(publicDir, favicon, config, { yamlCache });
  const concatenatedContent = upsertFooter(allPoemsHtml, footerBlock);

  const prettifiedContent = beautify.html(concatenatedContent, BEAUTIFY_OPTIONS);
  fs.writeFileSync(allPoemsOutputPath, prettifiedContent, 'utf8');

  console.log(`✅ Successfully generated ${allPoemsOutputPath}`);
  if (poemErrorCount > 0) {
    console.error(`❌ ${poemErrorCount} poem(s) failed to render into all-poems.html (see errors above)`);
  }

  console.log('\nStep 2: Updating index.html...');

  const updatedIndexContent = generateIndexHtml(publicDir, favicon, subtitle, config, { yamlCache });
  let indexErrorCount = 0;
  if (updatedIndexContent) {
    const finalIndexContent = upsertFooter(updatedIndexContent, footerBlock);
    const prettifiedIndexContent = beautify.html(finalIndexContent, BEAUTIFY_OPTIONS);
    fs.writeFileSync(indexPath, prettifiedIndexContent, 'utf8');
    console.log(`✅ Successfully updated ${indexPath}`);
  } else {
    console.error('❌ Skipped index.html update due to errors (see warning above)');
    indexErrorCount = 1;
  }

  // Record the source set we just built from, so the next run can detect any
  // poem added to / removed from it without relying on the directory's mtime.
  recordManifest(manifestPath, sources, poemsDir);

  console.log(
    `\n📊 Processed ${
      fs.readdirSync(publicDir).filter((f) => f.endsWith('.html')).length
    } HTML files`
  );

  const totalErrorCount = poemErrorCount + indexErrorCount;
  if (totalErrorCount > 0) {
    console.error(`\n📊 Build failed: ${totalErrorCount} error(s) (see above).`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  concatenateAllHtmlFiles,
  generateIndexHtml,
  copyDateUtilsAsset,
  findBalancedBlock,
  selfHealLandmarks,
};

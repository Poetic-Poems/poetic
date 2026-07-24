#!/usr/bin/env node
/**
 * Build script to generate individual poem HTML files from YAML sources.
 *
 * For each poem it writes:
 *   public/<slug>/index.html  - full standalone HTML page (linked CSS/JS)
 *   public/<slug>.html        - redirect stub → ./<slug>/
 */

const fs = require("fs");
const path = require("path");
const { slugFromFile } = require("./slugify");
const { formatDateForDisplay } = require("./date-utils");
const { readPoeticConfig, CONFIG_FILENAME } = require("./poetic-config");
const { resolveRefs, readPoemFile, clearRefCache, renderPage, listPoemYamlFiles, refFilesForPoem, PAGE_TEMPLATE } = require("./poem-render");
const { renderFooter, upsertFooter, resolveFooterSourcePath } = require("./footer");
const { BEAUTIFY_OPTIONS } = require("./render-core");
const { REPO_ROOT } = require("./repo-root");
const { needsRebuild, forceRebuildRequested } = require("./needs-rebuild");
const POEMS_DIR = path.join(REPO_ROOT, "src", "poems", "yaml");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
// The builtin song handlers are a global build input (their YAML source, still
// the human-authored form even though song-handlers.js now loads the generated
// data module) — editing them must rebuild every page.
const BUILTIN_HANDLERS_PATH = path.join(REPO_ROOT, "src", "song-handlers.yaml");

/**
 * Process all YAML files in the poems directory.
 *
 * @param {object} [options]
 * @param {string} [options.poemsDir] - Override POEMS_DIR (tests only; the
 *   npm run build / CLI entry point below always uses the default).
 * @param {string} [options.publicDir] - Override PUBLIC_DIR (tests only).
 */
function buildAllPoems({ poemsDir = POEMS_DIR, publicDir = PUBLIC_DIR } = {}) {
  // Clear ref cache at the start of each build
  clearRefCache();

  // Read config once
  const config = readPoeticConfig(REPO_ROOT);
  const rawFavicon = config.favicon || "poetic-logo.svg";
  // Strip a leading "public/" so href="../<favicon>" resolves correctly from slug/ subdirs
  const favicon = rawFavicon.replace(/^public\//, '');
  const subtitle = config.subtitle || 'My Poems';
  // Poem pages live at public/<slug>/index.html, one directory deep, so
  // footer-relative asset links (e.g. %{base}poetic-logo.svg) need "../".
  const footerBlock = renderFooter(config, REPO_ROOT, { base: '../' });
  const footerSourcePath = resolveFooterSourcePath(config, REPO_ROOT);

  // Ensure directories exist
  if (!fs.existsSync(poemsDir)) {
    console.error(`Error: Poems directory not found: ${poemsDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Get all YAML files
  const yamlFiles = listPoemYamlFiles(poemsDir);

  if (yamlFiles.length === 0) {
    console.warn(`Warning: No YAML files found in ${poemsDir}`);
    return;
  }

  console.log(`Found ${yamlFiles.length} poem(s) to build...`);

  const force = forceRebuildRequested();
  const configPath = path.join(REPO_ROOT, CONFIG_FILENAME);
  // Framework-wide inputs that affect every rendered page. A poem's own $ref
  // targets are resolved per poem below (refFilesForPoem), so only genuinely
  // global inputs belong here — the page template, the built-in song handlers,
  // and the config/footer when present.
  const globalInputs = [
    PAGE_TEMPLATE,
    BUILTIN_HANDLERS_PATH,
    ...(fs.existsSync(configPath) ? [configPath] : []),
    ...(fs.existsSync(footerSourcePath) ? [footerSourcePath] : []),
  ];

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const builtSlugs = new Set();
  const slugToSource = new Map();

  // Process each YAML file
  for (const yamlFile of yamlFiles) {
    const yamlPath = path.join(poemsDir, yamlFile);

    // Calculate slug from the source filename stem — this needs only the
    // filename, not the file's content, so collision/staleness checks below
    // can run before paying for a read+parse of the YAML.
    const slug = slugFromFile(yamlFile);

    // Guard: an empty slug would clobber public/index.html.
    if (!slug) {
      console.error(`Error: ${yamlFile} yields an empty slug from its filename stem; rename the source file to contain URL-safe characters.`);
      errorCount++;
      continue;
    }
    // Guard: two source files must never resolve to the same slug.
    if (slugToSource.has(slug)) {
      console.error(`Error: slug collision — "${yamlFile}" and "${slugToSource.get(slug)}" both resolve to "${slug}". Rename one .poem source so the filename stems differ.`);
      errorCount++;
      continue;
    }
    slugToSource.set(slug, yamlFile);

    const slugDir = path.join(publicDir, slug);
    const pageFile = path.join(slugDir, 'index.html');
    const redirectFile = path.join(publicDir, `${slug}.html`);

    // This poem's real dependencies: its own YAML plus every file it
    // transitively $refs (resolved from the source, so a $ref to any file —
    // underscore-prefixed partial or not, same directory or elsewhere —
    // correctly invalidates this poem when edited). A missing $ref target is
    // included too, so needsRebuild() keeps rebuilding until it is repaired.
    const refTargets = refFilesForPoem(yamlPath);
    const inputs = [yamlPath, ...refTargets, ...globalInputs];
    if (!needsRebuild([pageFile, redirectFile], inputs, { force })) {
      builtSlugs.add(slug);
      successCount++;
      skippedCount++;
      continue;
    }

    const poemData = readPoemFile(yamlPath);

    if (!poemData) {
      errorCount++;
      continue;
    }

    // Validate required fields
    if (!poemData.title) {
      console.error(`Error: Missing 'title' field in ${yamlFile}`);
      errorCount++;
      continue;
    }

    if (!poemData.author) {
      console.error(`Error: Missing 'author' field in ${yamlFile}`);
      errorCount++;
      continue;
    }

    poemData.slug = slug;

    // Format date for display
    if (poemData.date) {
      poemData.date = formatDateForDisplay(poemData.date);
    }

    // Check for empty versions and warn
    if (!poemData.versions || poemData.versions.length === 0) {
      console.warn(`⚠️  Warning: ${yamlFile} has empty versions block`);
    }

    // ── 1. Full standalone page: public/<slug>/index.html ──────────────────
    let pageHtml;
    try {
      pageHtml = renderPage(poemData, { favicon, subtitle, config });
      pageHtml = upsertFooter(pageHtml, footerBlock);
    } catch (err) {
      console.error(`Error rendering page for ${poemData.title}:`, err.message);
      errorCount++;
      continue;
    }

    try {
      fs.mkdirSync(slugDir, { recursive: true });
      const beautify = require("js-beautify");
      const prettifiedHtml = beautify.html(pageHtml, BEAUTIFY_OPTIONS);
      fs.writeFileSync(pageFile, prettifiedHtml, "utf8");
      console.log(`✅ Generated ${slug}/index.html`);
    } catch (err) {
      console.error(`Error writing ${pageFile}:`, err.message);
      errorCount++;
      continue;
    }

    // ── 2. Redirect stub: public/<slug>.html → ./<slug>/ ──────────────────
    const redirectHtml = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n<link rel="canonical" href="./${slug}/">\n<meta http-equiv="refresh" content="0; url=./${slug}/"></head>\n<body><p>This poem has moved to <a href="./${slug}/">${slug}/</a>.</p></body></html>`;
    try {
      fs.writeFileSync(redirectFile, redirectHtml, "utf8");
      console.log(`↪  Generated ${slug}.html (redirect)`);
      successCount++;
      builtSlugs.add(slug);
    } catch (err) {
      console.error(`Error writing ${redirectFile}:`, err.message);
      errorCount++;
    }
  }

  // Warn about stale HTML artefacts that have no corresponding YAML source.
  // Exclude framework-generated aggregates (index, all-poems), template files,
  // and the configured footer.source file (when it lives directly in public/).
  const footerSourceBasename = path.dirname(footerSourcePath) === publicDir
    ? path.basename(footerSourcePath)
    : null;
  const htmlFiles = fs.readdirSync(publicDir)
    .filter(f => f.endsWith('.html') && !f.includes('.template.') && f !== 'index.html' && f !== 'all-poems.html' && f !== footerSourceBasename);
  for (const htmlFile of htmlFiles) {
    const slug = htmlFile.slice(0, -5);
    if (!builtSlugs.has(slug)) {
      console.warn(`Warning: stale HTML artefact (no source poem): public/${htmlFile}`);
    }
  }

  console.log(
    `\n📊 Build complete: ${successCount} successful, ${errorCount} errors` +
    (skippedCount > 0 ? ` (${skippedCount} up to date, skipped)` : '')
  );

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  console.log("Building individual poem HTML files from YAML sources...\n");
  buildAllPoems();
}

module.exports = { buildAllPoems, resolveRefs, readPoemFile };

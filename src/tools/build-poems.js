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
const { readPoeticConfig } = require("./poetic-config");
const { resolveRefs, readPoemFile, clearRefCache, renderPage } = require("./poem-render");
const { REPO_ROOT } = require("./repo-root");

const POEMS_DIR = path.join(REPO_ROOT, "src", "poems", "yaml");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

/**
 * Process all YAML files in the poems directory
 */
function buildAllPoems() {
  // Clear ref cache at the start of each build
  clearRefCache();

  // Read config once
  const config = readPoeticConfig(REPO_ROOT);
  const rawFavicon = config.favicon || "poetic-logo.svg";
  // Strip a leading "public/" so href="../<favicon>" resolves correctly from slug/ subdirs
  const favicon = rawFavicon.replace(/^public\//, '');
  const subtitle = config.subtitle || 'My Poems';
  const audiomackArtist = config.audiomack_artist || '';

  // Ensure directories exist
  if (!fs.existsSync(POEMS_DIR)) {
    console.error(`Error: Poems directory not found: ${POEMS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Get all YAML files
  const yamlFiles = fs
    .readdirSync(POEMS_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter((file) => !file.startsWith("YAML-SCHEMA"))
    .filter((file) => !file.startsWith("_")); // Skip files beginning with underscore

  if (yamlFiles.length === 0) {
    console.warn(`Warning: No YAML files found in ${POEMS_DIR}`);
    return;
  }

  console.log(`Found ${yamlFiles.length} poem(s) to build...`);

  let successCount = 0;
  let errorCount = 0;
  const builtSlugs = new Set();
  const slugToSource = new Map();

  // Process each YAML file
  for (const yamlFile of yamlFiles) {
    const yamlPath = path.join(POEMS_DIR, yamlFile);
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

    // Calculate slug from the source filename stem
    poemData.slug = slugFromFile(yamlFile);

    // Format date for display
    if (poemData.date) {
      poemData.date = formatDateForDisplay(poemData.date);
    }

    // Check for empty versions and warn
    if (!poemData.versions || poemData.versions.length === 0) {
      console.warn(`⚠️  Warning: ${yamlFile} has empty versions block`);
    }

    const slug = poemData.slug;

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

    // ── 1. Full standalone page: public/<slug>/index.html ──────────────────
    let pageHtml;
    try {
      pageHtml = renderPage(poemData, { favicon, subtitle, audiomackArtist });
    } catch (err) {
      console.error(`Error rendering page for ${poemData.title}:`, err.message);
      errorCount++;
      continue;
    }

    const slugDir = path.join(PUBLIC_DIR, slug);
    const pageFile = path.join(slugDir, 'index.html');
    try {
      fs.mkdirSync(slugDir, { recursive: true });
      const beautify = require("js-beautify");
      const prettifiedHtml = beautify.html(pageHtml, {
        indent_size: 2,
        wrap_line_length: 80,
        preserve_newlines: false,
        max_preserve_newlines: 1,
        wrap_attributes: "auto"
      });
      fs.writeFileSync(pageFile, prettifiedHtml, "utf8");
      console.log(`✅ Generated ${slug}/index.html`);
    } catch (err) {
      console.error(`Error writing ${pageFile}:`, err.message);
      errorCount++;
      continue;
    }

    // ── 2. Redirect stub: public/<slug>.html → ./<slug>/ ──────────────────
    const redirectFile = path.join(PUBLIC_DIR, `${slug}.html`);
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
  // Exclude framework-generated aggregates (index, all-poems) and template files.
  const htmlFiles = fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.html') && !f.includes('.template.') && f !== 'index.html' && f !== 'all-poems.html');
  for (const htmlFile of htmlFiles) {
    const slug = htmlFile.slice(0, -5);
    if (!builtSlugs.has(slug)) {
      console.warn(`Warning: stale HTML artefact (no source poem): public/${htmlFile}`);
    }
  }

  console.log(
    `\n📊 Build complete: ${successCount} successful, ${errorCount} errors`
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

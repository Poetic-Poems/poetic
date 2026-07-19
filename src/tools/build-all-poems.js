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

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { slugFromFile } = require("./slugify");
const { parseDateForSorting, formatDateForDisplay, toISODate } = require("./date-utils");
const { readPoeticConfig, CONFIG_FILENAME } = require("./poetic-config");
const { loadPoemData, renderFragment, listPoemYamlFiles, refFilesForPoem, FRAGMENT_TEMPLATE } = require("./poem-render");
const { hasResolvableSongs } = require("./song-handlers");
const { renderTitleMarkup } = require("./render-core");
const { renderFooter, upsertFooter, resolveFooterSourcePath } = require("./footer");
const { REPO_ROOT } = require("./repo-root");
const { needsRebuild, needsRebuildAggregate, recordManifest, forceRebuildRequested } = require("./needs-rebuild");
const {
  escapeAmpersand, buildPoemDataIsland, renderFreshIndexHtml, renderAllPoemsHtml,
} = require("./aggregate-render-core");
const beautify = require("js-beautify");

// The builtin song handlers are a global build input (their YAML source, still
// the human-authored form even though song-handlers.js now loads the generated
// data module) — editing them must rebuild the aggregate pages.
const BUILTIN_HANDLERS_PATH = path.join(REPO_ROOT, "src", "song-handlers.yaml");

// public/all-poems.js calls date-utils.js's parseDateForSorting() to sort the
// table's date column, so date-utils.js must also be reachable as a plain
// browser script under public/. Rather than hand-maintaining a second copy
// (the drift risk this replaces), copy the Node source verbatim on every
// build — src/tools/date-utils.js stays the single source of truth, and
// public/date-utils.js is a build artefact (see .gitignore).
function copyDateUtilsAsset(publicDir) {
  const src = path.join(__dirname, "date-utils.js");
  const dest = path.join(publicDir, "date-utils.js");
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
 */
function concatenateAllHtmlFiles(
  dirPath,
  favicon = "poetic-logo.svg",
  config = {},
  { poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml") } = {}
) {
  try {
    const siteTitle = escapeAmpersand(config.title || "My Poems");
    // Read YAML files from the poems directory for metadata
    const yamlFiles = listPoemYamlFiles(poemsDir);

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((file) => {
      const yamlPath = path.join(poemsDir, file);

      try {
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const data = yaml.load(yamlContent);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${file}, skipping`);
          return;
        }

        const slug = slugFromFile(file);
        const fileName = slug;

        // Skip index.html and all-poems.html
        if (fileName === "index" || fileName === "all-poems") {
          return;
        }

        const titleHtml = renderTitleMarkup(title);
        const date = data.date ? formatDateForDisplay(data.date) : "Unknown Date";
        const isoDate = data.date ? toISODate(data.date) : "";
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
        const poemDataObj = loadPoemData(poem.yamlPath);
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
 */
function generateIndexHtml(
  publicDir,
  favicon = "poetic-logo.svg",
  subtitle = undefined,
  config = {},
  { poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml") } = {}
) {
  try {
    // Read YAML files from the poems directory for metadata
    const yamlFiles = listPoemYamlFiles(poemsDir).sort(); // Sort alphabetically for consistent ordering

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((yamlFile) => {
      const yamlPath = path.join(poemsDir, yamlFile);

      try {
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const data = yaml.load(yamlContent);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${yamlFile}, skipping`);
          return;
        }

        const slug = slugFromFile(yamlFile);

        // Skip index and all-poems
        if (slug === "index" || slug === "all-poems") {
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

    const indexPath = path.join(publicDir, "index.html");

    // Check if index.html exists, if not create a default template
    let indexContent;
    if (fs.existsSync(indexPath)) {
      // Read the existing index.html file
      indexContent = fs.readFileSync(indexPath, "utf8");

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
      indexContent = indexContent.replace(/\n?\s*<style>[\s\S]*?<\/style>/, "");

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
    } else {
      // Create a default index.html template
      const siteTitle = escapeAmpersand(config.title || "My Poems");
      indexContent = renderFreshIndexHtml(poemData, {
        siteTitle,
        subtitle: subtitle || "My Poems",
        favicon,
      });
    }

    return indexContent;
  } catch (err) {
    console.warn("Warning: Could not update index.html:", err.message);
    return null;
  }
}

// Main execution
function main() {
  const publicDir = path.join(REPO_ROOT, "public");

  if (!fs.existsSync(publicDir)) {
    console.error(`Error: Public directory not found: ${publicDir}`);
    process.exit(1);
  }

  const force = forceRebuildRequested();

  const dateUtilsDest = path.join(publicDir, "date-utils.js");
  const dateUtilsSrc = path.join(__dirname, "date-utils.js");
  if (needsRebuild(dateUtilsDest, dateUtilsSrc, { force })) {
    copyDateUtilsAsset(publicDir);
  }

  const config = readPoeticConfig(REPO_ROOT);
  // Strip a leading "public/" so the href resolves correctly when public/ is
  // served as the web root (both locally and once GitHub Pages deploys its
  // contents to the site root) — see build-poems.js for the same rule.
  const rawFavicon = config.favicon || "poetic-logo.svg";
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

  const poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml");
  const configPath = path.join(REPO_ROOT, CONFIG_FILENAME);
  const allPoemsOutputPath = path.join(publicDir, "all-poems.html");
  const indexPath = path.join(publicDir, "index.html");
  const manifestPath = path.join(publicDir, ".all-poems.manifest.json");
  // all-poems.html/index.html are aggregates over every poem, so — unlike
  // build-poems.js's per-poem check — the whole source set is relevant: any
  // poem (or shared partial) being added, removed, or edited legitimately
  // invalidates both outputs. That source set is every file in the poems
  // directory, plus every file those poems transitively $ref (so an external,
  // non-underscore-prefixed reference target counts too). Additions and
  // removals within the set are detected by comparing it against a sidecar
  // manifest (see needsRebuildAggregate), not by the directory's own mtime —
  // which not every filesystem or sync tool updates.
  const dirEntries = fs.readdirSync(poemsDir).map((f) => path.join(poemsDir, f));
  const refTargets = listPoemYamlFiles(poemsDir)
    .flatMap((f) => refFilesForPoem(path.join(poemsDir, f)));
  const sources = [...new Set([...dirEntries, ...refTargets])];
  const extraInputs = [
    FRAGMENT_TEMPLATE,
    BUILTIN_HANDLERS_PATH,
    ...(fs.existsSync(configPath) ? [configPath] : []),
    ...(fs.existsSync(footerSourcePath) ? [footerSourcePath] : []),
  ];
  if (!needsRebuildAggregate([allPoemsOutputPath, indexPath], sources, { manifestPath, baseDir: poemsDir, extraInputs, force })) {
    console.log("⏭  all-poems.html and index.html are up to date, skipping.");
    return;
  }

  console.log("Step 1: Building all-poems.html...");

  const { html: allPoemsHtml, errorCount: poemErrorCount } =
    concatenateAllHtmlFiles(publicDir, favicon, config);
  const concatenatedContent = upsertFooter(allPoemsHtml, footerBlock);

  const prettifiedContent = beautify.html(concatenatedContent, {
    indent_size: 2,
    wrap_line_length: 80,
    preserve_newlines: false,
    max_preserve_newlines: 1,
    wrap_attributes: "auto"
  });
  fs.writeFileSync(allPoemsOutputPath, prettifiedContent, "utf8");

  console.log(`✅ Successfully generated ${allPoemsOutputPath}`);
  if (poemErrorCount > 0) {
    console.error(`❌ ${poemErrorCount} poem(s) failed to render into all-poems.html (see errors above)`);
  }

  console.log("\nStep 2: Updating index.html...");

  const updatedIndexContent = generateIndexHtml(publicDir, favicon, subtitle, config);
  let indexErrorCount = 0;
  if (updatedIndexContent) {
    const finalIndexContent = upsertFooter(updatedIndexContent, footerBlock);
    const prettifiedIndexContent = beautify.html(finalIndexContent, {
      indent_size: 2,
      wrap_line_length: 80,
      preserve_newlines: false,
      max_preserve_newlines: 1,
      wrap_attributes: "auto"
    });
    fs.writeFileSync(indexPath, prettifiedIndexContent, "utf8");
    console.log(`✅ Successfully updated ${indexPath}`);
  } else {
    console.error("❌ Skipped index.html update due to errors (see warning above)");
    indexErrorCount = 1;
  }

  // Record the source set we just built from, so the next run can detect any
  // poem added to / removed from it without relying on the directory's mtime.
  recordManifest(manifestPath, sources, poemsDir);

  console.log(
    `\n📊 Processed ${
      fs.readdirSync(publicDir).filter((f) => f.endsWith(".html")).length
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
};

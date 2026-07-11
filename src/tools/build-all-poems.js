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
const { readPoeticConfig } = require("./poetic-config");
const { loadPoemData, renderFragment } = require("./poem-render");
const { hasResolvableSongs } = require("./song-handlers");
const { renderFooter, upsertFooter } = require("./footer");
const { REPO_ROOT } = require("./repo-root");
const beautify = require("js-beautify");

// Matches the HTML entity style already used elsewhere in these generated
// pages (e.g. &#8212; for the em dash).
function escapeAmpersand(str) {
  return str.replace(/&/g, "&#38;");
}

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

function concatenateAllHtmlFiles(dirPath, favicon = "poetic-logo.svg", config = {}) {
  try {
    const siteTitle = escapeAmpersand(config.title || "My Poems");
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml");
    const yamlFiles = fs
      .readdirSync(poemsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .filter((file) => !file.startsWith("YAML-SCHEMA"))
      .filter((file) => !file.startsWith("_")); // Skip files beginning with underscore

    if (yamlFiles.length === 0) {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No Poems Found</title>
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
</head>
<body>
    <div class="container">
        <div class="poem-section text-center">
            <h1>No Poems Found</h1>
            <p>No YAML files were found in the poems directory.</p>
        </div>
    </div>
</body>
</html>`,
        errorCount: 0,
      };
    }

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

        const anchor = `poem-${fileName}`;
        const date = data.date ? formatDateForDisplay(data.date) : "Unknown Date";
        const isoDate = data.date ? toISODate(data.date) : "";
        const hasSongLink = hasResolvableSongs(data.audio, config);
        const labels = Array.isArray(data.labels) ? data.labels : [];

        poemData.push({
          fileName,
          slug,
          title,
          date,
          isoDate,
          anchor,
          yamlPath,
          hasSongLink,
          labels,
        });
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

    // Regenerate anchors based on sorted order
    poemData.forEach((poem) => {
      poem.anchor = `poem-${poem.fileName}`;
    });

    // Compute the corpus min/max ISO dates (ignoring poems without a date) so
    // the filter bar's date-range inputs can be bounded to the actual data.
    const isoDates = poemData.map((poem) => poem.isoDate).filter(Boolean);
    const minIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a < b ? a : b)) : "";
    const maxIsoDate = isoDates.length ? isoDates.reduce((a, b) => (a > b ? a : b)) : "";
    const dateBoundsAttrs = isoDates.length ? ` min="${minIsoDate}" max="${maxIsoDate}"` : "";

    let concatenatedContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle} &#8212; Concatenated View</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
    <script src="date-utils.js" defer></script>
    <script src="all-poems.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${siteTitle}</h1>
            <p class="subtitle">Concatenated view of all poems (${poemData.length} poems)</p>
            <a href="index.html" class="back-link">← Back to Main Page</a>
        </div>

        <div class="filter-bar" id="filterBar">
            <label class="filter-field">
                <span class="filter-icon" aria-hidden="true">🔍</span>
                <input type="search" id="poemFilter" class="filter-input" placeholder="Filter poems…" aria-label="Filter poems by text" autocomplete="off">
            </label>
            <div class="scope-toggle" role="group" aria-label="Search scope">
                <button type="button" class="scope-led is-on" id="scopeTitles" aria-pressed="true"><span class="led" aria-hidden="true"></span>Titles</button>
                <button type="button" class="scope-led is-on" id="scopeLyrics" aria-pressed="true"><span class="led" aria-hidden="true"></span>Lyrics</button>
                <button type="button" class="scope-led is-on" id="scopeLabels" aria-pressed="true"><span class="led" aria-hidden="true"></span>Labels</button>
            </div>
            <div class="date-range">
                <label class="date-field">From <input type="date" id="dateFrom" class="filter-date"${dateBoundsAttrs}></label>
                <label class="date-field">To <input type="date" id="dateTo" class="filter-date"${dateBoundsAttrs}></label>
            </div>
            <button type="button" class="filter-reset" id="filterReset">Clear</button>
            <span class="filter-count" id="filterCount" aria-live="polite"></span>
        </div>

        <div class="toc">
            <h2>Table of Contents</h2>
            <table class="toc-table" id="poemTable">
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortTable(0, 'title')">Poem Title</th>
                        <th class="sortable" onclick="sortTable(1, 'date')">Poem Date</th>
                        <th class="sortable" onclick="sortTable(2, 'audio')">🎵 Audio</th>
                    </tr>
                </thead>
                <tbody id="poemTableBody">`;

    // Add table rows with poem data
    poemData.forEach((poem) => {
      const audioIcon = poem.hasSongLink ? "🎵" : "";
      concatenatedContent += `<tr>
                        <td><a href="#${poem.anchor}">${poem.title}</a></td>
                        <td>${poem.date}</td>
                        <td class="audio-cell">${audioIcon}</td>
                    </tr>`;
    });

    concatenatedContent += `</tbody>
            </table>
        </div>`;

    // Render each poem fragment in-memory (no file reads)
    let errorCount = 0;
    poemData.forEach((poem) => {
      try {
        const poemDataObj = loadPoemData(poem.yamlPath);
        if (!poemDataObj) {
          throw new Error(`Failed to load poem data from ${poem.yamlPath}`);
        }
        const poemContent = renderFragment(poemDataObj, { config });

        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}" data-date="${poem.isoDate || ''}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content">${poemContent}</div>
        </div>`;
      } catch (err) {
        console.error(`Error rendering poem '${poem.title}' (${poem.yamlPath}):`, err.message);
        errorCount++;
      }
    });

    concatenatedContent += `
    </div>
</body>
</html>`;

    return { html: concatenatedContent, errorCount };
  } catch (err) {
    return {
      html: `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`,
      errorCount: 1,
    };
  }
}

function generateIndexHtml(publicDir, favicon = "poetic-logo.svg", subtitle = undefined, config = {}) {
  try {
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(REPO_ROOT, "src", "poems", "yaml");
    const yamlFiles = fs
      .readdirSync(poemsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .filter((file) => !file.startsWith("YAML-SCHEMA"))
      .filter((file) => !file.startsWith("_")) // Skip files beginning with underscore
      .sort(); // Sort alphabetically for consistent ordering

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
        const hasAudio = hasResolvableSongs(data.audio, config);
        const date = toISODate(data.date);
        const labels = Array.isArray(data.labels) ? data.labels : [];

        poemData.push({
          file: file,
          title: title,
          hasAudio: hasAudio,
          date: date,
          labels: labels,
        });
      } catch (err) {
        console.warn(`Warning: Could not read ${yamlFile}:`, err.message);
      }
    });

    // Poem data consumed by public/index.js at runtime, embedded as a JSON
    // data island rather than interpolated into a JS blob — see the
    // `poemDataIsland` block below.
    const poemDataJson = JSON.stringify(poemData, null, 2);
    const poemDataIsland =
      `<script type="application/json" id="poem-data">\n${poemDataJson}\n    </script>\n` +
      `    <script src="index.js" defer></script>`;

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
        indexContent = indexContent.replace(
          /<script type="application\/json" id="poem-data">[\s\S]*?<\/script>/,
          `<script type="application/json" id="poem-data">\n${poemDataJson}\n    </script>`
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
      indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle}</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${siteTitle}</h1>
            <p class="subtitle">${subtitle || "My Poems"}</p>
        </div>

        <!-- The title filter bar is inserted here by renderPoems()/setupHomeFilter() in index.js. -->
        <div class="poem-grid" id="poemGrid">
            <!-- Poems will be populated by JavaScript -->
        </div>

        <div class="links">
            <a href="all-poems.html">View All Poems</a>
        </div>
    </div>

    ${poemDataIsland}
</body>
</html>`;
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

  copyDateUtilsAsset(publicDir);

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
  if (config.footer && config.footer.enabled === false) {
    console.log('Footer disabled via .poetic-config.yaml (footer.enabled: false)');
  } else if (config.footer && config.footer.source) {
    console.log(`Using footer.source from .poetic-config.yaml: ${config.footer.source}`);
  }

  console.log("Step 1: Building all-poems.html...");

  const { html: allPoemsHtml, errorCount: poemErrorCount } =
    concatenateAllHtmlFiles(publicDir, favicon, config);
  const concatenatedContent = upsertFooter(allPoemsHtml, footerBlock);
  const allPoemsOutputPath = path.join(publicDir, "all-poems.html");

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
    const indexPath = path.join(publicDir, "index.html");
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

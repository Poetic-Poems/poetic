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
const beautify = require("js-beautify");

/**
 * Check if a poem has any active audio files
 */
function hasActiveAudio(audioData) {
  if (!audioData || typeof audioData !== "object") {
    return false;
  }

  for (const platform in audioData) {
    const entries = audioData[platform];
    if (platform === 'suno') {
      if (typeof entries === 'string' && entries.trim()) {
        return true;
      }
    } else if (platform === 'audiomack') {
      if (entries === true) {
        return true;
      }
    } else if (Array.isArray(entries)) {
      if (entries.some((entry) => entry.active === true)) {
        return true;
      }
    }
  }

  return false;
}

function concatenateAllHtmlFiles(dirPath, favicon = "poetic-logo.svg", audiomackArtist = "") {
  try {
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(process.cwd(), "src", "poems", "yaml");
    const yamlFiles = fs
      .readdirSync(poemsDir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
      .filter((file) => !file.startsWith("YAML-SCHEMA"))
      .filter((file) => !file.startsWith("_")); // Skip files beginning with underscore

    if (yamlFiles.length === 0) {
      return `<!DOCTYPE html>
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
</html>`;
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
        const hasSongLink = hasActiveAudio(data.audio);

        poemData.push({
          fileName,
          slug,
          title,
          date,
          anchor,
          yamlPath,
          hasSongLink,
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

    let concatenatedContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity &#8212; Concatenated View</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fragments &#38; Unity</h1>
            <p class="subtitle">Concatenated view of all poems (${poemData.length} poems)</p>
            <a href="index.html" class="back-link">← Back to Main Page</a>
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
    poemData.forEach((poem) => {
      try {
        const poemDataObj = loadPoemData(poem.yamlPath);
        if (!poemDataObj) {
          throw new Error(`Failed to load poem data from ${poem.yamlPath}`);
        }
        const poemContent = renderFragment(poemDataObj, { audiomackArtist });

        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content">${poemContent}</div>
        </div>`;
      } catch (err) {
        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}">
            <h2 class="poem-title"><a href="${poem.slug}/">${poem.title}</a></h2>
            <div class="poem-content"><p class="no-content">Error rendering poem: ${err.message}</p></div>
        </div>`;
      }
    });

    concatenatedContent += `
    </div>

    <script>
        let currentSort = { column: -1, direction: 'asc' };

        function parseDate(dateStr) {
            if (dateStr === "Unknown Date") return new Date(0);

            // Ensure dateStr is a string
            if (typeof dateStr !== 'string') {
                dateStr = String(dateStr);
            }

            // Handle both yyyy-mm-dd and "DayOfWeek, DD Month YYYY" formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                const date = new Date(dateStr + 'T00:00:00');
                return isNaN(date.getTime()) ? new Date(0) : date;
            }

            // Handle display format: "Monday, 4 May 2015" or "Friday, 1 August 1997"
            const months = {
                'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
                'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
            };

            const parts = dateStr.split(', ');
            if (parts.length >= 2) {
                const datePart = parts[1].split(' ');
                if (datePart.length >= 3) {
                    const day = parseInt(datePart[0]);
                    const month = months[datePart[1]];
                    const year = parseInt(datePart[2]);
                    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                        return new Date(year, month, day);
                    }
                }
            }
            return new Date(0); // fallback for invalid dates
        }

        function sortTable(columnIndex, sortType) {
            const table = document.getElementById('poemTable');
            const tbody = document.getElementById('poemTableBody');
            const rows = Array.from(tbody.getElementsByTagName('tr'));

            // Determine sort direction
            if (currentSort.column === columnIndex) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.direction = 'asc';
            }
            currentSort.column = columnIndex;

            // Update header styling
            const headers = table.getElementsByTagName('th');
            for (let i = 0; i < headers.length; i++) {
                headers[i].className = 'sortable';
                if (i === columnIndex) {
                    headers[i].className = currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc';
                }
            }

            // Sort rows
            rows.sort((a, b) => {
                const aVal = a.cells[columnIndex].textContent.trim();
                const bVal = b.cells[columnIndex].textContent.trim();

                let comparison = 0;

                if (sortType === 'date') {
                    const aDate = parseDate(aVal);
                    const bDate = parseDate(bVal);
                    comparison = aDate - bDate;
                } else if (sortType === 'audio') {
                    // Audio sorting: songs first (🎵), then no audio
                    const aHasAudio = aVal.includes('🎵');
                    const bHasAudio = bVal.includes('🎵');
                    comparison = bHasAudio - aHasAudio; // Songs first (1-0 = 1, 0-1 = -1)
                } else {
                    // String comparison (for titles)
                    comparison = aVal.localeCompare(bVal);
                }

                return currentSort.direction === 'asc' ? comparison : -comparison;
            });

            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
        }

        // Back to Top functionality
        const backToTopButton = document.createElement('button');
        backToTopButton.className = 'back-to-top';
        backToTopButton.innerHTML = '↑';
        backToTopButton.setAttribute('aria-label', 'Back to top');
        backToTopButton.onclick = () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        };
        document.body.appendChild(backToTopButton);

        // Show/hide button based on scroll position
        function toggleBackToTop() {
            if (window.pageYOffset > 300) {
                backToTopButton.classList.add('visible');
            } else {
                backToTopButton.classList.remove('visible');
            }
        }

        // Listen for scroll events
        window.addEventListener('scroll', toggleBackToTop);
        // Check on page load
        toggleBackToTop();
    </script>
</body>
</html>`;

    return concatenatedContent;
  } catch (err) {
    return `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`;
  }
}

// Canonical rendering logic for the poem grid on index.html. Kept as a single
// source of truth so it can both seed a fresh index.html and self-heal an
// existing one on every build (see the `indexContent.replace` call below).
const RENDER_POEMS_SCRIPT = `        function formatPoemDate(dateStr) {
            const parts = dateStr.split('-').map(Number);
            if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        }

        function renderPoems() {
            const grid = document.getElementById('poemGrid');
            grid.innerHTML = '';

            allPoems.forEach(poem => {
                const card = document.createElement('div');
                card.className = 'poem-card';
                card.innerHTML = \`
                    <div class="poem-title">
                        <a href="\${poem.file}">\${poem.title}</a>
                        \${poem.hasAudio ? '<span class="audio-indicator">🎵</span>' : ''}
                    </div>
                    \${poem.date ? \`<div class="poem-date">\${formatPoemDate(poem.date)}</div>\` : ''}
                \`;

                card.addEventListener('click', () => {
                    window.location.href = poem.file;
                });

                grid.appendChild(card);
            });
        }

        // Initial render
        renderPoems();`;

function generateIndexHtml(publicDir, favicon = "poetic-logo.svg", subtitle = undefined) {
  try {
    // Read YAML files from the poems directory for metadata
    const poemsDir = path.join(process.cwd(), "src", "poems", "yaml");
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
        const hasAudio = hasActiveAudio(data.audio);
        const date = toISODate(data.date);

        poemData.push({
          file: file,
          title: title,
          hasAudio: hasAudio,
          date: date,
        });
      } catch (err) {
        console.warn(`Warning: Could not read ${yamlFile}:`, err.message);
      }
    });

    // Generate the JavaScript array for the poems
    const poemArrayString = poemData
      .map((poem) => {
        return `        {
          file: "${poem.file}",
          title: "${poem.title.replace(/"/g, '\\"')}",
          hasAudio: ${poem.hasAudio},
          date: ${poem.date ? `"${poem.date}"` : "null"},
        }`;
      })
      .join(",\n");

    const indexPath = path.join(publicDir, "index.html");

    // Check if index.html exists, if not create a default template
    let indexContent;
    if (fs.existsSync(indexPath)) {
      // Read the existing index.html file
      indexContent = fs.readFileSync(indexPath, "utf8");

      // Replace the existing poem array in the JavaScript
      indexContent = indexContent.replace(
        /const allPoems = \[[\s\S]*?\];/,
        `const allPoems = [\n${poemArrayString}\n      ];`
      );
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

      // Self-heal the poem-grid rendering logic (e.g. adds poem dates under
      // titles) so previously-built index.html files pick up template changes.
      indexContent = indexContent.replace(
        /function renderPoems\(\)[\s\S]*?renderPoems\(\);/,
        () => RENDER_POEMS_SCRIPT
      );
    } else {
      // Create a default index.html template
      indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="stylesheet" href="poetic.css">
    <link rel="stylesheet" href="custom.css">
    <script src="poetic.js" defer></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fragments &#38; Unity</h1>
            <p class="subtitle">${subtitle || "My Poems"}</p>
        </div>

        <div class="poem-grid" id="poemGrid">
            <!-- Poems will be populated by JavaScript -->
        </div>

        <div class="links">
            <a href="all-poems.html">View All Poems</a>
        </div>
    </div>

    <script>
        const allPoems = [
${poemArrayString}
        ];

${RENDER_POEMS_SCRIPT}
    </script>
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
  const publicDir = path.join(process.cwd(), "public");

  if (!fs.existsSync(publicDir)) {
    console.error(`Error: Public directory not found: ${publicDir}`);
    process.exit(1);
  }

  const config = readPoeticConfig();
  // Strip a leading "public/" so the href resolves correctly when public/ is
  // served as the web root (both locally and once GitHub Pages deploys its
  // contents to the site root) — see build-poems.js for the same rule.
  const rawFavicon = config.favicon || "poetic-logo.svg";
  const favicon = rawFavicon.replace(/^public\//, '');
  if (config.favicon) {
    console.log(`Using favicon from .poetic-config: ${favicon}`);
  }
  const subtitle = config.subtitle;
  if (subtitle) {
    console.log(`Using subtitle from .poetic-config: ${subtitle}`);
  }
  const audiomackArtist = config.audiomack_artist || '';
  if (audiomackArtist) {
    console.log(`Using audiomack_artist from .poetic-config: ${audiomackArtist}`);
  }

  console.log("Step 1: Building all-poems.html...");

  const concatenatedContent = concatenateAllHtmlFiles(publicDir, favicon, audiomackArtist);
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

  console.log("\nStep 2: Updating index.html...");

  const updatedIndexContent = generateIndexHtml(publicDir, favicon, subtitle);
  if (updatedIndexContent) {
    const indexPath = path.join(publicDir, "index.html");
    const prettifiedIndexContent = beautify.html(updatedIndexContent, {
      indent_size: 2,
      wrap_line_length: 80,
      preserve_newlines: false,
      max_preserve_newlines: 1,
      wrap_attributes: "auto"
    });
    fs.writeFileSync(indexPath, prettifiedIndexContent, "utf8");
    console.log(`✅ Successfully updated ${indexPath}`);
  } else {
    console.log("⚠️  Skipped index.html update due to errors");
  }

  console.log(
    `\n📊 Processed ${
      fs.readdirSync(publicDir).filter((f) => f.endsWith(".html")).length
    } HTML files`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  concatenateAllHtmlFiles,
  generateIndexHtml,
};

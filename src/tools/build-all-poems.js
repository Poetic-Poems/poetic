#!/usr/bin/env node
/**
 * Build script to generate all-poems.html and index.html for GitHub Pages
 * First builds individual poems from YAML, then generates concatenated view
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { slugify } = require("./slugify");
const { parseDateForSorting, formatDateForDisplay } = require("./date-utils");
const beautify = require("js-beautify");
// Individual poems are already built by the previous step in npm script chain

function extractCustomCSSFromStyles() {
  try {
    const stylesPath = path.join(
      process.cwd(),
      "public",
      "styles.css"
    );
    if (!fs.existsSync(stylesPath)) {
      return "";
    }

    const stylesContent = fs.readFileSync(stylesPath, "utf8");
    return stylesContent.trim();
  } catch (err) {
    console.warn(
      "Warning: Could not read CSS from styles.css:",
      err.message
    );
    return "";
  }
}

/**
 * Check if a poem has any active audio files
 */
function hasActiveAudio(audioData) {
  if (!audioData || typeof audioData !== "object") {
    return false;
  }

  // Check each audio platform (audiomack, suno, etc.)
  for (const platform in audioData) {
    const entries = audioData[platform];
    if (platform === 'suno') {
      // For suno: direct URL string indicates active
      if (typeof entries === 'string' && entries.trim()) {
        return true;
      }
    } else if (platform === 'audiomack') {
      // For audiomack: boolean value indicates active
      if (entries === true) {
        return true;
      }
    } else if (Array.isArray(entries)) {
      // For other platforms: check active field (legacy format)
      if (entries.some((entry) => entry.active === true)) {
        return true;
      }
    }
  }

  return false;
}

function concatenateAllHtmlFiles(dirPath) {
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
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #333; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>No Poems Found</h1>
        <p>No YAML files were found in the poems directory.</p>
    </div>
</body>
</html>`;
    }

    // Extract poem data from YAML files
    const poemData = [];
    yamlFiles.forEach((file, index) => {
      const yamlPath = path.join(poemsDir, file);

      try {
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const data = yaml.load(yamlContent);

        const title = data.title;
        if (!title) {
          console.warn(`Warning: Missing title in ${file}, skipping`);
          return;
        }

        const slug = slugify(title);
        const fileName = slug;

        // Skip index.html and all-poems.html
        if (fileName === "index" || fileName === "all-poems") {
          return;
        }

        const htmlPath = path.join(dirPath, `${fileName}.html`);

        // Check if HTML file exists
        if (!fs.existsSync(htmlPath)) {
          console.warn(`Warning: HTML file not found for ${fileName}`);
          return;
        }

        const anchor = `poem-${fileName}`;
        const date = data.date ? formatDateForDisplay(data.date) : "Unknown Date";
        const hasSongLink = hasActiveAudio(data.audio);

        poemData.push({
          fileName,
          title,
          date,
          anchor,
          filePath: htmlPath,
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
    poemData.forEach((poem, index) => {
      poem.anchor = `poem-${poem.fileName}`;
    });

    let concatenatedContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity &#8212; Concatenated View</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; text-align: center; }
        h1 { color: #333; margin: 0 0 10px 0; font-weight: 300; }
        .subtitle { color: #666; margin: 0; }
        .poem-section { background: white; margin-bottom: 30px; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .poem-title { color: #333; margin: 0 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0; font-size: 1.5em; }
        .poem-content { line-height: 1.6; color: #444; }
        .toc { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .toc h2 { color: #333; margin: 0 0 20px 0; }
        .toc-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .toc-table th, .toc-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        .toc-table th { background: #f8f9fa; font-weight: 600; color: #333; cursor: pointer; user-select: none; }
        .toc-table th:hover { background: #e9ecef; }
        .toc-table th.sortable::after { content: " ↕"; opacity: 0.5; }
        .toc-table th.sort-asc::after { content: " ↑"; opacity: 1; }
        .toc-table th.sort-desc::after { content: " ↓"; opacity: 1; }
        .toc-table tr:hover { background: #f8f9fa; }
        .toc-table a { color: #007AFF; text-decoration: none; }
        .toc-table a:hover { text-decoration: underline; }
        .audio-cell { text-align: center; font-size: 1.2em; }
        .audio-cell:empty::after { content: "—"; color: #ccc; }
        .back-link { display: inline-block; margin-bottom: 20px; color: #007AFF; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
        /* Back to Top Button */
        .back-to-top {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #007AFF;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            z-index: 1000;
        }
        .back-to-top:hover {
            background: #0056CC;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        .back-to-top:active {
            transform: translateY(0);
        }
        .back-to-top.visible {
            display: flex;
        }
    </style>
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

    // Add each HTML file content (only individual poems, not index or all-poems)
    poemData.forEach((poem) => {
      // Skip index.html and all-poems.html
      if (poem.fileName === "index" || poem.fileName === "all-poems") {
        return;
      }

      try {
        const content = fs.readFileSync(poem.filePath, "utf8");

        // Extract content between <body> tags, or use the entire content if no body tags
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const poemContent = bodyMatch ? bodyMatch[1] : content;

        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}">
            <h2 class="poem-title">${poem.title}</h2>
            <div class="poem-content">${poemContent}</div>
        </div>`;
      } catch (err) {
        concatenatedContent += `
        <div class="poem-section" id="${poem.anchor}">
            <h2 class="poem-title">${poem.title}</h2>
            <div class="poem-content"><p style="color: #999; font-style: italic;">Error reading file: ${err.message}</p></div>
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

function generateIndexHtml(publicDir) {
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

        const slug = slugify(title);

        // Skip index and all-poems
        if (slug === "index" || slug === "all-poems") {
          return;
        }

        const fileName = `${slug}.html`;
        const hasAudio = hasActiveAudio(data.audio);

        poemData.push({
          file: fileName,
          title: title,
          hasAudio: hasAudio,
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
    } else {
      // Create a default index.html template
      indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fragments &#38; Unity</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            text-align: center;
        }
        h1 {
            color: #333;
            margin: 0 0 10px 0;
            font-weight: 300;
        }
        .subtitle {
            color: #666;
            margin: 0 0 20px 0;
        }
        .poem-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .poem-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: transform 0.2s ease;
            cursor: pointer;
        }
        .poem-card:hover {
            transform: translateY(-2px);
        }
        .poem-title {
            color: #333;
            margin: 0 0 10px 0;
            font-size: 1.2em;
            font-weight: 600;
        }
        .poem-title a {
            color: inherit;
            text-decoration: none;
        }
        .poem-title a:hover {
            text-decoration: underline;
        }
        .audio-indicator {
            color: #007AFF;
            font-size: 1.2em;
        }
        .links {
            text-align: center;
            margin-top: 30px;
        }
        .links a {
            color: #007AFF;
            text-decoration: none;
            margin: 0 15px;
            padding: 10px 20px;
            border: 1px solid #007AFF;
            border-radius: 5px;
            display: inline-block;
        }
        .links a:hover {
            background: #007AFF;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fragments &#38; Unity</h1>
            <p class="subtitle">My Poems</p>
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
                \`;

                card.addEventListener('click', () => {
                    window.location.href = poem.file;
                });

                grid.appendChild(card);
            });
        }

        // Initial render
        renderPoems();
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

  console.log("Step 1: Building all-poems.html...");

  const concatenatedContent = concatenateAllHtmlFiles(publicDir);
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

  const updatedIndexContent = generateIndexHtml(publicDir);
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
  extractCustomCSSFromStyles,
  generateIndexHtml,
};

#!/usr/bin/env node
/**
 * Simple static HTTP server for local testing.
 * - Serves files from the specified directory (default: ./public)
 * - Defaults to port 8080
 * - Supports SPA fallback to index.html for non-file routes
 * - No dependencies
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { parseDateForSorting } = require("./date-utils");

function parseArgs(argv) {
  const args = { port: undefined, dir: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--port=")) {
      args.port = Number(arg.split("=")[1]);
    } else if (arg === "--dir" || arg === "-d") {
      args.dir = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--dir=")) {
      args.dir = arg.split("=")[1];
    }
  }
  return args;
}

const { port: cliPort, dir: cliDir } = parseArgs(process.argv);
const PORT = Number(
  cliPort || process.env.PORT || process.env.npm_config_port || 8080
);
const ROOT_DIR = path.resolve(
  process.cwd(),
  cliDir || process.env.DIR || "public"
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function safeJoin(base, target) {
  const targetPath = path.normalize(target).replace(/^([/\\])+/, "");
  return path.join(base, targetPath);
}

function fileExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (_) {
    return false;
  }
}

function directoryExists(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch (_) {
    return false;
  }
}

function generateDirectoryListing(dirPath, relativePath = "/") {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Directory Listing - ${relativePath}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 30px; font-weight: 300; }
        .path { color: #666; margin-bottom: 20px; font-family: monospace; background: #f8f8f8; padding: 8px 12px; border-radius: 4px; }
        .item { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; }
        .item:last-child { border-bottom: none; }
        .item:hover { background: #f9f9f9; margin: 0 -12px; padding: 8px 12px; border-radius: 4px; }
        .icon { margin-right: 12px; width: 20px; text-align: center; }
        .folder { color: #ff9500; }
        .file { color: #666; }
        a { text-decoration: none; color: #007AFF; flex: 1; }
        a:hover { text-decoration: underline; }
        .size { color: #999; font-size: 0.9em; margin-left: auto; }
        .back-link { display: inline-block; margin-bottom: 20px; color: #007AFF; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Directory Listing</h1>
        <div class="path">${relativePath}</div>
        ${
          relativePath !== "/"
            ? '<a href=".." class="back-link">← Parent Directory</a>'
            : ""
        }
        ${
          relativePath === "/"
            ? '<a href="/all-poems" class="back-link">📖 View All Poems (Concatenated)</a>'
            : ""
        }
        ${items
          .map((item) => {
            const isDir = item.isDirectory();
            const href =
              relativePath === "/" ? item.name : `${relativePath}/${item.name}`;
            const icon = isDir ? "📁" : "📄";
            const className = isDir ? "folder" : "file";

            let size = "";
            if (!isDir) {
              try {
                const stat = fs.statSync(path.join(dirPath, item.name));
                size = formatFileSize(stat.size);
              } catch (_) {
                size = "";
              }
            }

            return `<div class="item">
            <span class="icon ${className}">${icon}</span>
            <a href="${href}">${item.name}</a>
            ${size ? `<span class="size">${size}</span>` : ""}
          </div>`;
          })
          .join("")}
    </div>
</body>
</html>`;

    return html;
  } catch (err) {
    return `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`;
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function extractCustomCSSFromStyles() {
  try {
    const stylesPath = path.join(
      process.cwd(),
      "public",
      "styles.css"
    );
    if (!fileExists(stylesPath)) {
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

function concatenateAllHtmlFiles(dirPath) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const htmlFiles = items
      .filter(
        (item) => item.isFile() && item.name.toLowerCase().endsWith(".html")
      )
      .sort(); // Sort alphabetically for consistent ordering

    if (htmlFiles.length === 0) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No HTML Files Found</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #333; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>No HTML Files Found</h1>
        <p>No HTML files were found in the directory.</p>
    </div>
</body>
</html>`;
    }

    // Extract poem data from HTML files
    const poemData = [];
    htmlFiles.forEach((file, index) => {
      const filePath = path.join(dirPath, file.name);
      const fileName = file.name.replace(".html", "");
      const anchor = `poem-${index}`;

      try {
        const content = fs.readFileSync(filePath, "utf8");

        // Extract title from span id="title--suffix" or fallback to id="title"
        // Handle both single-line and multiline formats
        const titleMatch =
          content.match(/<span id="title--[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
          content.match(/<span id="title"[^>]*>([\s\S]*?)<\/span>/);
        const title = titleMatch ? titleMatch[1].trim() : fileName;

        // Extract date from span id="date--suffix" or fallback to id="date"
        // Handle both single-line and multiline formats
        const dateMatch =
          content.match(/<span id="date--[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
          content.match(/<span id="date"[^>]*>([\s\S]*?)<\/span>/);
        const date = dateMatch ? dateMatch[1].trim() : "Unknown Date";

        // Check for active song link (not commented out) - handle both old and new ID formats
        const hasSongLink =
          (content.includes('<div id="song--') &&
            !content.includes('<!-- div id="song--')) ||
          (content.includes('<div id="song" class="song-link">') &&
            !content.includes('<!-- div id="song" class="song-link">'));

        poemData.push({
          fileName,
          title,
          date,
          anchor,
          filePath,
          hasSongLink,
        });
      } catch (err) {
        poemData.push({
          fileName,
          title: fileName,
          date: "Unknown Date",
          anchor,
          filePath,
          hasSongLink: false,
        });
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
      poem.anchor = `poem-${index}`;
    });

    // Extract custom CSS from styles.css
    const customCSS = extractCustomCSSFromStyles();

    let concatenatedContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Poems - Concatenated View</title>
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

        /* Custom CSS from template */
        ${customCSS}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>All Poems</h1>
            <p class="subtitle">Concatenated view of all HTML files (${htmlFiles.length} files)</p>
            <a href="/" class="back-link">← Back to Directory Listing</a>
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

    // Add each HTML file content
    poemData.forEach((poem) => {
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
    </script>
</body>
</html>`;

    return concatenatedContent;
  } catch (err) {
    return `<!DOCTYPE html><html><body><h1>Error reading directory</h1><p>${err.message}</p></body></html>`;
  }
}

if (!directoryExists(ROOT_DIR)) {
  console.error(`Directory not found: ${ROOT_DIR}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // Handle special concatenation endpoint
    if (pathname === "/all-poems") {
      const concatenatedContent = concatenateAllHtmlFiles(ROOT_DIR);

      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Content-Type": "text/html; charset=utf-8",
      });
      res.end(concatenatedContent);
      return;
    }

    // Handle directory listing requests
    if (pathname.endsWith("/")) {
      let dirPath = safeJoin(ROOT_DIR, pathname);

      // Prevent path traversal
      if (!dirPath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      // Check if it's a directory
      if (directoryExists(dirPath)) {
        const relativePath = pathname === "/" ? "/" : pathname.slice(0, -1);
        const directoryListing = generateDirectoryListing(
          dirPath,
          relativePath
        );

        res.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "Content-Type": "text/html; charset=utf-8",
        });
        res.end(directoryListing);
        return;
      }

      // Try index.html for directory requests
      pathname += "index.html";
    }

    let filePath = safeJoin(ROOT_DIR, pathname);

    // Prevent path traversal
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };

    if (fileExists(filePath)) {
      res.writeHead(200, {
        ...headers,
        "Content-Type": getContentType(filePath),
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback to /index.html for non-asset routes (no dot in last segment)
    const lastSegment = path.basename(pathname);
    if (!lastSegment.includes(".")) {
      const indexPath = path.join(ROOT_DIR, "index.html");
      if (fileExists(indexPath)) {
        res.writeHead(200, {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
        });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }
    }

    res.writeHead(404, {
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Not Found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
    // eslint-disable-next-line no-console
    console.error(err);
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  // eslint-disable-next-line no-console
  console.log(`Serving ${ROOT_DIR} at ${url}`);
  // eslint-disable-next-line no-console
  console.log("Usage: node tools/serve-static.js --port 9000 --dir public");
});

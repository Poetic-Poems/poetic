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
const { readPoeticConfig } = require("./poetic-config");
const { renderFooter, upsertFooter } = require("./footer");
const { concatenateAllHtmlFiles } = require("./build-all-poems");
const { REPO_ROOT } = require("./repo-root");
const { safeJoin, isWithinRoot } = require("./path-guard");

function parseArgs(argv) {
  const args = { port: undefined, dir: undefined, host: undefined };
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
    } else if (arg === "--host" || arg === "-H") {
      args.host = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--host=")) {
      args.host = arg.split("=")[1];
    }
  }
  return args;
}

const { port: cliPort, dir: cliDir, host: cliHost } = parseArgs(process.argv);
const PORT = Number(
  cliPort || process.env.PORT || process.env.npm_config_port || 8080
);
// Bind to loopback by default so the dev server is not exposed to the LAN.
// Pass --host 0.0.0.0 (or HOST=0.0.0.0) for the rare LAN-testing case.
const HOST = cliHost || process.env.HOST || "127.0.0.1";
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
      const config = readPoeticConfig(REPO_ROOT);
      const rawFavicon = config.favicon || "poetic-logo.svg";
      const favicon = rawFavicon.replace(/^public\//, "");
      const footerBlock = renderFooter(config, REPO_ROOT, { base: "" });
      const { html: allPoemsHtml } = concatenateAllHtmlFiles(ROOT_DIR, favicon, config);
      const concatenatedContent = upsertFooter(allPoemsHtml, footerBlock);

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
      if (!isWithinRoot(ROOT_DIR, dirPath)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      // Check if it's a directory
      if (directoryExists(dirPath)) {
        // Serve index.html if it exists (production-correct behaviour)
        const indexFile = path.join(dirPath, "index.html");
        if (fileExists(indexFile)) {
          res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            "Content-Type": "text/html; charset=utf-8",
          });
          fs.createReadStream(indexFile).pipe(res);
          return;
        }

        // Fall back to generated directory listing when no index.html
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
    if (!isWithinRoot(ROOT_DIR, filePath)) {
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

server.listen(PORT, HOST, () => {
  const isLoopback = HOST === "127.0.0.1" || HOST === "::1";
  const displayHost = isLoopback || HOST === "0.0.0.0" ? "localhost" : HOST;
  const url = `http://${displayHost}:${PORT}`;
  // eslint-disable-next-line no-console
  console.log(`Serving ${ROOT_DIR} at ${url} (bound to ${HOST})`);
  if (isLoopback) {
    // eslint-disable-next-line no-console
    console.log("Loopback only; use --host 0.0.0.0 to expose on your LAN.");
  }
  // eslint-disable-next-line no-console
  console.log(
    "Usage: node tools/serve-static.js --port 9000 --dir public --host 127.0.0.1"
  );
});

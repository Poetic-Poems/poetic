#!/usr/bin/env node
/**
 * Build script to inject CSS (from public/poetic.css + public/custom.css) and
 * JS (from public/poetic.js) into the Blogger theme template.
 *
 * CSS is injected between:
 *   /* ~~ CUSTOM CSS START ~~ * /  …  /* ~~ CUSTOM CSS END ~~ * /
 *
 * JS is injected between:
 *   <!-- ~~ CUSTOM JS START ~~ -->  …  <!-- ~~ CUSTOM JS END ~~ -->
 *   The JS is wrapped in a CDATA block so the Blogger XML theme stays valid.
 *
 * If JS markers are absent the JS injection is skipped silently.
 * If CSS markers are absent a warning is printed and CSS injection is skipped
 * (backward-compatible: existing templates with CSS markers still work normally).
 */

const fs   = require("fs");
const path = require("path");
const { readPoeticConfig } = require("./poetic-config");

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Resolve the Blogger template path.
 *
 * Priority:
 *   1. config.blogger.template (if set)
 *   2. <publicDir>/blogger-template.html (if it exists)
 *   3. First <publicDir>/*.template.html found (backward-compat with old hardcoded name)
 *   4. Default: <publicDir>/blogger-template.html
 *
 * @param {object} config    - Parsed .poetic-config.yaml object
 * @param {string} publicDir - Absolute path to the public/ directory
 * @returns {string}         - Resolved template path
 */
function resolveTemplatePath(config, publicDir) {
  // 1. Explicit config key
  if (config.blogger && config.blogger.template) {
    return config.blogger.template;
  }

  // 2. Canonical name
  const canonical = path.join(publicDir, "blogger-template.html");
  if (fs.existsSync(canonical)) {
    return canonical;
  }

  // 3. Any *.template.html in publicDir (backward-compat)
  try {
    const entries = fs.readdirSync(publicDir);
    const match = entries.find(
      (f) => f.endsWith(".template.html") && f !== "blogger-template.html"
    );
    if (match) {
      return path.join(publicDir, match);
    }
  } catch (_) {
    // publicDir may not exist in test contexts — fall through to default
  }

  // 4. Default (will be reported as missing at write time if it doesn't exist)
  return canonical;
}

/**
 * Find text in CSS that Blogger will mistake for a skin-variable declaration.
 *
 * The injected CSS lands inside the theme's b:skin block, and Blogger scans
 * that entire block — comments included — for `<...>` declarations, gathers
 * them into one SkinVariables document, and parses it. Prose like
 * `/* the sort <button> fills the whole <th> ... * /` therefore arrives as two
 * unclosed elements and the theme is rejected with "Invalid variable
 * declaration in page skin: ... not well-formed", quoting a variable block the
 * author never wrote and naming no file or line.
 *
 * Nothing in CSS legitimately looks like a tag, so a match is always a mistake.
 * Reporting it here — with a file and line — is the difference between a
 * one-line fix and reverse-engineering Blogger's error.
 *
 * `<=` and friends don't match: a tag needs a name directly after the `<`.
 *
 * @param {string} css - CSS file contents
 * @returns {Array<{line: number, tag: string}>} - one entry per occurrence
 */
function findSkinUnsafeTags(css) {
  const found = [];
  css.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(/<\/?[A-Za-z][A-Za-z0-9:._-]*\s*\/?>/g)) {
      found.push({ line: index + 1, tag: match[0] });
    }
  });
  return found;
}

/**
 * Replace the content between startMarker and endMarker with payload,
 * formatted as `\n\n${payload}\n\n`.
 *
 * The replacement is idempotent: calling it twice produces the same result.
 * If either marker is absent the original content is returned unchanged.
 *
 * @param {string} content     - Full file content
 * @param {string} startMarker - Literal start-marker string
 * @param {string} endMarker   - Literal end-marker string
 * @param {string} payload     - Text to place between the markers
 * @returns {string}           - Updated content
 */
function injectBetween(content, startMarker, endMarker, payload) {
  const startIdx = content.indexOf(startMarker);
  const endIdx   = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    return content;
  }
  const before = content.slice(0, startIdx + startMarker.length);
  const after  = content.slice(endIdx);
  return before + `\n\n${payload}\n\n` + after;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

function injectCSSIntoTemplate() {
  try {
    const publicDir    = path.join(process.cwd(), "public");
    const config       = readPoeticConfig();
    const templatePath = resolveTemplatePath(config, publicDir);

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      console.error("Error: Template file not found at", templatePath);
      process.exit(1);
    }

    let templateContent = fs.readFileSync(templatePath, "utf8");

    // -----------------------------------------------------------------------
    // CSS injection
    // -----------------------------------------------------------------------
    let stylesContent = "";
    const unsafeTags = [];
    for (const file of ["poetic.css", "custom.css"]) {
      const filePath = path.join(publicDir, file);
      if (!fs.existsSync(filePath)) continue;
      // Scanned before trimming, so the reported line numbers match the file.
      const raw = fs.readFileSync(filePath, "utf8");
      for (const { line, tag } of findSkinUnsafeTags(raw)) {
        unsafeTags.push(`  public/${file}:${line}: ${tag}`);
      }
      const content = raw.trim();
      if (content) stylesContent += (stylesContent ? "\n\n" : "") + content;
    }

    // Refuse to write a theme Blogger will reject on save (see
    // findSkinUnsafeTags). Failing here names the file and line; Blogger's own
    // error names neither.
    if (unsafeTags.length) {
      console.error(
        "Error: CSS contains tag-shaped text. Blogger reads anything shaped " +
          'like a tag inside its b:skin block as a skin variable declaration\n' +
          'and rejects the theme ("Invalid variable declaration in page skin"). ' +
          "Name the element in prose (a \"button element\") or write a\n" +
          "placeholder in braces (.song-embed--{service}):\n" +
          unsafeTags.join("\n")
      );
      process.exit(1);
    }

    // Blogger's own theme scaffolding already lists each post's labels, so hide
    // the in-content poem-labels list here to avoid showing them twice. This is
    // Blogger-only: GitHub Pages links poetic.css directly and is unaffected.
    if (stylesContent) {
      stylesContent += "\n\n.poem-labels { display: none !important; }";
    }

    if (stylesContent) {
      const CSS_START = "/* ~~ CUSTOM CSS START ~~ */";
      const CSS_END   = "/* ~~ CUSTOM CSS END ~~ */";
      const updated   = injectBetween(templateContent, CSS_START, CSS_END, stylesContent.trim());
      if (updated === templateContent && !templateContent.includes(CSS_START)) {
        console.warn("Warning: CSS markers not found in template — skipping CSS injection.");
      } else {
        templateContent = updated;
        console.log("CSS injected from public/poetic.css + public/custom.css");
      }
    } else {
      console.warn("Warning: No CSS found in public/poetic.css or public/custom.css — skipping CSS injection.");
    }

    // -----------------------------------------------------------------------
    // JS injection
    // -----------------------------------------------------------------------
    const jsPath = path.join(publicDir, "poetic.js");
    if (fs.existsSync(jsPath)) {
      const poeticJs = fs.readFileSync(jsPath, "utf8").trim();
      if (poeticJs) {
        const jsPayload = `<script type='text/javascript'>//<![CDATA[\n${poeticJs}\n//]]></script>`;
        const JS_START  = "<!-- ~~ CUSTOM JS START ~~ -->";
        const JS_END    = "<!-- ~~ CUSTOM JS END ~~ -->";
        const updated   = injectBetween(templateContent, JS_START, JS_END, jsPayload);
        if (updated === templateContent && !templateContent.includes(JS_START)) {
          console.warn("Warning: JS markers not found in template — skipping JS injection. Add <!-- ~~ CUSTOM JS START ~~ --> and <!-- ~~ CUSTOM JS END ~~ --> before </body>.");
        } else {
          templateContent = updated;
          console.log("JS injected from public/poetic.js");
        }
      }
    }

    // -----------------------------------------------------------------------
    // Write
    // -----------------------------------------------------------------------
    fs.writeFileSync(templatePath, templateContent, "utf8");

    console.log("Successfully injected into template");
    console.log("Template:", templatePath);

  } catch (err) {
    console.error("Error injecting into template:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  injectCSSIntoTemplate();
}

module.exports = {
  injectCSSIntoTemplate,
  resolveTemplatePath,
  injectBetween,
  findSkinUnsafeTags,
};

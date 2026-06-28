#!/usr/bin/env node
/**
 * Helper script to convert existing HTML poem files to YAML format
 * This script parses HTML files and generates corresponding YAML files
 */

const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(process.cwd(), "public");
const POEMS_DIR = path.join(process.cwd(), "poems");

/**
 * Extract poem data from HTML file
 */
function parseHtmlPoem(htmlContent, filename) {
  const slug = filename.replace(".html", "");

  // Extract title
  const titleMatch = htmlContent.match(
    /<span[^>]*id="title--[^"]*"[^>]*>([\s\S]*?)<\/span>/
  );
  const title = titleMatch ? titleMatch[1].trim() : slug;

  // Extract author
  const authorMatch = htmlContent.match(
    /<span[^>]*id="author--[^"]*"[^>]*>([\s\S]*?)<\/span>/
  );
  const author = authorMatch ? authorMatch[1].trim() : "A Poet";

  // Extract date
  const dateMatch = htmlContent.match(
    /<span[^>]*id="date--[^"]*"[^>]*>([\s\S]*?)<\/span>/
  );
  const date = dateMatch ? dateMatch[1].trim() : "Unknown Date";

  // Check if poem has song segments
  const hasSegments = htmlContent.includes('class="song-segment"');

  let body = "";
  let segments = [];

  if (hasSegments) {
    // Extract segmented body
    const bodyMatch = htmlContent.match(
      /<div class="poem-body">([\s\S]*?)<\/div>/
    );
    if (bodyMatch) {
      const bodyContent = bodyMatch[1];
      // Split by song-segment spans
      const parts = bodyContent.split(
        /<span class="song-segment">([^<]+)<\/span><br ?\/?>/
      );

      for (let i = 1; i < parts.length; i += 2) {
        const label = parts[i];
        let lines = parts[i + 1] || "";
        // Remove trailing <br/> and whitespace
        lines = lines.replace(/<br\s*\/?>\s*$/, "").trim();

        segments.push({
          label: label,
          lines: lines,
        });
      }
    }
  } else {
    // Extract plain body
    const bodyMatch = htmlContent.match(
      /<div class="poem-body">([\s\S]*?)<\/div>/
    );
    body = bodyMatch ? bodyMatch[1].trim() : "";
  }

  // Extract audio links
  let audio = null;
  const audiomackMatch = htmlContent.match(
    /src="(https:\/\/audiomack\.com\/embed\/[^"]+)"/
  );
  const sunoMatch = htmlContent.match(
    /href="(https:\/\/suno\.com\/[^"]+)"[^>]*>recording on Suno<\/a>/
  );

  if (audiomackMatch || sunoMatch) {
    audio = {};
    if (audiomackMatch) audio.audiomack = audiomackMatch[1];
    if (sunoMatch) audio.suno = sunoMatch[1];
  }

  // Extract analysis
  let analysis = null;
  const hasAnalysis = htmlContent.includes("Show analysis");

  if (hasAnalysis) {
    const hasDualAnalysis = htmlContent.includes("full-or-synopsis-selector");

    if (hasDualAnalysis) {
      // Extract synopsis
      const synopsisMatch = htmlContent.match(
        /<div[^>]*id="analysis-syno--[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<!--\s*end analysis-syno/
      );
      const synopsis = synopsisMatch ? synopsisMatch[1].trim() : "";

      // Extract full analysis
      const fullMatch = htmlContent.match(
        /<div[^>]*id="analysis-full--[^"]*"[^>]*style="display: none"[^>]*>([\s\S]*?)<\/div>\s*<!--\s*end analysis-full/
      );
      const full = fullMatch ? fullMatch[1].trim() : "";

      analysis = {
        type: "dual",
        synopsis: synopsis,
        full: full,
      };
    } else {
      // Single analysis
      const analysisMatch = htmlContent.match(
        /<button[^>]*class="analysis hide"[^>]*>[\s\S]*?<\/button>\s*([\s\S]*?)\s*<\/div>\s*<!--\s*end analysis\s*-->/
      );
      const content = analysisMatch ? analysisMatch[1].trim() : "";

      analysis = {
        type: "single",
        content: content,
      };
    }
  }

  return {
    title,
    author,
    date,
    slug,
    ...(hasSegments ? { segments } : { body }),
    ...(audio && { audio }),
    ...(analysis && { analysis }),
  };
}

/**
 * Convert poem object to YAML string
 */
function poemToYaml(poemData) {
  let yaml = `title: ${poemData.title}\n`;
  yaml += `author: ${poemData.author}\n`;
  yaml += `date: ${poemData.date}\n`;
  yaml += `slug: ${poemData.slug}\n`;
  yaml += `\n`;

  if (poemData.segments) {
    yaml += `segments:\n`;
    poemData.segments.forEach((segment) => {
      yaml += `  - label: "${segment.label}"\n`;
      yaml += `    lines: |\n`;
      const lines = segment.lines.split("\n");
      lines.forEach((line) => {
        yaml += `      ${line}\n`;
      });
    });
  } else {
    yaml += `body: |\n`;
    const lines = poemData.body.split("\n");
    lines.forEach((line) => {
      yaml += `  ${line}\n`;
    });
  }

  if (poemData.audio) {
    yaml += `\n`;
    yaml += `audio:\n`;
    if (poemData.audio.audiomack) {
      yaml += `  audiomack: ${poemData.audio.audiomack}\n`;
    }
    if (poemData.audio.suno) {
      yaml += `  suno: ${poemData.audio.suno}\n`;
    }
  }

  if (poemData.analysis) {
    yaml += `\n`;
    yaml += `analysis:\n`;
    yaml += `  type: ${poemData.analysis.type}\n`;

    if (poemData.analysis.type === "dual") {
      yaml += `  synopsis: |\n`;
      const synopsisLines = poemData.analysis.synopsis.split("\n");
      synopsisLines.forEach((line) => {
        yaml += `    ${line}\n`;
      });
      yaml += `  full: |\n`;
      const fullLines = poemData.analysis.full.split("\n");
      fullLines.forEach((line) => {
        yaml += `    ${line}\n`;
      });
    } else {
      yaml += `  content: |\n`;
      const contentLines = poemData.analysis.content.split("\n");
      contentLines.forEach((line) => {
        yaml += `    ${line}\n`;
      });
    }
  }

  return yaml;
}

/**
 * Convert all HTML files to YAML
 */
function convertAllPoems() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error(`Error: Public directory not found: ${PUBLIC_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(POEMS_DIR)) {
    fs.mkdirSync(POEMS_DIR, { recursive: true });
  }

  // Get all HTML files except index.html and all-poems.html
  const htmlFiles = fs
    .readdirSync(PUBLIC_DIR)
    .filter((file) => file.endsWith(".html"))
    .filter((file) => !["index.html", "all-poems.html"].includes(file));

  console.log(`Found ${htmlFiles.length} poem HTML files to convert...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  htmlFiles.forEach((htmlFile) => {
    const yamlFile = htmlFile.replace(".html", ".yaml");
    const yamlPath = path.join(POEMS_DIR, yamlFile);

    // Skip if YAML already exists
    if (fs.existsSync(yamlPath)) {
      console.log(`⏭️  Skipping ${yamlFile} (already exists)`);
      skipCount++;
      return;
    }

    try {
      const htmlPath = path.join(PUBLIC_DIR, htmlFile);
      const htmlContent = fs.readFileSync(htmlPath, "utf8");

      const poemData = parseHtmlPoem(htmlContent, htmlFile);
      const yamlContent = poemToYaml(poemData);

      fs.writeFileSync(yamlPath, yamlContent, "utf8");
      console.log(`✅ Converted ${htmlFile} → ${yamlFile}`);
      successCount++;
    } catch (err) {
      console.error(`❌ Error converting ${htmlFile}:`, err.message);
      errorCount++;
    }
  });

  console.log(
    `\n📊 Conversion complete: ${successCount} converted, ${skipCount} skipped, ${errorCount} errors`
  );

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  console.log("Converting HTML poems to YAML format...\n");
  convertAllPoems();
}

module.exports = { convertAllPoems };



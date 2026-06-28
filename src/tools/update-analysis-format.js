#!/usr/bin/env node
/**
 * Script to update YAML files to use blank lines instead of <p> tags in analysis sections
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const POEMS_DIR = path.join(process.cwd(), "poems");

/**
 * Process analysis text to convert <p> tags to blank lines
 * This script was used to migrate existing YAML files to the new format
 */
function processAnalysisText(text) {
  if (!text) return text;

  // First, add blank lines before HTML tags that come after </p>
  let processed = text
    .replace(/<\/p>\s*<h3/g, '\n\n<h3') // Add blank line before h3 tags
    .replace(/<\/p>\s*<h4/g, '\n\n<h4') // Add blank line before h4 tags
    .replace(/<\/p>\s*<h2/g, '\n\n<h2') // Add blank line before h2 tags
    .replace(/<\/p>\s*<h1/g, '\n\n<h1') // Add blank line before h1 tags
    .replace(/<\/p>\s*<p>/g, '\n\n') // Replace </p><p> with double newlines
    .replace(/<p>\s*/g, '')  // Remove opening <p> tags
    .replace(/\s*<\/p>/g, '') // Remove closing </p> tags
    .replace(/\n{3,}/g, '\n\n'); // Replace multiple newlines with double newlines

  return processed;
}

/**
 * Process a single YAML file
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = yaml.load(content);

    let modified = false;

    // Process analysis.full if it exists
    if (data.analysis && data.analysis.full) {
      const originalFull = data.analysis.full;
      const processedFull = processAnalysisText(originalFull);
      if (originalFull !== processedFull) {
        data.analysis.full = processedFull;
        modified = true;
      }
    }

    // Process analysis.synopsis if it exists
    if (data.analysis && data.analysis.synopsis) {
      const originalSynopsis = data.analysis.synopsis;
      const processedSynopsis = processAnalysisText(originalSynopsis);
      if (originalSynopsis !== processedSynopsis) {
        data.analysis.synopsis = processedSynopsis;
        modified = true;
      }
    }

    if (modified) {
      // Write back the modified content
      const newContent = yaml.dump(data, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });
      fs.writeFileSync(filePath, newContent, "utf8");
      return true;
    }

    return false;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  const yamlFiles = fs
    .readdirSync(POEMS_DIR)
    .filter(file => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter(file => !file.startsWith("_"))
    .filter(file => file !== "divide-and-lose.yaml"); // Skip already updated file

  console.log(`Found ${yamlFiles.length} YAML files to process...`);

  let processedCount = 0;
  let errorCount = 0;

  for (const yamlFile of yamlFiles) {
    const filePath = path.join(POEMS_DIR, yamlFile);
    console.log(`Processing ${yamlFile}...`);

    try {
      const wasModified = processFile(filePath);
      if (wasModified) {
        console.log(`✅ Updated ${yamlFile}`);
        processedCount++;
      } else {
        console.log(`⏭️  No changes needed for ${yamlFile}`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${yamlFile}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n📊 Processing complete: ${processedCount} files updated, ${errorCount} errors`);
}

if (require.main === module) {
  main();
}

module.exports = { processAnalysisText, processFile };

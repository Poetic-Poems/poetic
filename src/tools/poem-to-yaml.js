#!/usr/bin/env node
/**
 * Convert .poem files to YAML format
 * Based on poem-syntax.ebnf specification
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REPO_ROOT } = require('./repo-root');
const { needsRebuild, forceRebuildRequested } = require('./needs-rebuild');
const { PoemParser } = require('./poem-parser');


/**
 * Convert a .poem file to YAML
 */
/**
 * Parse a .poem file into a structured poem-data object, prepending a shared
 * poem's variable definitions when present. This is the single canonical
 * parse used by both the YAML pipeline and the raw plain-text converter, so
 * variable handling stays identical across outputs.
 *
 * `options.sharedPoemPath`, when given, overrides the default lookup of
 * `<poem's directory>/.shared.poem` — pass `null` to skip the prepend
 * entirely (e.g. for hermetic tests/fixtures that must not depend on
 * whatever `.shared.poem` happens to be on disk).
 */
function parsePoemFile(poemFilePath, options = {}) {
  let content = fs.readFileSync(poemFilePath, 'utf8');

  const sharedPoemPath = 'sharedPoemPath' in options
    ? options.sharedPoemPath
    : path.join(path.dirname(poemFilePath), '.shared.poem');

  if (sharedPoemPath && fs.existsSync(sharedPoemPath)) {
    const sharedContent = fs.readFileSync(sharedPoemPath, 'utf8');
    content = sharedContent + content;
  }

  return new PoemParser(content).parse();
}

// Canonical order for the top-level result keys, independent of which one
// happened to be assigned first during parsing (e.g. `directives` may be
// populated by a preamble directive before `title` is parsed). Keys not
// listed here (all keys within nested mappings) keep their insertion order,
// since the comparator returns 0 for any pair it doesn't recognise and
// Array.prototype.sort is stable.
const TOP_LEVEL_KEY_ORDER = [
  'title', 'author', 'date', 'versions', 'audio', 'postscript', 'analysis',
  'labels', 'directives',
];

function convertPoemToYaml(poemFilePath, options = {}) {
  const data = parsePoemFile(poemFilePath, options);

  return yaml.dump(data, {
    lineWidth: -1, // Don't wrap lines
    noRefs: true,  // Don't use YAML references
    sortKeys: (a, b) => TOP_LEVEL_KEY_ORDER.indexOf(a) - TOP_LEVEL_KEY_ORDER.indexOf(b),
  });
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: poem-to-yaml.js <file.poem> [output.yaml]');
    console.error('   or: poem-to-yaml.js --all');
    process.exit(1);
  }

  if (args[0] === '--all') {
    // Convert all .poem files in src/poems/poem/ directory
    const poemDir = path.join(REPO_ROOT, 'src', 'poems', 'poem');
    const yamlDir = path.join(REPO_ROOT, 'src', 'poems', 'yaml');
    const files = fs.readdirSync(poemDir);
    const force = forceRebuildRequested();

    let errorCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      // Skip partial/private files (starting with '_' or '.', e.g. .shared.poem)
      if (file.endsWith('.poem') && !file.startsWith('_') && !file.startsWith('.')) {
        const poemPath = path.join(poemDir, file);
        const yamlPath = path.join(yamlDir, file.replace('.poem', '.yaml'));
        const sharedPoemPath = path.join(poemDir, '.shared.poem');
        const inputs = [poemPath, ...(fs.existsSync(sharedPoemPath) ? [sharedPoemPath] : [])];

        if (!needsRebuild(yamlPath, inputs, { force })) {
          console.log(`⏭  Skipping ${file} (up to date)`);
          skippedCount++;
          continue;
        }

        try {
          console.log(`Converting ${file}...`);
          const yamlContent = convertPoemToYaml(poemPath);
          fs.writeFileSync(yamlPath, yamlContent, 'utf8');
          console.log(`  → ${path.basename(yamlPath)}`);
        } catch (error) {
          console.error(`Error converting ${file}:`, error.message);
          errorCount++;
        }
      }
    }

    if (skippedCount > 0) {
      console.log(`⏭  ${skippedCount} poem(s) already up to date, skipped.`);
    }

    // Warn about stale YAML artefacts that have no active source poem.
    const activePoemBases = new Set(
      files
        .filter(f => f.endsWith('.poem') && !f.startsWith('_') && !f.startsWith('.'))
        .map(f => f.replace('.poem', '.yaml'))
    );
    const existingYamls = fs.readdirSync(yamlDir).filter(
      f => f.endsWith('.yaml') && !f.startsWith('_') && !f.startsWith('.') && f !== 'YAML-SCHEMA.yaml'
    );
    for (const stale of existingYamls.filter(f => !activePoemBases.has(f))) {
      console.warn(`Warning: stale YAML artefact (no source poem): src/poems/yaml/${stale}`);
    }

    if (errorCount > 0) {
      console.error(`\n📊 ${errorCount} poem(s) failed to convert.`);
      process.exit(1);
    }
  } else {
    // Convert single file
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace('.poem', '.yaml');

    try {
      const yamlContent = convertPoemToYaml(inputFile);
      fs.writeFileSync(outputFile, yamlContent, 'utf8');
      console.log(`Converted ${inputFile} → ${outputFile}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { PoemParser, convertPoemToYaml, parsePoemFile };

#!/usr/bin/env node
/**
 * Build script to generate individual poem HTML files from YAML sources
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const pug = require("pug");
const { slugify } = require("./slugify");
const { formatDateForDisplay } = require("./date-utils");

const POEMS_DIR = path.join(process.cwd(), "src", "poems", "yaml");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const TEMPLATE_FILE = path.join(process.cwd(), "src", "templates", "poem.pug");

/**
 * Cache for resolved references to improve build performance
 */
const refCache = new Map();

/**
 * Validate that a referenced element exists in the loaded data
 */
function validateReferencedElement(data, jsonPath, refPath) {
  if (!jsonPath) return true;

  const pathParts = jsonPath.split('/').filter(part => part !== '');
  let current = data;

  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      console.error(`Error: Referenced element '${jsonPath}' not found in ${refPath}`);
      console.error(`Available keys: ${Object.keys(current || {}).join(', ')}`);
      return false;
    }
    current = current[part];
  }

  return true;
}

/**
 * Resolve $ref references in YAML data with validation and caching
 */
function resolveRefs(data, basePath = POEMS_DIR) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => resolveRefs(item, basePath));
  }

  // Handle $ref at the top level of an object
  if (data.$ref && typeof data.$ref === 'string') {
    const [filePath, jsonPath] = data.$ref.split('#');
    const fullPath = path.resolve(basePath, filePath);

    // Create cache key
    const cacheKey = `${fullPath}#${jsonPath || ''}`;

    // Check cache first
    if (refCache.has(cacheKey)) {
      return resolveRefs(refCache.get(cacheKey), path.dirname(fullPath));
    }

    try {
      // Validate file exists
      if (!fs.existsSync(fullPath)) {
        console.error(`Error: Referenced file not found: ${fullPath}`);
        console.error(`Reference: ${data.$ref}`);
        return data;
      }

      const refContent = fs.readFileSync(fullPath, 'utf8');
      const refData = yaml.load(refContent);

      // Validate the referenced element exists
      if (!validateReferencedElement(refData, jsonPath, fullPath)) {
        return data;
      }

      let result;
      if (jsonPath) {
        // Navigate to the specific path (e.g., "/disclaimer")
        const pathParts = jsonPath.split('/').filter(part => part !== '');
        result = refData;
        for (const part of pathParts) {
          result = result[part];
        }
      } else {
        result = refData;
      }

      // Cache the resolved reference
      refCache.set(cacheKey, result);

      return resolveRefs(result, path.dirname(fullPath));
    } catch (err) {
      console.error(`Error resolving reference ${data.$ref}:`, err.message);
      console.error(`File: ${fullPath}`);
      return data;
    }
  }

  // Recursively process all properties
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    // Don't recursively process Date objects - keep them as-is
    if (value instanceof Date) {
      result[key] = value;
    } else {
      result[key] = resolveRefs(value, basePath);
    }
  }

  return result;
}

/**
 * Read and parse a YAML poem file
 */
function readPoemFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const data = yaml.load(content);
    const resolvedData = resolveRefs(data, path.dirname(filePath));
    return resolvedData;
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Generate HTML from a poem data object
 */
function generatePoemHTML(poemData) {
  try {
    const compiledFunction = pug.compileFile(TEMPLATE_FILE, {
      pretty: false,
      cache: false,
    });
    const html = compiledFunction(poemData);
    return html;
  } catch (err) {
    console.error(`Error generating HTML for ${poemData.title}:`, err.message);
    return null;
  }
}

/**
 * Clear the reference cache at the start of each build
 */
function clearRefCache() {
  refCache.clear();
}

/**
 * Process all YAML files in the poems directory
 */
function buildAllPoems() {
  // Clear cache at the start of each build
  clearRefCache();
  // Ensure directories exist
  if (!fs.existsSync(POEMS_DIR)) {
    console.error(`Error: Poems directory not found: ${POEMS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`Error: Template file not found: ${TEMPLATE_FILE}`);
    process.exit(1);
  }

  // Get all YAML files
  const yamlFiles = fs
    .readdirSync(POEMS_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter((file) => !file.startsWith("YAML-SCHEMA"))
    .filter((file) => !file.startsWith("_")); // Skip files beginning with underscore

  if (yamlFiles.length === 0) {
    console.warn(`Warning: No YAML files found in ${POEMS_DIR}`);
    return;
  }

  console.log(`Found ${yamlFiles.length} poem(s) to build...`);

  let successCount = 0;
  let errorCount = 0;

  // Process each YAML file
  for (const yamlFile of yamlFiles) {
    const yamlPath = path.join(POEMS_DIR, yamlFile);
    const poemData = readPoemFile(yamlPath);

    if (!poemData) {
      errorCount++;
      return;
    }

    // Validate required fields
    if (!poemData.title) {
      console.error(`Error: Missing 'title' field in ${yamlFile}`);
      errorCount++;
      return;
    }

    if (!poemData.author) {
      console.error(`Error: Missing 'author' field in ${yamlFile}`);
      errorCount++;
      return;
    }

    // Calculate slug from title
    poemData.slug = slugify(poemData.title);

    // Format date for display
    if (poemData.date) {
      poemData.date = formatDateForDisplay(poemData.date);
    }

    // Check for empty versions and warn
    if (!poemData.versions || poemData.versions.length === 0) {
      console.warn(`⚠️  Warning: ${yamlFile} has empty versions block`);
    }

    // Generate HTML
    const html = generatePoemHTML(poemData);
    if (!html) {
      errorCount++;
      return;
    }

    // Prettify and write HTML file
    const outputFile = path.join(PUBLIC_DIR, `${poemData.slug}.html`);
    try {
      const beautify = require("js-beautify");
      const prettifiedHtml = beautify.html(html, {
        indent_size: 2,
        wrap_line_length: 80,
        preserve_newlines: false,
        max_preserve_newlines: 1,
        wrap_attributes: "auto"
      });
      fs.writeFileSync(outputFile, prettifiedHtml, "utf8");
      console.log(`✅ Generated ${poemData.slug}.html`);
      successCount++;
    } catch (err) {
      console.error(`Error writing ${outputFile}:`, err.message);
      errorCount++;
    }
  }

  console.log(
    `\n📊 Build complete: ${successCount} successful, ${errorCount} errors`
  );

  // Log cache statistics
  if (refCache.size > 0) {
    console.log(`💾 Reference cache: ${refCache.size} entries cached`);
  }

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  console.log("Building individual poem HTML files from YAML sources...\n");
  buildAllPoems();
}

module.exports = { buildAllPoems };

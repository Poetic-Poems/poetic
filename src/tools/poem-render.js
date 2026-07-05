/**
 * Centralised poem rendering module.
 *
 * Exports:
 *   resolveRefs(data, basePath)                     - resolve $ref in YAML data
 *   readPoemFile(filePath)                          - read and parse a YAML poem file
 *   loadPoemData(yamlPath)                          - read YAML, resolve refs, set slug + date
 *   renderFragment(poemData, { audiomackArtist })   - compile poem.pug fragment
 *   renderPage(poemData, { favicon, subtitle, audiomackArtist }) - compile poem-page.pug full doc
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const pug = require('pug');
const { slugFromFile } = require('./slugify');
const { formatDateForDisplay } = require('./date-utils');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const FRAGMENT_TEMPLATE = path.join(TEMPLATES_DIR, 'poem.pug');
const PAGE_TEMPLATE = path.join(TEMPLATES_DIR, 'poem-page.pug');

const POEMS_DIR = path.join(process.cwd(), 'src', 'poems', 'yaml');

/**
 * Cache for resolved $ref references
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
 * Resolve $ref references in YAML data with validation and caching.
 */
function resolveRefs(data, basePath = POEMS_DIR) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => resolveRefs(item, basePath));
  }

  if (data.$ref && typeof data.$ref === 'string') {
    const [filePath, jsonPath] = data.$ref.split('#');
    const fullPath = path.resolve(basePath, filePath);
    const cacheKey = `${fullPath}#${jsonPath || ''}`;

    if (refCache.has(cacheKey)) {
      return resolveRefs(refCache.get(cacheKey), path.dirname(fullPath));
    }

    try {
      if (!fs.existsSync(fullPath)) {
        console.error(`Error: Referenced file not found: ${fullPath}`);
        return data;
      }

      const refContent = fs.readFileSync(fullPath, 'utf8');
      const refData = yaml.load(refContent);

      if (!validateReferencedElement(refData, jsonPath, fullPath)) {
        return data;
      }

      let result;
      if (jsonPath) {
        const pathParts = jsonPath.split('/').filter(part => part !== '');
        result = refData;
        for (const part of pathParts) {
          result = result[part];
        }
      } else {
        result = refData;
      }

      refCache.set(cacheKey, result);
      return resolveRefs(result, path.dirname(fullPath));
    } catch (err) {
      console.error(`Error resolving reference ${data.$ref}:`, err.message);
      return data;
    }
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = value;
    } else {
      result[key] = resolveRefs(value, basePath);
    }
  }
  return result;
}

/**
 * Read and parse a YAML poem file, resolving $ref references.
 *
 * @param {string} filePath - Absolute path to the .yaml file
 * @returns {object|null}
 */
function readPoemFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(content);
    const resolvedData = resolveRefs(data, path.dirname(filePath));
    return resolvedData;
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Clear the reference cache (call at the start of each build).
 */
function clearRefCache() {
  refCache.clear();
}

/**
 * Read a YAML poem file, resolve $ref references, and augment with slug + display date.
 *
 * @param {string} yamlPath - Absolute path to the .yaml file
 * @returns {object|null} Poem data object or null on error
 */
function loadPoemData(yamlPath) {
  const poemData = readPoemFile(yamlPath);
  if (!poemData) return null;
  poemData.slug = slugFromFile(yamlPath);
  if (poemData.date) {
    poemData.date = formatDateForDisplay(poemData.date);
  }
  return poemData;
}

/**
 * Render a poem as an HTML fragment (no html/head/body wrapper).
 *
 * @param {object} poemData
 * @param {{ audiomackArtist?: string }} opts
 * @returns {string} HTML fragment string
 */
function renderFragment(poemData, opts = {}) {
  const { audiomackArtist = '' } = opts;
  const compiledFn = pug.compileFile(FRAGMENT_TEMPLATE, { pretty: false, cache: false });
  return compiledFn({ ...poemData, audiomackArtist });
}

/**
 * Render a poem as a full standalone HTML document.
 *
 * @param {object} poemData
 * @param {{ favicon?: string, subtitle?: string, audiomackArtist?: string }} opts
 *   favicon must already have any leading "public/" stripped.
 * @returns {string} Full HTML document string
 */
function renderPage(poemData, opts = {}) {
  const {
    favicon = 'poetic-logo.svg',
    subtitle = 'My Poems',
    audiomackArtist = '',
  } = opts;
  const compiledFn = pug.compileFile(PAGE_TEMPLATE, { pretty: false, cache: false });
  return compiledFn({ ...poemData, favicon, subtitle, audiomackArtist });
}

module.exports = { resolveRefs, readPoemFile, clearRefCache, loadPoemData, renderFragment, renderPage };

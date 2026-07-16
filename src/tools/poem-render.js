/**
 * Centralised poem rendering module.
 *
 * Exports:
 *   resolveRefs(data, basePath)                     - resolve $ref in YAML data
 *   readPoemFile(filePath)                          - read and parse a YAML poem file
 *   loadPoemData(yamlPath)                          - read YAML, resolve refs, set slug + date
 *   renderFragment(poemData, { config })            - compile poem.pug fragment
 *   renderPage(poemData, { favicon, subtitle, config }) - compile poem-page.pug full doc
 *   listPoemYamlFiles(dir)                          - list poem YAML basenames in a directory
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const pug = require('pug');
const { slugFromFile } = require('./slugify');
const { formatDateForDisplay } = require('./date-utils');
const { REPO_ROOT } = require('./repo-root');
const { CONTEXT_VAR_NAMES, substituteContextVars, resolveContextVars, songsFor } = require('./render-core');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const FRAGMENT_TEMPLATE = path.join(TEMPLATES_DIR, 'poem.pug');
const PAGE_TEMPLATE = path.join(TEMPLATES_DIR, 'poem-page.pug');

const POEMS_DIR = path.join(REPO_ROOT, 'src', 'poems', 'yaml');

// The build-time %{...} context-variable substitution helpers
// (substituteContextVars/resolveContextVars/CONTEXT_VAR_NAMES) live in
// render-core.js so the browser renderer can share them; imported above and
// re-exported below for existing consumers of this module.

/**
 * Cache for resolved $ref references
 */
const refCache = new Map();

/**
 * Thrown by resolveRefs when a $ref chain loops back on itself. Kept as a
 * distinct class so the catch block around the recursive resolveRefs call
 * (which otherwise swallows resolution errors and falls back to the raw
 * $ref node) can recognise and rethrow it instead of masking the cycle.
 */
class RefCycleError extends Error {}

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
 *
 * `visited` tracks the chain of $ref cache keys currently being resolved
 * (not the whole refCache, which legitimately holds the same file resolved
 * from multiple, unrelated branches — a diamond, not a cycle). Each branch
 * gets a fresh copy of `visited` at every $ref, so sibling references to the
 * same file are unaffected; only a $ref that loops back to an ancestor in
 * its own chain trips the guard.
 */
function resolveRefs(data, basePath = POEMS_DIR, visited = new Set()) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => resolveRefs(item, basePath, visited));
  }

  if (data.$ref && typeof data.$ref === 'string') {
    const [filePath, jsonPath] = data.$ref.split('#');
    const fullPath = path.resolve(basePath, filePath);
    const cacheKey = `${fullPath}#${jsonPath || ''}`;

    if (visited.has(cacheKey)) {
      const chain = [...visited, cacheKey].map(key => key.replace(/#$/, ''));
      throw new RefCycleError(`Reference cycle detected while resolving $ref: ${chain.join(' -> ')}`);
    }
    const nextVisited = new Set(visited).add(cacheKey);

    if (refCache.has(cacheKey)) {
      return resolveRefs(refCache.get(cacheKey), path.dirname(fullPath), nextVisited);
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
      return resolveRefs(result, path.dirname(fullPath), nextVisited);
    } catch (err) {
      if (err instanceof RefCycleError) {
        throw err;
      }
      console.error(`Error resolving reference ${data.$ref}:`, err.message);
      return data;
    }
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = value;
    } else {
      result[key] = resolveRefs(value, basePath, visited);
    }
  }
  return result;
}

/**
 * Collect the absolute paths of every file a poem transitively depends on via
 * `$ref`, so the incremental-rebuild check can treat them as inputs.
 *
 * Walks `data` for every `{ $ref: "<file>#<jsonPath>" }` node, resolves
 * `<file>` against `basePath` exactly as resolveRefs() does, and recurses into
 * each referenced file — using that file's own directory as the next basePath,
 * so a chained ref resolves relative to the file that declares it. The poem's
 * own file is not included. A referenced file that is missing or unparseable
 * is still recorded (so creating or repairing it invalidates the build) but is
 * not recursed into. `seen` guards against ref cycles and repeated work.
 *
 * @param {*} data - parsed (unresolved) YAML data
 * @param {string} [basePath] - directory `$ref` file paths resolve against
 * @param {Set<string>} [seen] - internal cycle/visited guard
 * @returns {string[]} deduplicated absolute paths of referenced files
 */
function collectRefFiles(data, basePath = POEMS_DIR, seen = new Set()) {
  const found = new Set();

  function walk(node, base) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, base);
      return;
    }
    if (!node || typeof node !== 'object') return;

    // A $ref node is replaced wholesale by its target (siblings are ignored),
    // mirroring resolveRefs — so follow the ref and don't walk its siblings.
    if (typeof node.$ref === 'string') {
      const [filePath] = node.$ref.split('#');
      const fullPath = path.resolve(base, filePath);
      found.add(fullPath);
      if (seen.has(fullPath)) return;
      seen.add(fullPath);
      let refData;
      try {
        refData = yaml.load(fs.readFileSync(fullPath, 'utf8'));
      } catch {
        return; // missing/unparseable: recorded above, nothing to recurse into
      }
      walk(refData, path.dirname(fullPath));
      return;
    }

    for (const value of Object.values(node)) walk(value, base);
  }

  walk(data, basePath);
  return [...found];
}

/**
 * Read a poem YAML file and return the absolute paths of every file it
 * transitively depends on via `$ref` (its own path excluded). Returns `[]`
 * when the file can't be read or parsed — the caller's own read then surfaces
 * the error, and the poem's own stale mtime still forces a rebuild. See
 * collectRefFiles() for the traversal semantics.
 *
 * @param {string} yamlPath - absolute path to a poem's YAML source
 * @returns {string[]}
 */
function refFilesForPoem(yamlPath) {
  let data;
  try {
    data = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  } catch {
    return [];
  }
  return collectRefFiles(data, path.dirname(yamlPath));
}

/**
 * List poem YAML source basenames in `dir`.
 *
 * Accepts both `.yaml` and `.yml` extensions; excludes files whose basename
 * starts with `YAML-SCHEMA` (the schema reference doc, not a poem) and files
 * whose basename starts with `_` (shared partials referenced via $ref, not
 * standalone poems). Returns basenames in `fs.readdirSync`'s platform order —
 * callers that need a stable order (e.g. for deterministic display) should
 * `.sort()` the result themselves.
 *
 * @param {string} dir - directory to scan (e.g. src/poems/yaml)
 * @returns {string[]} basenames (not full paths)
 */
function listPoemYamlFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .filter((file) => !file.startsWith('YAML-SCHEMA'))
    .filter((file) => !file.startsWith('_'));
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
 * @param {{ config?: object, standalone?: boolean }} opts
 *   config - parsed .poetic-config.yaml (drives song handlers)
 *   standalone - include a visible `h2.poem-title` heading, for a caller that
 *     embeds the fragment with no title heading of its own (default false;
 *     build-all-poems.js supplies its own external heading per poem, so it
 *     leaves this unset)
 * @returns {string} HTML fragment string
 */
function renderFragment(poemData, opts = {}) {
  const { config = {}, standalone = false } = opts;
  const data = resolveContextVars(poemData);
  const songs = songsFor(data, config);
  const compiledFn = pug.compileFile(FRAGMENT_TEMPLATE, { pretty: false, cache: false });
  return compiledFn({ ...data, songs, labelBase: '', standalone });
}

/**
 * Render a poem as a full standalone HTML document.
 *
 * @param {object} poemData
 * @param {{ favicon?: string, subtitle?: string, config?: object }} opts
 *   favicon must already have any leading "public/" stripped.
 * @returns {string} Full HTML document string
 */
function renderPage(poemData, opts = {}) {
  const {
    favicon = 'poetic-logo.svg',
    subtitle = 'My Poems',
    config = {},
  } = opts;
  const data = resolveContextVars(poemData);
  const songs = songsFor(data, config);
  const compiledFn = pug.compileFile(PAGE_TEMPLATE, { pretty: false, cache: false });
  return compiledFn({ ...data, favicon, subtitle, songs, labelBase: '../' });
}

module.exports = {
  resolveRefs, readPoemFile, clearRefCache, loadPoemData, renderFragment, renderPage,
  substituteContextVars, resolveContextVars, CONTEXT_VAR_NAMES, listPoemYamlFiles,
  collectRefFiles, refFilesForPoem,
  FRAGMENT_TEMPLATE, PAGE_TEMPLATE,
};

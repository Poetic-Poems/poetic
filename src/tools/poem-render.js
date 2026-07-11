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
const { resolveSongs } = require('./song-handlers');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const FRAGMENT_TEMPLATE = path.join(TEMPLATES_DIR, 'poem.pug');
const PAGE_TEMPLATE = path.join(TEMPLATES_DIR, 'poem-page.pug');

const POEMS_DIR = path.join(REPO_ROOT, 'src', 'poems', 'yaml');

/**
 * The closed set of build-time "context" variable names that `%{name}`
 * references resolve against at render time (distinct from author `${name}`
 * variables, which are resolved earlier by poem-to-yaml.js).
 */
const CONTEXT_VAR_NAMES = ['slug', 'title', 'author', 'date'];

/**
 * Substitute build-time context references in `text`:
 *   %{name}          - the context value for `name` (see CONTEXT_VAR_NAMES).
 *   %{name:-default} - `default` when `name` is not a known/defined context var.
 *   \%{name}         - a literal `%{name}` (the leading backslash is consumed).
 * An unknown context name with no fallback is left as a literal `%{name}`.
 */
function substituteContextVars(text, ctx) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '%' && text[i + 2] === '{') {
      out += '%{';
      i += 3;
      continue;
    }
    if (c === '%' && text[i + 1] === '{') {
      const close = text.indexOf('}', i + 2);
      if (close === -1) { out += c; i++; continue; }
      const inner = text.slice(i + 2, close);
      i = close + 1;
      if (inner === '') { out += '%{}'; continue; }
      let name = inner;
      let fallback = null;
      const sep = inner.indexOf(':-');
      if (sep !== -1) { name = inner.slice(0, sep); fallback = inner.slice(sep + 2); }
      if (Object.prototype.hasOwnProperty.call(ctx, name) && ctx[name] != null) {
        out += String(ctx[name]);
      } else if (fallback !== null) {
        out += fallback;
      } else {
        out += '%{' + inner + '}';
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Return a deep copy of `value` with every string run through
 * substituteContextVars(). Non-string leaves (including Date) are passed through
 * unchanged; shared/cached objects are never mutated in place.
 */
function applyContextVars(value, ctx) {
  if (typeof value === 'string') return substituteContextVars(value, ctx);
  if (Array.isArray(value)) return value.map((v) => applyContextVars(v, ctx));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyContextVars(v, ctx);
    return out;
  }
  return value;
}

/**
 * Resolve the `%{...}` context references in a poem's content from its own
 * fields, returning a new poem-data object (the input is left untouched).
 */
function resolveContextVars(poemData) {
  const ctx = {};
  for (const name of CONTEXT_VAR_NAMES) ctx[name] = poemData[name];
  return applyContextVars(poemData, ctx);
}

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
 * Resolve a poem's audio section into the `songs` render model (see
 * song-handlers.js). Returns [] when the poem has no audio.
 */
function songsFor(data, config) {
  return resolveSongs(data.audio, {
    ctx: { slug: data.slug, title: data.title, author: data.author, date: data.date },
    config: config || {},
  });
}

/**
 * Render a poem as an HTML fragment (no html/head/body wrapper).
 *
 * @param {object} poemData
 * @param {{ config?: object }} opts - parsed .poetic-config.yaml (drives song handlers)
 * @returns {string} HTML fragment string
 */
function renderFragment(poemData, opts = {}) {
  const { config = {} } = opts;
  const data = resolveContextVars(poemData);
  const songs = songsFor(data, config);
  const compiledFn = pug.compileFile(FRAGMENT_TEMPLATE, { pretty: false, cache: false });
  return compiledFn({ ...data, songs, labelBase: '' });
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
};

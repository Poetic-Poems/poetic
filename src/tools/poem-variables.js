/**
 * Author `${...}` variable substitution for the `.poem` grammar: reference
 * expansion (`substituteVariables`/`expandVars`/`resolveVar`), inline
 * `${...}` expansion within a scanned shell word (`expandVarAt`), standalone
 * multi-line reference expansion (`expandStandaloneRefs`), and the reserved
 * eager-binding name check (`checkReservedName`). These functions carry no
 * parser state of their own — each takes the variables map (and, where
 * relevant, the used-before-defined set) as an explicit argument rather than
 * closing over `this` — so they extract standalone, following the
 * pure-function, browser-safe pattern poem-markup.js establishes.
 *
 * Keep this module browser-safe: it has no dependencies, so do NOT add
 * fs/path/__dirname or any other Node-only dependency here.
 */

/**
 * Throw if `name` uses the reserved eager/early-binding form (a leading `!`,
 * e.g. `={!name}=`). The behaviour is reserved for a future release; parsing
 * it now is an error rather than a silently-accepted ordinary name.
 *
 * @param {string} name
 */
function checkReservedName(name) {
  if (name[0] === '!') {
    throw new Error(
      `Reserved syntax: eager/early-binding variable '={!${name.slice(1)}}=' ` +
      'is reserved but not yet implemented (a leading \'!\' in a variable name is reserved).'
    );
  }
}

/**
 * Substitute author `${...}` variable references in `text`.
 *
 *   ${name}          - the variable's value (its last definition in the file).
 *                      Nested ${...} inside that value are expanded
 *                      recursively, at use (late/dynamic binding).
 *   ${name:-default} - `default` when `name` is undefined.
 *   \${...}          - a literal `${...}` (the leading backslash is consumed).
 *
 * A reference cycle resolves to the literal `${...}` and warns (no infinite
 * loop). Context references (`%{...}`) are NOT touched here - they are left
 * for the render stage. The reserved eager form `${!name}` throws.
 *
 * @param {string} text
 * @param {Map<string, (string|string[])>} variables
 * @param {Set<string>} usedBeforeDefined
 * @returns {string}
 */
function substituteVariables(text, variables, usedBeforeDefined) {
  return expandVars(text, [], variables, usedBeforeDefined);
}

/**
 * Core scanner for substituteVariables(). Walks `text` left to right so that
 * `\${...}` escaping is honoured exactly once; `stack` carries the chain of
 * variables currently being expanded, for cycle detection.
 *
 * @param {string} text
 * @param {string[]} stack - names of variables currently being expanded
 * @param {Map<string, (string|string[])>} variables
 * @param {Set<string>} usedBeforeDefined
 * @returns {string}
 */
function expandVars(text, stack, variables, usedBeforeDefined) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '$' && text[i + 2] === '{') {
      // Escaped reference: emit a literal "${"; the name and closing "}"
      // that follow are ordinary characters and are copied verbatim.
      out += '${';
      i += 3;
      continue;
    }
    if (c === '$' && text[i + 1] === '{') {
      const close = text.indexOf('}', i + 2);
      if (close === -1) { out += c; i++; continue; }
      const inner = text.slice(i + 2, close);
      i = close + 1;
      out += inner === '' ? '${}' : resolveVar(inner, stack, variables, usedBeforeDefined);
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Resolve the interior of one `${...}` reference (`inner` is the text between
 * the braces): apply the `:-default` fallback, cycle detection, and recursive
 * expansion of the resulting value.
 *
 * @param {string} inner - text between the `${` and `}`
 * @param {string[]} stack - names of variables currently being expanded
 * @param {Map<string, (string|string[])>} variables
 * @param {Set<string>} usedBeforeDefined
 * @returns {string}
 */
function resolveVar(inner, stack, variables, usedBeforeDefined) {
  if (inner[0] === '!') {
    throw new Error(
      `Reserved syntax: eager/early-binding reference '\${${inner}}' is reserved ` +
      'but not yet implemented (a leading \'!\' in a variable name is reserved).'
    );
  }
  let name = inner;
  let fallback = null;
  const sep = inner.indexOf(':-');
  if (sep !== -1) {
    name = inner.slice(0, sep);
    fallback = inner.slice(sep + 2);
  }
  if (stack.includes(name)) {
    console.warn(`Warning: Variable reference cycle detected at '\${${name}}'; left unexpanded.`);
    return '${' + inner + '}';
  }
  if (variables.has(name)) {
    let value = variables.get(name);
    if (Array.isArray(value)) value = value.join('\n');
    return expandVars(value, stack.concat(name), variables, usedBeforeDefined);
  }
  if (fallback !== null) {
    return expandVars(fallback, stack, variables, usedBeforeDefined);
  }
  usedBeforeDefined.add(name);
  return '${' + inner + '}';
}

/**
 * Expand a `${name}` reference found at `str[at]` (where `str[at] === '$'`
 * and `str[at + 1] === '{'`). Looks for the next `}` anywhere later in `str`
 * (variable names cannot contain `{`, `}`, `$`, `<`, `>`, so the first `}`
 * closes the reference; a `:-default` fallback likewise cannot contain `}`).
 * The isolated `${...}` token is handed to substituteVariables(), so nested
 * references and the `:-default` fallback are resolved. Returns
 * `{ text, nextIndex }` with the substituted (or, if undefined, literal) text
 * and the index just past the closing `}`, or null if there is no `}` later
 * in the string (in which case `$` is not treated as starting a `${...}`
 * token, and is instead ordinary literal text - matching substituteVariables(),
 * which likewise leaves an unterminated `${` untouched).
 *
 * @param {string} str
 * @param {number} at - index of the `$` that starts the reference
 * @param {Map<string, (string|string[])>} variables
 * @param {Set<string>} usedBeforeDefined
 * @returns {{text: string, nextIndex: number}|null}
 */
function expandVarAt(str, at, variables, usedBeforeDefined) {
  const closeIdx = str.indexOf('}', at + 2);
  if (closeIdx === -1) return null;
  const token = str.slice(at, closeIdx + 1); // "${name}"
  return { text: substituteVariables(token, variables, usedBeforeDefined), nextIndex: closeIdx + 1 };
}

/**
 * Recursively expand standalone multi-line variable references (`${name}` on
 * its own line) into the referenced variable's raw body lines. `stack` guards
 * against reference cycles (a self-referential multi-line variable is left as
 * a literal line with a warning rather than looping forever). Lines that are
 * not standalone references to a multi-line variable are passed through
 * unchanged.
 *
 * @param {string[]} lines
 * @param {string[]} stack - names of variables currently being expanded
 * @param {Map<string, (string|string[])>} variables
 * @returns {string[]}
 */
function expandStandaloneRefs(lines, stack, variables) {
  const out = [];
  for (const line of lines) {
    const m = line.trim().match(/^\$\{([^}]+)\}$/);
    if (m) {
      const name = m[1];
      const value = variables.get(name);
      if (Array.isArray(value)) {
        if (stack.includes(name)) {
          console.warn(`Warning: Variable reference cycle detected at '\${${name}}'; left unexpanded.`);
          out.push(line);
        } else {
          out.push(...expandStandaloneRefs(value, stack.concat(name), variables));
        }
        continue;
      }
      // Single-line variable, undefined, or a `%{...}`-style token: leave the
      // line for substituteVariables() (or the render stage) to handle.
    }
    out.push(line);
  }
  return out;
}

module.exports = {
  checkReservedName,
  substituteVariables,
  expandVars,
  resolveVar,
  expandVarAt,
  expandStandaloneRefs,
};

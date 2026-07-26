'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  checkReservedName,
  substituteVariables,
  expandVars,
  resolveVar,
  expandVarAt,
  expandStandaloneRefs,
} = require('../src/tools/poem-variables');

test('checkReservedName throws for a leading "!" and is silent otherwise', () => {
  assert.throws(() => checkReservedName('!eager'), /Reserved syntax/);
  assert.doesNotThrow(() => checkReservedName('ordinary'));
});

test('substituteVariables expands a defined variable and leaves an undefined one literal', () => {
  const variables = new Map([['name', 'World']]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('Hello, ${name}!', variables, usedBeforeDefined), 'Hello, World!');
  assert.strictEqual(substituteVariables('${missing}', variables, usedBeforeDefined), '${missing}');
  assert.ok(usedBeforeDefined.has('missing'));
});

test('substituteVariables applies the ":-default" fallback only when undefined', () => {
  const variables = new Map([['x', 'ACTUAL']]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('${missing:-fallback}', variables, usedBeforeDefined), 'fallback');
  assert.strictEqual(substituteVariables('${x:-fallback}', variables, usedBeforeDefined), 'ACTUAL');
});

test('substituteVariables resolves nested references recursively (late/dynamic binding)', () => {
  const variables = new Map([['a', 'A'], ['b', '[${a}]']]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('${b}', variables, usedBeforeDefined), '[A]');
});

test('substituteVariables leaves an escaped "\\${...}" as a literal', () => {
  const variables = new Map([['x', 'VALUE']]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('\\${x}', variables, usedBeforeDefined), '${x}');
});

test('substituteVariables leaves an unterminated "${" untouched', () => {
  const variables = new Map();
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('a ${b', variables, usedBeforeDefined), 'a ${b');
});

test('substituteVariables joins a multi-line (array-valued) variable with newlines', () => {
  const variables = new Map([['body', ['line1', 'line2']]]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(substituteVariables('${body}', variables, usedBeforeDefined), 'line1\nline2');
});

test('expandVars/resolveVar: a reference cycle resolves to the literal and warns instead of hanging', () => {
  const variables = new Map([['a', '${a}']]);
  const usedBeforeDefined = new Set();
  assert.strictEqual(expandVars('${a}', [], variables, usedBeforeDefined), '${a}');
});

test('expandVars: an empty "${}" reference renders literally', () => {
  const variables = new Map();
  const usedBeforeDefined = new Set();
  assert.strictEqual(expandVars('${}', [], variables, usedBeforeDefined), '${}');
});

test('resolveVar throws for the reserved eager form "${!name}"', () => {
  const variables = new Map();
  const usedBeforeDefined = new Set();
  assert.throws(() => resolveVar('!name', [], variables, usedBeforeDefined), /Reserved syntax/);
});

test('expandVarAt expands a "${name}" reference and returns the index just past its "}"', () => {
  const variables = new Map([['who', 'World']]);
  const usedBeforeDefined = new Set();
  const result = expandVarAt('Hi ${who}!', 3, variables, usedBeforeDefined);
  assert.deepStrictEqual(result, { text: 'World', nextIndex: 9 });
});

test('expandVarAt returns null when there is no closing "}" later in the string', () => {
  const variables = new Map();
  const usedBeforeDefined = new Set();
  assert.strictEqual(expandVarAt('${unterminated', 0, variables, usedBeforeDefined), null);
});

test('expandStandaloneRefs inlines a standalone multi-line-variable reference recursively', () => {
  const variables = new Map([['a', ['A1', 'A2']], ['b', ['${a}', 'B2']]]);
  assert.deepStrictEqual(
    expandStandaloneRefs(['before', '${b}', 'after'], [], variables),
    ['before', 'A1', 'A2', 'B2', 'after']
  );
});

test('expandStandaloneRefs leaves a self-referential multi-line variable as a literal line', () => {
  const variables = new Map([['a', ['${a}']]]);
  assert.deepStrictEqual(expandStandaloneRefs(['${a}'], [], variables), ['${a}']);
});

test('expandStandaloneRefs leaves a non-reference or single-line-variable reference untouched', () => {
  const variables = new Map([['name', 'inline']]);
  assert.deepStrictEqual(
    expandStandaloneRefs(['plain text', '${name}', '${undefined}'], [], variables),
    ['plain text', '${name}', '${undefined}']
  );
});

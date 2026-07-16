'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const { resolveTemplatePath, injectBetween, findSkinUnsafeTags } = require('../src/tools/build-blogger.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poetic-blogger-test-'));
}

function touch(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// resolveTemplatePath
// ---------------------------------------------------------------------------

describe('resolveTemplatePath', () => {
  it('uses config.blogger.template when set', () => {
    const tmpDir = makeTempDir();
    const customPath = path.join(tmpDir, 'my-custom-template.html');
    touch(customPath);
    const result = resolveTemplatePath({ blogger: { template: customPath } }, tmpDir);
    assert.equal(result, customPath);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('falls back to blogger-template.html when it exists', () => {
    const tmpDir = makeTempDir();
    const canonicalPath = path.join(tmpDir, 'blogger-template.html');
    touch(canonicalPath);
    const result = resolveTemplatePath({}, tmpDir);
    assert.equal(result, canonicalPath);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('falls back to *.template.html when blogger-template.html is absent', () => {
    const tmpDir = makeTempDir();
    const legacyPath = path.join(tmpDir, 'fragments-and-unity.template.html');
    touch(legacyPath);
    const result = resolveTemplatePath({}, tmpDir);
    assert.equal(result, legacyPath);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns default blogger-template.html path when no template file exists', () => {
    const tmpDir = makeTempDir();
    const result = resolveTemplatePath({}, tmpDir);
    assert.equal(result, path.join(tmpDir, 'blogger-template.html'));
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// injectBetween
// ---------------------------------------------------------------------------

describe('injectBetween', () => {
  const CSS_START = '/* ~~ CUSTOM CSS START ~~ */';
  const CSS_END   = '/* ~~ CUSTOM CSS END ~~ */';
  const JS_START  = '<!-- ~~ CUSTOM JS START ~~ -->';
  const JS_END    = '<!-- ~~ CUSTOM JS END ~~ -->';

  it('replaces content between CSS markers', () => {
    const content = `before\n${CSS_START}\nold stuff\n${CSS_END}\nafter`;
    const result  = injectBetween(content, CSS_START, CSS_END, 'new css');
    assert.ok(result.includes(`${CSS_START}\n\nnew css\n\n${CSS_END}`), 'payload injected');
    assert.ok(!result.includes('old stuff'), 'old content removed');
    assert.ok(result.includes('before'), 'before content preserved');
    assert.ok(result.includes('after'), 'after content preserved');
  });

  it('is idempotent on re-run with CSS markers', () => {
    const content  = `${CSS_START}\nold stuff\n${CSS_END}`;
    const first    = injectBetween(content, CSS_START, CSS_END, 'new css');
    const second   = injectBetween(first, CSS_START, CSS_END, 'new css');
    assert.equal(first, second, 'second run produces same result');
  });

  it('replaces content between JS markers', () => {
    const content = `<body>\n${JS_START}\n<script>old</script>\n${JS_END}\n</body>`;
    const result  = injectBetween(content, JS_START, JS_END, '<script>new</script>');
    assert.ok(result.includes(`${JS_START}\n\n<script>new</script>\n\n${JS_END}`));
    assert.ok(!result.includes('<script>old</script>'), 'old JS removed');
  });

  it('returns content unchanged when start marker is absent', () => {
    const content = `some content\n${CSS_END}\nmore`;
    const result  = injectBetween(content, CSS_START, CSS_END, 'payload');
    assert.equal(result, content, 'unchanged when start marker missing');
  });

  it('returns content unchanged when end marker is absent', () => {
    const content = `some content\n${CSS_START}\nmore`;
    const result  = injectBetween(content, CSS_START, CSS_END, 'payload');
    assert.equal(result, content, 'unchanged when end marker missing');
  });

  it('returns content unchanged when both markers are absent', () => {
    const content = 'no markers here';
    const result  = injectBetween(content, JS_START, JS_END, 'payload');
    assert.equal(result, content, 'unchanged when no markers');
  });
});

// ---------------------------------------------------------------------------
// findSkinUnsafeTags
// ---------------------------------------------------------------------------

describe('findSkinUnsafeTags', () => {
  it('finds tag-shaped text in a comment, which is where prose lives', () => {
    const css = '/* The sort <button> fills the whole <th> so the target matches. */';
    assert.deepEqual(findSkinUnsafeTags(css), [
      { line: 1, tag: '<button>' },
      { line: 1, tag: '<th>' },
    ]);
  });

  it('reports the line of each occurrence', () => {
    const css = 'a { color: red; }\n/* wraps the <a> element */\n/* and a <span> */';
    assert.deepEqual(findSkinUnsafeTags(css), [
      { line: 2, tag: '<a>' },
      { line: 3, tag: '<span>' },
    ]);
  });

  it('passes clean CSS, including a less-than that is not a tag', () => {
    const css = [
      'body { margin: 0 }',
      '/* suppress the control when truncation would hide <= 1 line */',
      '/* per-service tweaks use the .song-embed--{service} modifier */',
      '.a > .b { top: 0 }',
    ].join('\n');
    assert.deepEqual(findSkinUnsafeTags(css), []);
  });

  it('finds closing and self-closing tags too', () => {
    assert.deepEqual(findSkinUnsafeTags('/* </b:skin> <br/> */'), [
      { line: 1, tag: '</b:skin>' },
      { line: 1, tag: '<br/>' },
    ]);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const { resolveTemplatePath, injectBetween, findSkinUnsafeTags, injectCSSIntoTemplate } = require('../src/tools/build-blogger.js');

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
  it('uses config.blogger.template when set, resolved against the repo root', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const customPath = path.join(publicDir, 'my-custom-template.html');
    touch(customPath);
    const result = resolveTemplatePath({ blogger: { template: 'public/my-custom-template.html' } }, publicDir);
    assert.equal(result, customPath);
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('uses an absolute config.blogger.template that lies inside the repo root', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const customPath = path.join(publicDir, 'my-custom-template.html');
    touch(customPath);
    const result = resolveTemplatePath({ blogger: { template: customPath } }, publicDir);
    assert.equal(result, customPath);
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('rejects a blogger.template that escapes the repo root via ../ and falls back to the default', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const canonicalPath = path.join(publicDir, 'blogger-template.html');
    touch(canonicalPath);
    const result = resolveTemplatePath({ blogger: { template: '../../../etc/passwd' } }, publicDir);
    assert.equal(result, canonicalPath);
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('rejects an absolute blogger.template outside the repo root and falls back to the default', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const canonicalPath = path.join(publicDir, 'blogger-template.html');
    touch(canonicalPath);
    const result = resolveTemplatePath({ blogger: { template: '/etc/passwd' } }, publicDir);
    assert.equal(result, canonicalPath);
    fs.rmSync(repoRoot, { recursive: true });
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

  it('rejects a blogger.template that is a symlink escaping the repo root and falls back to the default', () => {
    const repoRoot = fs.realpathSync(makeTempDir());
    const publicDir = path.join(repoRoot, 'public');
    const canonicalPath = path.join(publicDir, 'blogger-template.html');
    touch(canonicalPath, 'default template');
    // Named after the (unique) temp dir: this lands in os.tmpdir() itself,
    // where a fixed name would collide with a concurrent run of this suite.
    const outsideFile = path.join(
      repoRoot,
      '..',
      `secret-template-${path.basename(repoRoot)}.html`
    );
    touch(outsideFile, 'attacker-controlled');
    const linkPath = path.join(publicDir, 'linked-template.html');
    fs.symlinkSync(outsideFile, linkPath);

    const result = resolveTemplatePath(
      { blogger: { template: 'public/linked-template.html' } },
      publicDir
    );
    assert.equal(result, canonicalPath);
    fs.rmSync(outsideFile, { force: true });
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('accepts a blogger.template that references a nonexistent file without crashing (missing-target is not a containment failure)', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const canonicalPath = path.join(publicDir, 'blogger-template.html');
    touch(canonicalPath, 'default template');
    assert.doesNotThrow(() => {
      const result = resolveTemplatePath(
        { blogger: { template: 'public/does-not-exist.html' } },
        publicDir
      );
      assert.equal(result, path.join(publicDir, 'does-not-exist.html'));
    });
    fs.rmSync(repoRoot, { recursive: true });
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

// ---------------------------------------------------------------------------
// injectCSSIntoTemplate
// ---------------------------------------------------------------------------

describe('injectCSSIntoTemplate', () => {
  const FIXTURE_TEMPLATE = [
    '<html><head>',
    '/* ~~ CUSTOM CSS START ~~ */',
    '/* ~~ CUSTOM CSS END ~~ */',
    '</head><body>',
    '<!-- ~~ CUSTOM JS START ~~ -->',
    '<!-- ~~ CUSTOM JS END ~~ -->',
    '</body></html>',
  ].join('\n');

  it('injects CSS and JS from public/ into the template and writes the result', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const templatePath = path.join(publicDir, 'blogger-template.html');
    touch(templatePath, FIXTURE_TEMPLATE);
    touch(path.join(publicDir, 'poetic.css'), 'body { color: red; }');
    touch(path.join(publicDir, 'custom.css'), '.custom { color: blue; }');
    touch(path.join(publicDir, 'poetic.js'), "console.log('hi');");

    injectCSSIntoTemplate({ repoRoot, publicDir });

    const result = fs.readFileSync(templatePath, 'utf8');
    assert.match(result, /body \{ color: red; \}/, 'poetic.css injected');
    assert.match(result, /\.custom \{ color: blue; \}/, 'custom.css injected');
    assert.match(result, /\.poem-labels \{ display: none !important; \}/, 'poem-labels rule appended');
    assert.match(result, /console\.log\('hi'\);/, 'poetic.js injected');
    assert.match(result, /<!\[CDATA\[/, 'JS wrapped in a CDATA block');
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('skips CSS/JS injection and leaves the template unchanged when public/ has no CSS or JS files', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const templatePath = path.join(publicDir, 'blogger-template.html');
    touch(templatePath, FIXTURE_TEMPLATE);

    injectCSSIntoTemplate({ repoRoot, publicDir });

    assert.equal(fs.readFileSync(templatePath, 'utf8'), FIXTURE_TEMPLATE);
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('rejects CSS containing tag-shaped text and leaves the template untouched (process exits non-zero)', () => {
    // Runs the real function as a subprocess (rather than calling it
    // in-process) because the unsafe-tag rejection path calls
    // process.exit(1), which would otherwise tear down the whole test worker.
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    const templatePath = path.join(publicDir, 'blogger-template.html');
    touch(templatePath, FIXTURE_TEMPLATE);
    touch(path.join(publicDir, 'poetic.css'), '/* the sort <button> fills the row */');

    const script = `
      const { injectCSSIntoTemplate } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'tools', 'build-blogger.js'))});
      injectCSSIntoTemplate({
        repoRoot: ${JSON.stringify(repoRoot)},
        publicDir: ${JSON.stringify(publicDir)},
      });
    `;
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /CSS contains tag-shaped text/);
    assert.match(result.stderr, /public\/poetic\.css:1: <button>/);
    assert.equal(fs.readFileSync(templatePath, 'utf8'), FIXTURE_TEMPLATE, 'template left untouched');
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('reports an error and exits non-zero when the template file is missing', () => {
    const repoRoot = makeTempDir();
    const publicDir = path.join(repoRoot, 'public');
    fs.mkdirSync(publicDir, { recursive: true });

    const script = `
      const { injectCSSIntoTemplate } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'tools', 'build-blogger.js'))});
      injectCSSIntoTemplate({
        repoRoot: ${JSON.stringify(repoRoot)},
        publicDir: ${JSON.stringify(publicDir)},
      });
    `;
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Template file not found/);
    fs.rmSync(repoRoot, { recursive: true });
  });
});

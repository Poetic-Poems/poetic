'use strict';

/**
 * Tests for src/tools/aggregate-render-core.js — the pure, filesystem-free
 * index/all-poems templating helpers shared by the Node build path
 * (build-all-poems.js) and the browser renderer (src/browser/render-aggregate.js).
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  escapeAmpersand, escapeHtml, summarizePoem, buildPoemDataIsland, renderFreshIndexHtml,
  renderAllPoemsHtml,
} = require('../src/tools/aggregate-render-core');

test('escapeAmpersand: escapes only "&"', () => {
  assert.strictEqual(escapeAmpersand('Fish & Chips <b>'), 'Fish &#38; Chips <b>');
});

test('escapeHtml: escapes "&", "<", ">" and \'"\' (matching Pug\'s default escaping)', () => {
  assert.strictEqual(escapeHtml(`Fish & Chips <b>"tasty"</b>`), 'Fish &amp; Chips &lt;b&gt;&quot;tasty&quot;&lt;/b&gt;');
});

test('summarizePoem: derives display date, ISO date, hasAudio and labels from raw poem-data', () => {
  const summary = summarizePoem({
    data: { title: 'A Song', date: '2020-05-04', audio: { audiomack: true }, labels: ['x', 'y'] },
    slug: 'a-song',
  }, {});
  assert.deepStrictEqual(summary, {
    slug: 'a-song',
    title: 'A Song',
    date: 'Monday, 4 May 2020',
    isoDate: '2020-05-04',
    hasAudio: true,
    labels: ['x', 'y'],
  });
});

test('summarizePoem: missing date/audio/labels fall back to safe defaults', () => {
  const summary = summarizePoem({ data: { title: 'No Date' }, slug: 'no-date' }, {});
  assert.deepStrictEqual(summary, {
    slug: 'no-date',
    title: 'No Date',
    date: 'Unknown Date',
    isoDate: '',
    hasAudio: false,
    labels: [],
  });
});

test('summarizePoem: hasAudio is false when the audio service has no matching handler', () => {
  const summary = summarizePoem({
    data: { title: 'X', date: '2020-01-01', audio: { 'no-such-service': true } }, slug: 'x',
  }, {});
  assert.strictEqual(summary.hasAudio, false);
});

test('buildPoemDataIsland: escapes "<" so a title containing "</script>" cannot terminate the island early', () => {
  const island = buildPoemDataIsland([{ file: 'x/', title: 'Sneaky </script> Title', hasAudio: false, date: '2020-01-01', labels: [] }]);
  assert.doesNotMatch(island, /<\/script>\s*Title/);
  assert.match(island, /<script type="application\/json" id="poem-data">/);
  assert.match(island, /<script src="index\.js" defer><\/script>/);
});

test('renderFreshIndexHtml: embeds the site title/subtitle/favicon and the poem-data island', () => {
  const html = renderFreshIndexHtml(
    [{ file: 'a/', title: 'Poem A', hasAudio: true, date: '2020-01-01', labels: ['l1'] }],
    { siteTitle: 'My Site', subtitle: 'A Subtitle', favicon: 'icon.svg' }
  );
  assert.match(html, /<title>My Site<\/title>/);
  assert.match(html, /<h1>My Site<\/h1>/);
  assert.match(html, /<p class="subtitle">A Subtitle<\/p>/);
  assert.match(html, /<link rel="icon" href="icon\.svg"/);
  assert.match(html, /"file": "a\/"/);
  assert.match(html, /"hasAudio": true/);
});

test('renderAllPoemsHtml: returns the "No Poems Found" page for an empty entry list', () => {
  const html = renderAllPoemsHtml([], { siteTitle: 'My Site', favicon: 'icon.svg' });
  assert.match(html, /<title>No Poems Found<\/title>/);
  assert.doesNotMatch(html, /My Site/);
});

test('renderAllPoemsHtml: renders a table-of-contents row and poem-section per entry, with a working audio icon', () => {
  const entries = [
    {
      slug: 'first', title: 'First Poem', date: 'Wednesday, 1 January 2020', isoDate: '2020-01-01',
      hasAudio: true, content: '<p>first content</p>',
    },
    {
      slug: 'second', title: 'Second Poem', date: 'Thursday, 2 January 2020', isoDate: '2020-01-02',
      hasAudio: false, content: '<p>second content</p>',
    },
  ];
  const html = renderAllPoemsHtml(entries, { siteTitle: 'My Site', favicon: 'icon.svg' });

  assert.match(html, /<title>My Site &#8212; Concatenated View<\/title>/);
  assert.match(html, /Concatenated view of all poems \(2 poems\)/);

  assert.match(html, /<a href="#poem-first">First Poem<\/a>/);
  assert.match(html, /<a href="#poem-second">Second Poem<\/a>/);
  assert.match(html, /<td class="audio-cell">🎵<\/td>/);

  assert.match(html, /<div class="poem-section" id="poem-first" data-date="2020-01-01">/);
  assert.match(html, /<h2 class="poem-title"><a href="first\/">First Poem<\/a><\/h2>/);
  assert.match(html, /<div class="poem-content"><p>first content<\/p><\/div>/);

  // Date-range filter bounds reflect the min/max ISO dates across entries.
  assert.match(html, /id="dateFrom" class="filter-date" min="2020-01-01" max="2020-01-02"/);
});

test('renderAllPoemsHtml: HTML-escapes a title containing "<", "&" and \'"\' at both interpolation sites', () => {
  const entries = [{
    slug: 'x', title: `<img src=x onerror=alert(1)> & "quoted"`, date: 'Wednesday, 1 January 2020',
    isoDate: '2020-01-01', hasAudio: false, content: '<p>content</p>',
  }];
  const html = renderAllPoemsHtml(entries, { siteTitle: 'My Site', favicon: 'icon.svg' });

  // Neither interpolation site lets the title break out of its markup or
  // introduce a live tag/attribute — it must appear only as escaped text.
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(
    html,
    /<td><a href="#poem-x">&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quoted&quot;<\/a><\/td>/
  );
  assert.match(
    html,
    /<h2 class="poem-title"><a href="x\/">&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quoted&quot;<\/a><\/h2>/
  );
});

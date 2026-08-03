// Shared lazy-loader for embedded song players — framework-owned, do not hand-edit.
// A single delegated click handler that works for any embed (Audiomack, YouTube,
// Spotify, …) on any page. The embed URL is resolved at build time into
// data-embed-src, so this stays provider-agnostic and no third-party iframe loads
// until the visitor clicks. Player dimensions come from CSS (.song-embed-player).
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.song-embed-btn');
  if (!btn) return;
  const src = btn.dataset.embedSrc;
  const container = btn.closest('.song-embed');
  const player = container && container.querySelector('.song-embed-player');
  if (!player || !src) return;
  btn.classList.add('hidden');
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('loading', 'lazy');
  // Grant the capabilities a media player needs (harmless for services that
  // don't use them; required for MEGA's fullscreen / picture-in-picture). A
  // handler can narrow or widen this via embed_allow / embed_allowfullscreen
  // (see src/song-handlers.yaml), surfaced here as data-allow /
  // data-allow-fullscreen on the button; absent, this global default applies.
  const allow = btn.dataset.allow != null
    ? btn.dataset.allow
    : 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  iframe.setAttribute('allow', allow);
  const allowFullscreen = btn.dataset.allowFullscreen != null
    ? btn.dataset.allowFullscreen === 'true'
    : true;
  if (allowFullscreen) iframe.setAttribute('allowfullscreen', '');
  iframe.title = btn.dataset.title || '';
  player.classList.remove('hidden'); player.appendChild(iframe);
});

// Postscript "See more" preview — a real <button aria-expanded> (see
// _poem-content.pug) toggles expand/collapse; CSS keys off aria-expanded via an
// attribute selector, mirroring how the sort headers in all-poems.js keep
// aria-sort in sync with their visual state.
document.addEventListener('click', function (e) {
  const toggle = e.target.closest('.postscript-toggle');
  if (!toggle) return;
  const content = document.getElementById(toggle.getAttribute('aria-controls'));
  if (!content) return;
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  content.classList.toggle('postscript-expanded', !expanded);
  const label = toggle.querySelector('.sr-only');
  if (label) label.textContent = expanded ? 'See more' : 'See less';
});

// Analysis show/hide + synopsis/full selector — delegated click handler mirroring
// the postscript-toggle pattern above: aria-expanded/aria-pressed/data-* attributes
// carry the state, and poetic.css keys visibility off them via attribute selectors,
// so this stays the only script involved (see _poem-content.pug's "do not add a
// script block here" comment).
document.addEventListener('click', function (e) {
  const show = e.target.closest('.analysis.show');
  if (show) {
    show.setAttribute('aria-expanded', 'true');
    return;
  }
  const hide = e.target.closest('.analysis.hide');
  if (hide) {
    const showBtn = document.getElementById(hide.dataset.analysisToggle);
    if (showBtn) showBtn.setAttribute('aria-expanded', 'false');
    return;
  }
  const select = e.target.closest('.analysis.selector');
  if (!select) return;
  const group = select.closest('.full-or-synopsis-selector');
  if (!group) return;
  group.setAttribute('data-selected', select.dataset.analysisSelect);
  group.querySelectorAll('.analysis.selector').forEach(function (btn) {
    btn.setAttribute('aria-pressed', String(btn === select));
  });
});

// Decides whether to apply the preview clamp — poetic.css leaves
// .postscript-content unclamped by default so a postscript degrades to fully
// expanded with no script, and this adds .postscript-clamped (which both
// applies the clamp and, via poetic.css's adjacent-sibling selector, reveals
// the toggle) once rendered layout is known.
function evaluatePostscriptPreview(el) {
  const previewLines = parseFloat(el.dataset.previewLines) || 5;
  const style = getComputedStyle(el);
  let lineHeightPx = parseFloat(style.lineHeight);
  if (isNaN(lineHeightPx)) lineHeightPx = 1.2 * parseFloat(style.fontSize);
  const budgetPx = previewLines * lineHeightPx;

  // Measure the true bottom of rendered content, excluding the trailing margin of
  // the last child. scrollHeight includes that margin, which would count empty
  // space as "hidden" and show a pointless toggle. Layout positions are unaffected
  // by the collapsed overflow:hidden clamp, so the child rect is the full position.
  const last = el.lastElementChild;
  const contentPx = last
    ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
    : el.scrollHeight;
  const hiddenPx = contentPx - budgetPx;

  // Only clamp — and so offer the toggle — when it would reveal at least a full
  // line of real text.
  el.classList.toggle('postscript-clamped', hiddenPx > lineHeightPx);
}

function evaluateAllPostscriptPreviews() {
  document.querySelectorAll('.postscript-content').forEach(evaluatePostscriptPreview);
}

document.addEventListener('DOMContentLoaded', evaluateAllPostscriptPreviews);

let postscriptResizeTimer;
window.addEventListener('resize', function () {
  clearTimeout(postscriptResizeTimer);
  postscriptResizeTimer = setTimeout(evaluateAllPostscriptPreviews, 150);
});

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

// Suppresses the toggle when truncation would hide <= 1 line, which depends on
// rendered layout and so can only be decided at runtime.
function evaluatePostscriptPreview(el) {
  const previewLines = parseFloat(el.dataset.previewLines) || 5;
  const style = getComputedStyle(el);
  let lineHeightPx = parseFloat(style.lineHeight);
  if (isNaN(lineHeightPx)) lineHeightPx = 1.2 * parseFloat(style.fontSize);
  const budgetPx = previewLines * lineHeightPx;
  const toggle = el.parentElement && el.parentElement.querySelector('.postscript-toggle');

  // Measure the true bottom of rendered content, excluding the trailing margin of
  // the last child. scrollHeight includes that margin, which would count empty
  // space as "hidden" and show a pointless toggle. Layout positions are unaffected
  // by the collapsed overflow:hidden clamp, so the child rect is the full position.
  const last = el.lastElementChild;
  const contentPx = last
    ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
    : el.scrollHeight;
  const hiddenPx = contentPx - budgetPx;

  // Only offer the toggle when it would reveal at least a full line of real text.
  if (hiddenPx <= lineHeightPx) {
    el.classList.add('postscript-no-preview');
    if (toggle) toggle.classList.add('hidden');
  } else {
    el.classList.remove('postscript-no-preview');
    if (toggle) toggle.classList.remove('hidden');
  }
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

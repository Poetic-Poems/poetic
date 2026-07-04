// Shared Audiomack lazy-loader — framework-owned, do not hand-edit.
// A single delegated click handler that works for any number of poems on any page.
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.load-audiomack-btn');
  if (!btn) return;
  const { slug, title, artist } = btn.dataset;
  const player = document.getElementById('audiomack-player--' + slug);
  if (!player) return;
  btn.classList.add('hidden');
  const iframe = document.createElement('iframe');
  iframe.src = 'https://audiomack.com/embed/' + artist + '/song/' + slug;
  iframe.scrolling = 'no'; iframe.width = '100%'; iframe.height = '252';
  iframe.frameBorder = '0'; iframe.title = title || '';
  player.classList.remove('hidden'); player.appendChild(iframe);
});

// Postscript "See more" preview — the CSS checkbox hack handles expand/collapse
// without JS; this just suppresses the toggle when truncation would hide <= 1 line,
// which depends on rendered layout and so can only be decided at runtime.
function evaluatePostscriptPreview(el) {
  const previewLines = parseFloat(el.dataset.previewLines) || 5;
  const style = getComputedStyle(el);
  let lineHeightPx = parseFloat(style.lineHeight);
  if (isNaN(lineHeightPx)) lineHeightPx = 1.2 * parseFloat(style.fontSize);
  const collapsedPx = previewLines * lineHeightPx;
  const toggle = el.parentElement && el.parentElement.querySelector('.postscript-toggle');
  const hiddenPx = el.scrollHeight - collapsedPx;
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

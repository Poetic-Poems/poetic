/**
 * Read and parse the .poetic-config.yaml file at the repo root.
 *
 * Supported keys (grouped hierarchically — see examples/poetic-config.example.yaml
 * for a fully-commented reference):
 *   title              - site title shown in <title> and <h1> on index.html and
 *                         all-poems.html (default: "My Poems")
 *   favicon            - filename of the browser-tab icon (inside public/)
 *   subtitle           - subtitle shown below the site title on index.html
 *   skip_paths         - list of paths to skip during framework sync
 *   auto_sync.enabled  - true to enable scheduled sync workflow
 *   auto_sync.schedule - "hourly", "daily", or "weekly"
 *   footer.enabled     - false to omit the Poetic footer (default: true)
 *   footer.source      - path to the footer HTML file (default: public/poetic-footer.html)
 *   blogger.sync       - true to enable Blogger publishing (default: false)
 *   blogger.blog_id    - numeric Blogger blog ID (from the blog URL) — must be
 *                         quoted as a string in YAML; it exceeds
 *                         Number.MAX_SAFE_INTEGER and loses precision if
 *                         parsed as a YAML number
 *   blogger.removed    - what to do with removed poems: "draft" (default), "delete", or "keep"
 *   blogger.content    - post content: "full" (default, HTML page) or "poem" (poem fragment only)
 *   blogger.label      - Blogger label applied to managed posts (default: "poem")
 *   blogger.template   - path to the Blogger theme template file (default: public/blogger-template.html)
 *   song_handlers      - map of custom song-link/embedded-player handlers, keyed by
 *                         service name; a handler's own scalar fields (e.g. an
 *                         `artist` added under song_handlers.audiomack) become
 *                         {token} values in that handler's URL templates (see
 *                         docs/BUILD.md)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILENAME = '.poetic-config.yaml';
const LEGACY_CONFIG_FILENAME = '.poetic-config';

/**
 * Read .poetic-config.yaml from the repo root and return a plain object.
 * Returns an empty object if the file does not exist.
 *
 * @param {string} [cwd] - Directory to search for .poetic-config.yaml (defaults to process.cwd())
 * @returns {{ title?: string, favicon?: string, subtitle?: string, skip_paths?: string[], auto_sync?: { enabled?: boolean, schedule?: string }, footer?: { enabled?: boolean, source?: string }, blogger?: { sync?: boolean, blog_id?: string, removed?: string, content?: string, label?: string, template?: string }, song_handlers?: object }}
 */
function readPoeticConfig(cwd) {
  const root = cwd || process.cwd();
  const configPath = path.join(root, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    if (fs.existsSync(path.join(root, LEGACY_CONFIG_FILENAME))) {
      console.warn(
        `Warning: found legacy ${LEGACY_CONFIG_FILENAME} but not ${CONFIG_FILENAME}. ` +
        `.poetic-config was replaced by .poetic-config.yaml — convert its key=value ` +
        `lines to YAML (see docs/BUILD.md). Config is being ignored until then.`
      );
    }
    return {};
  }

  const parsed = yaml.load(fs.readFileSync(configPath, 'utf8'));
  const config = (parsed && typeof parsed === 'object') ? parsed : {};

  if (config.blogger && typeof config.blogger.blog_id === 'number') {
    console.warn(
      `Warning: blogger.blog_id was parsed as a YAML number and may have lost ` +
      `precision. Quote it as a string in ${CONFIG_FILENAME}, e.g. blogger: { blog_id: "${config.blogger.blog_id}" }.`
    );
  }

  return config;
}

module.exports = { readPoeticConfig };

/**
 * Read and parse the .poetic-config.yaml file at the repo root.
 *
 * Supported keys:
 *   favicon          - filename of the browser-tab icon (inside public/)
 *   subtitle         - subtitle shown below the site title on index.html
 *   audiomack_artist - Audiomack artist slug used for embedded players
 *   skip_paths       - list of paths to skip during framework sync
 *   auto_sync        - true to enable scheduled sync workflow
 *   sync_schedule    - "hourly", "daily", or "weekly"
 *   blogger_sync     - true to enable Blogger publishing (default: false)
 *   blogger_blog_id  - numeric Blogger blog ID (from the blog URL) — must be
 *                       quoted as a string in YAML; it exceeds
 *                       Number.MAX_SAFE_INTEGER and loses precision if
 *                       parsed as a YAML number
 *   blogger_removed  - what to do with removed poems: "draft" (default), "delete", or "keep"
 *   blogger_content  - post content: "full" (default, HTML page) or "poem" (poem fragment only)
 *   blogger_label    - Blogger label applied to managed posts (default: "poem")
 *   blogger_template - path to the Blogger theme template file (default: public/blogger-template.html)
 *   show_footer      - false to omit the Poetic footer (default: true)
 *   footer_source    - path to the footer HTML file (default: public/poetic-footer.html)
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
 * @returns {{ favicon?: string, subtitle?: string, audiomack_artist?: string, skip_paths?: string[], auto_sync?: boolean, sync_schedule?: string, blogger_sync?: boolean, blogger_blog_id?: string, blogger_removed?: string, blogger_content?: string, blogger_label?: string, blogger_template?: string, show_footer?: boolean, footer_source?: string }}
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

  if (typeof config.blogger_blog_id === 'number') {
    console.warn(
      `Warning: blogger_blog_id was parsed as a YAML number and may have lost ` +
      `precision. Quote it as a string in ${CONFIG_FILENAME}, e.g. blogger_blog_id: "${config.blogger_blog_id}".`
    );
  }

  return config;
}

module.exports = { readPoeticConfig };

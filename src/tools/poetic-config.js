/**
 * Read and parse the .poetic-config file at the repo root.
 *
 * Supported keys:
 *   favicon          - filename of the browser-tab icon (inside public/)
 *   subtitle         - subtitle shown below the site title on index.html
 *   audiomack_artist - Audiomack artist slug used for embedded players
 *   skip_paths       - comma-separated paths to skip during framework sync
 *   auto_sync        - set to "true" to enable scheduled sync workflow
 *   sync_schedule    - "hourly", "daily", or "weekly"
 *   blogger_sync     - set to "true" to enable Blogger publishing (default: false)
 *   blogger_blog_id  - numeric Blogger blog ID (from the blog URL)
 *   blogger_removed  - what to do with removed poems: "draft" (default), "delete", or "keep"
 *   blogger_content  - post content: "full" (default, HTML page) or "poem" (poem fragment only)
 *   blogger_label    - Blogger label applied to managed posts (default: "poem")
 *   blogger_template - path to the Blogger theme template file (default: public/blogger-template.html)
 */

const fs = require('fs');
const path = require('path');

/**
 * Read .poetic-config from the repo root and return a plain object of key=value pairs.
 * Returns an empty object if the file does not exist.
 *
 * @param {string} [cwd] - Directory to search for .poetic-config (defaults to process.cwd())
 * @returns {{ favicon?: string, subtitle?: string, audiomack_artist?: string, skip_paths?: string, auto_sync?: string, sync_schedule?: string, blogger_sync?: string, blogger_blog_id?: string, blogger_removed?: string, blogger_content?: string, blogger_label?: string, blogger_template?: string }}
 */
function readPoeticConfig(cwd) {
  const configPath = path.join(cwd || process.cwd(), '.poetic-config');
  const config = {};
  if (!fs.existsSync(configPath)) return config;
  const lines = fs.readFileSync(configPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    config[key] = value;
  }
  return config;
}

module.exports = { readPoeticConfig };

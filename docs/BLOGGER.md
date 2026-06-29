# Publishing to Blogger

Poetic can automatically publish poems to a Blogger blog whenever you push to `main`. The feature is off by default; you enable it per-repo via `.poetic-config`.

## Overview

When `blogger_sync=true`, the GitHub Actions workflow `Sync to Blogger` runs after every push to `main` that touches poem source files. It:

- Builds the poems locally (running the same pipeline as the GitHub Pages build).
- Calls `src/tools/sync-blogger.js`, which compares the built poems against existing Blogger posts.
- Creates, updates, or reverts posts to match the current poem collection.
- Matches posts by title — if a post with the same title already exists it is adopted and updated rather than duplicated.
- When a poem is removed from the source, the corresponding post is reverted to draft by default (configurable via `blogger_removed`).

The feature requires one-time OAuth authorisation to obtain a refresh token; all subsequent runs use that token non-interactively.

## Enabling

Add the following to `.poetic-config` at your repo root:

```
blogger_sync=true
blogger_blog_id=1234567890123456789
```

The blog ID is the numeric ID shown in the Blogger URL when you are in the Blogger dashboard (e.g. `https://www.blogger.com/blog/posts/1234567890123456789`).

Additional optional keys:

```
blogger_removed=draft          # draft | delete | keep  (default: draft)
blogger_content=full           # full | poem            (default: full)
blogger_label=poem             # Blogger label          (default: poem)
blogger_template=public/blogger-template.html
```

| Key | Default | Description |
|-----|---------|-------------|
| `blogger_sync` | `false` | Set to `true` to enable Blogger publishing |
| `blogger_blog_id` | _(required)_ | Numeric Blogger blog ID |
| `blogger_removed` | `draft` | Action when a poem is removed: `draft` (revert to draft), `delete` (permanently delete post), or `keep` (leave post unchanged) |
| `blogger_content` | `full` | Content to post: `full` (complete styled HTML page) or `poem` (poem fragment only) |
| `blogger_label` | `poem` | Blogger label applied to all managed posts |
| `blogger_template` | `public/blogger-template.html` | Path to the Blogger XML theme template file |

## One-time Google authorisation

Blogger has no service-account option — the API requires user-level OAuth 2.0. You authorise once and store the refresh token as a GitHub secret so the workflow can run non-interactively.

### 1. Enable the Blogger API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select an existing one).
3. Navigate to **APIs & Services → Library**, search for "Blogger API v3", and enable it.

### 2. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Select **External** and click **Create**.
3. Fill in the required fields (App name, support email).
4. On the **Scopes** page you can skip adding scopes here.
5. On the **Test users** page, add your Google account email address.
6. Save and return to the dashboard.

### 3. Create a Desktop OAuth client

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Select **Desktop app** as the application type.
3. Give it a name (e.g. "Poetic Blogger Sync") and click **Create**.
4. Note the **Client ID** and **Client Secret** — you will need them below.

### 4. Run the one-time auth helper

```bash
BLOGGER_CLIENT_ID=your-client-id \
BLOGGER_CLIENT_SECRET=your-client-secret \
npm run blogger:auth
```

The helper (`src/tools/blogger-auth.js`) opens a browser URL, prompts you to approve access, and writes the resulting credentials to `.blogger-credentials.json` (which is git-ignored). Copy the `refresh_token` value from that file.

### 5. Store GitHub secrets

In your GitHub repo go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|-------------|-------|
| `BLOGGER_CLIENT_ID` | Your OAuth client ID |
| `BLOGGER_CLIENT_SECRET` | Your OAuth client secret |
| `BLOGGER_REFRESH_TOKEN` | The refresh token from step 4 |

## Theme parity

To make your Blogger blog look like your GitHub Pages site, inject the same CSS and JS into the Blogger XML theme.

### 1. Add JS markers to the template

Open your Blogger theme template (in Blogger: **Theme → Edit HTML**) and add the JS injection markers immediately before `</body>`:

```html
    <!-- ~~ CUSTOM JS START ~~ -->
    <!-- ~~ CUSTOM JS END ~~ -->
  </body>
```

The CSS markers (`/* ~~ CUSTOM CSS START ~~ */` and `/* ~~ CUSTOM CSS END ~~ */`) should already be present inside a `<style>` block if you previously set up CSS injection. If not, add them inside a `<style>` block in the `<head>`.

### 2. Build and upload the theme

```bash
npm run build:blogger
```

This injects the current `public/poetic.css`, `public/custom.css`, and `public/poetic.js` into the template file (default: `public/blogger-template.html`).

Copy the updated template content and paste it into the Blogger theme editor (**Theme → Edit HTML → paste → Save**).

You only need to repeat this step when you change the CSS or when the framework syncs a new version of `public/poetic.js`.

## How it behaves

### Title matching

The publisher looks for an existing Blogger post whose title matches the poem title exactly. If found, it updates that post in place. If not found, it creates a new post. This means renaming a poem creates a new post rather than updating the old one — remove the old post manually if needed.

### Post content

- `blogger_content=full` (default) — posts the complete styled HTML page (the same content as the GitHub Pages poem page).
- `blogger_content=poem` — posts only the poem fragment (no surrounding navigation or site chrome).

### Labels

Every post managed by Poetic receives the label specified by `blogger_label` (default: `poem`). The publisher uses this label to identify which posts it owns — do not apply the same label to posts you manage manually.

### Removed poems

When a poem source file is deleted:

- `blogger_removed=draft` (default) — the post is reverted to draft so it is no longer publicly visible.
- `blogger_removed=delete` — the post is permanently deleted.
- `blogger_removed=keep` — the post is left exactly as is.

### Dry-run mode

Preview changes without writing to Blogger:

```bash
npm run sync:blogger -- --dry-run
```

Or trigger a dry run from GitHub Actions: **Actions → Sync to Blogger → Run workflow** and tick the **Preview without writing to Blogger** checkbox.

### Publishing a single poem

```bash
npm run sync:blogger -- --only my-poem-slug
```

## GitHub Actions workflow

The `Sync to Blogger` workflow (`.github/workflows/sync-blogger.yml`) runs on push to `main` when poem files or the config change. It is gated by the feature flag: if `blogger_sync=true` is not present in `.poetic-config`, the workflow exits immediately without touching Blogger.

If the three required secrets (`BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET`, `BLOGGER_REFRESH_TOKEN`) are not set, the sync script exits gracefully rather than erroring the workflow.

You can also trigger the workflow manually from the **Actions** tab, with an option to run in dry-run mode.

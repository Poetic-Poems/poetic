# Publishing to Blogger

Poetic can automatically publish poems to a Blogger blog whenever you push to `main`. The feature is off by default; you enable it per-repo via `.poetic-config.yaml`.

## Overview

When `blogger.sync: true`, the GitHub Actions workflow `Sync to Blogger` runs after every push to `main` that touches poem source files. It:

- Builds the poems locally (running the same pipeline as the GitHub Pages build).
- Calls `src/tools/sync-blogger.js`, which compares the built poems against existing Blogger posts.
- Creates, updates, or reverts posts to match the current poem collection.
- Matches posts by title — if a post with the same title already exists it is adopted and updated rather than duplicated.
- When a poem is removed from the source, the corresponding post is reverted to draft by default (configurable via `blogger.removed`).

The feature requires one-time OAuth authorisation to obtain a refresh token; all subsequent runs use that token non-interactively.

## Enabling

Add the following to `.poetic-config.yaml` at your repo root:

```yaml
blogger:
  sync:    true
  blog_id: "1234567890123456789"
```

The blog ID is the numeric ID shown in the Blogger URL when you are in the Blogger dashboard (e.g. `https://www.blogger.com/blog/posts/1234567890123456789`). Quote it as a string — it exceeds `Number.MAX_SAFE_INTEGER` and loses precision if parsed as a YAML number.

Additional optional keys:

```yaml
blogger:
  removed:  draft          # draft | delete | keep  (default: draft)
  content:  full           # full | poem            (default: full)
  label:    poem           # Blogger label          (default: poem)
  template: public/blogger-template.html
```

| Key | Default | Description |
|-----|---------|-------------|
| `blogger.sync` | `false` | Set to `true` to enable Blogger publishing |
| `blogger.blog_id` | _(required)_ | Numeric Blogger blog ID |
| `blogger.removed` | `draft` | Action when a poem is removed: `draft` (revert to draft), `delete` (permanently delete post), or `keep` (leave post unchanged) |
| `blogger.content` | `full` | Content to post: `full` (complete styled HTML page) or `poem` (poem fragment only) |
| `blogger.label` | `poem` | Blogger label applied to all managed posts |
| `blogger.template` | `public/blogger-template.html` | Path to the Blogger XML theme template file |

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

The helper (`src/tools/blogger-auth.js`) opens a browser URL, prompts you to approve access, and — if you confirm the prompt to save — writes the resulting credentials to `.blogger-credentials.json` (which is git-ignored, and written with file mode `0600` since it holds a refresh token with full blog write access). Copy the `refresh_token` value from that file to store as a GitHub secret (step 5).

`src/tools/sync-blogger.js` also reads `.blogger-credentials.json` directly as a fallback for any of the three `BLOGGER_*` env vars that isn't set, so once the file exists you can run `npm run sync:blogger -- --dry-run` locally without exporting anything.

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

### Post identity

Each poem maps to its own Blogger post, identified by its slug rather than its title. The
publisher recovers a post's slug from the `id="poem--<slug>"` marker embedded in the post
content, and matches it against the current poem's slug (its filename stem). This means
poems that share a title are managed as separate posts. A labelled post with no such
marker is treated as legacy or unmanaged and is left untouched.

### Permalinks

Posts are published at **00:00 GMT** of the poem's date. Each poem is identified by its
slug rather than its title, so poems that share a title are published as separate posts
instead of colliding.

New posts receive a **date-stamped permalink**. Blogger derives a post's permalink slug
from its title and publish date at creation time, and that slug is sticky once assigned.
To guarantee a distinct, clean permalink for every poem — even when titles repeat — the
publisher prepends the zero-padded day of the month to the title just before creating the
post, then renames the title back to the poem's actual title immediately afterwards. The
permalink itself still bakes in the day, so it reads as a full date plus title: a poem
titled "My Shepherd" dated `1998-01-18` gets the permalink `/1998/01/18-my-shepherd.html`.
Posts created before this scheme keep their original permalinks.

### Post content

- `blogger.content: full` (default) — posts the complete styled HTML page (the same content as the GitHub Pages poem page).
- `blogger.content: poem` — posts only the poem fragment (no surrounding navigation or site chrome).

### Labels

Every post managed by Poetic receives the label specified by `blogger.label` (default: `poem`), plus any per-poem labels declared with `#label` lines in the poem's Metadata section. The publisher uses the base label to identify which posts it owns — do not apply the same label to posts you manage manually.

The sync fully reconciles each post's labels to exactly this set — the base label plus the poem's current labels — on every run. Removing a label from a poem removes it from the Blogger post on the next sync, and any label added manually in the Blogger UI is overwritten, since Poetic owns these posts.

A poem label containing a comma is not sent to Blogger, since Blogger uses comma as its label separator.

### Removed poems

When a poem source file is deleted:

- `blogger.removed: draft` (default) — the post is reverted to draft so it is no longer publicly visible.
- `blogger.removed: delete` — the post is permanently deleted.
- `blogger.removed: keep` — the post is left exactly as is.

### Draft/private poems

Poem source files whose names begin with `_` or `.` are ignored by the entire build pipeline — they are never converted to YAML, never published to GitHub Pages, and never synced to Blogger. Use an `_` prefix to keep a work-in-progress poem in the repo without publishing it.

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

The `Sync to Blogger` workflow (`.github/workflows/sync-blogger.yml`) runs on push to `main` when poem files or the config change. It is gated by the feature flag: if `blogger.sync: true` is not present in `.poetic-config.yaml`, the workflow exits immediately without touching Blogger.

If the three required secrets (`BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET`, `BLOGGER_REFRESH_TOKEN`) are not set, the sync script exits gracefully rather than erroring the workflow.

You can also trigger the workflow manually from the **Actions** tab, with an option to run in dry-run mode.

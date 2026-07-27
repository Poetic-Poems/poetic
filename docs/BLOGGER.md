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
| `blogger.template` | `public/blogger-template.html` | Path to the Blogger XML theme template file. A relative path is resolved against the repository root; either way it must resolve inside the repository, or the default template is used instead (the file is uploaded verbatim as the live theme) |

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
7. **Publish the app** once you have it working (**Publishing status → Publish app**).

Publishing matters more than it looks. While the consent screen sits in **Testing** status, Google expires every refresh token after **7 days** — so a sync that works today starts failing next week with `invalid_grant`, and you have to re-mint the token every time. Publishing stops the expiry. The app stays private to you; publishing an app that requests only your own Blogger scope does not require Google's verification review.

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

**Sign in as the account that owns the blog.** This is the single easiest thing to get wrong, and it does not fail where you make the mistake — authorising as the wrong Google account succeeds here and then fails at sync time with a bare `403 The caller does not have permission`, which names neither the account nor the blog. If you keep a personal account for your poems and another for work or for framework development, pick deliberately: the right one is whichever sees the blog when you visit [blogger.com](https://www.blogger.com/).

A **Google Workspace account** (`you@your-company.com`) is a special trap. Workspace domains have Blogger switched off by default, and an account with Blogger disabled is refused exactly like a wrong account would be — even after you add it as an author on the blog. Either enable Blogger for the domain in the Workspace Admin console, or authorise with the personal account that owns the blog.

To help you catch this immediately, the helper lists the blogs the authorised account can actually manage before it offers to save anything, and marks the one matching your configured `blogger.blog_id`:

```
This account can manage these blogs:

  1234567890123456789  My Poems  <https://my-poems.blogspot.com/>  ← blogger.blog_id
```

If that list is empty, or does not include your blog, stop and re-run the helper as the right account rather than saving credentials that cannot work.

`src/tools/sync-blogger.js` also reads `.blogger-credentials.json` directly as a fallback for any of the three `BLOGGER_*` env vars that isn't set, so once the file exists you can run `npm run sync:blogger -- --dry-run` locally without exporting anything.

### 5. Store GitHub secrets

In your GitHub repo go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|-------------|-------|
| `BLOGGER_CLIENT_ID` | Your OAuth client ID |
| `BLOGGER_CLIENT_SECRET` | Your OAuth client secret |
| `BLOGGER_REFRESH_TOKEN` | The refresh token from step 4 |

The credentials now live in two independent places: `.blogger-credentials.json` for local runs, and these three secrets for the workflow. **Whenever you re-mint, update both.** Updating one leaves the other failing, and because they fail in different places — your terminal versus an Actions log — it is easy to fix one and keep hitting the other. Note that changing the GitHub secrets has no effect on a local `npm run sync:blogger`, which reads the `BLOGGER_*` environment variables first and falls back to the file.

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

## Troubleshooting

Google's API errors are accurate but anonymous — a 403 says "The caller does not have permission" without saying which caller, which permission, or what to do. `sync:blogger` prints its own guidance beneath any error it recognises; this section is the longer version.

| Symptom | Most likely cause |
|---------|-------------------|
| `403 The caller does not have permission` | Authorised as a Google account that does not own the blog |
| `invalid_grant` / "Token has been expired or revoked" | Consent screen left in **Testing** status (7-day token expiry), or the token was superseded |
| `invalid_client` / "Client may be deleted or disabled" | The OAuth client was deleted, or the ID/secret do not match it |
| `404` on the blog | Wrong `blogger.blog_id`, or it was written unquoted in YAML |
| Works locally, fails in Actions (or vice versa) | Credentials updated in only one of the two places that hold them |
| `Invalid variable declaration in page skin` on saving the theme | Tag-shaped text in CSS — see [Theme parity](#theme-parity) below |

### 403 — "The caller does not have permission"

Blogger accepted your token, so your credentials and scope are fine. It refused a request that depends on *who you are*. `sync:blogger` needs `view=ADMIN` to see drafts and post status, and that is an identity-dependent call — which is why a token that can read the blog's public posts perfectly well still fails here.

Almost always this means the consent screen was completed as the wrong Google account. It is an easy mistake: the browser offers whichever account it is already signed in to, and Google will happily issue a working token for an account that has nothing to do with your blog.

To confirm and fix:

1. Visit [blogger.com](https://www.blogger.com/) and note which account sees your blog.
2. Re-run `npm run blogger:auth` and pick that account at the chooser. The helper then lists the blogs that account can manage, so you can verify before saving.
3. Update `.blogger-credentials.json` **and** the three GitHub secrets.

If the authorised account is a Google Workspace one, see the warning in [step 4](#4-run-the-one-time-auth-helper) — Workspace domains disable Blogger by default, and that alone produces this error even when the account is a listed author on the blog.

You can check what an existing token can reach without re-minting anything:

```bash
npm run sync:blogger -- --dry-run
```

A dry run performs the same `view=ADMIN` read, so it reproduces the 403 (and its guidance) without writing to Blogger.

### invalid_grant — the refresh token stopped working

The token is the problem; the blog and config are fine. Causes, commonest first:

- **The consent screen is still in Testing status.** Google expires refresh tokens after 7 days in that state. If your sync reliably breaks about a week after each fix, this is why — publish the app (see [step 2](#2-configure-the-oauth-consent-screen)).
- **A later mint superseded it.** Minting a new token invalidates the previous one for the same client, so an old value left behind in GitHub secrets stops working the moment you re-mint locally.
- **Mismatched client.** All three `BLOGGER_*` values must come from one mint. A refresh token issued by one OAuth client cannot be redeemed with another client's ID and secret.
- **Access was revoked** at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

### invalid_client — "Client may be deleted or disabled"

The OAuth client itself is gone or disabled in **APIs & Services → Credentials**. Deleting and recreating an OAuth client gives you a new ID and secret and invalidates every refresh token it issued, so you need a fresh `npm run blogger:auth` and a full update of all three values in both places.

### 404 — no such blog

`blogger.blog_id` does not match a blog. The ID is the number in the Blogger dashboard URL (`https://www.blogger.com/blog/posts/BLOG_ID`).

Quote it as a string. Unquoted, YAML parses it as a number, it exceeds JavaScript's safe integer range, and it silently loses precision — giving you a 404 for an ID that looks right:

```yaml
blogger:
  blog_id: "7781143180070523245"    # correct
  # blog_id: 7781143180070523245    # becomes 7781143180070523000
```

### The credentials live in two places

Local runs read the `BLOGGER_*` environment variables, then fall back to `.blogger-credentials.json`. The workflow reads the GitHub secrets. Nothing keeps them in step, so a re-mint means updating both. Symptoms of drift:

- **Actions fails, local works** — the secrets are stale.
- **Local fails, Actions works** — `.blogger-credentials.json` is stale.
- **You updated the GitHub secrets and `npm run sync:blogger` still fails identically** — expected. The local run never reads GitHub secrets.

### Checking a run without writing to Blogger

```bash
npm run sync:blogger -- --dry-run
```

A dry run authorises and reads exactly as a real sync does, so it reproduces any auth failure faithfully while leaving your blog untouched. Note that `--dry-run` is what makes a run safe, not `--only`: `--only my-poem` narrows the sync to one poem but still writes to Blogger. Combine them (`--dry-run --only my-poem`) to preview a single poem.

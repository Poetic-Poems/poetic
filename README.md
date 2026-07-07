# Poetic &nbsp; ![Poetic logo](public/poetic-logo.png)

***A plain-text poem authoring framework.***
Write poems in a concise `.poem` format, build them into HTML,
and optionally publish to GitHub Pages.

> Your poems are more than things to look at—  
> they want a URL, a stage, a view.  
> Write them in the `.poem` format,  
> and *Poetic* does the rest for you.  
>  
> Label stanzas, add a song link,  
> build to HTML and, when you're done,  
> push to GitHub—faster than you'd think—  
> then your words reach everyone.  
>  
> The pipeline runs from `.poem` to page  
> with YAML, Pug, and scripts between;  
> just four lines set a valid stage—  
> the workflow's tidy, calm, and clean.  
>  
> Use the template, start your drafting,  
> `npm run build` and the deed is done;  
> the only question worth the asking  
> is why you haven't yet begun.  

## What it does

- **`.poem` format** — a readable plain-text syntax for structured poetry (see [`docs/POEM-SYNTAX.md`](docs/POEM-SYNTAX.md) and the formal grammar in [`poem-syntax.ebnf`](poem-syntax.ebnf))
- **Build pipeline** — converts `.poem` → YAML → HTML with a Pug template
- **Index & all-poems view** — generates `index.html` and `all-poems.html` for browsing your collection
- **Vim syntax highlighting** — filetype detection and highlighting for `.poem` files (see [`editors/vim/`](editors/vim/))
- **GitHub Pages deployment** — included workflow deploys your published HTML on push to `main`
- **Optional Blogger publishing** — auto-publish poems to a Blogger blog on push to `main` (off by default; see [`docs/BLOGGER.md`](docs/BLOGGER.md))

## Example site

The Poetic framework is used to build the
[Fragments & Unity][Fragments & Unity - all] site ([source][Fragments & Unity - source]).
Most of the `.poem` syntax features are demonstrated
across these four poems:
- [At The End of Myself]
  ([source][At The End of Myself - source])
- [Divide and Lose]
  ([source][Divide and Lose - source])
- [Easter Joy (Immanuel Is His Name)]
  ([source][Easter Joy (Immanuel Is His Name) - source])
- [My Shepherd (2026)]
  ([source][My Shepherd (2026) - source])

When poems are created or updated in the
[Fragments & Unity repository][Fragments & Unity - source], the Poetic framework
automatically publishes those changes to the [Framgents & Unity Blogger site].

[At The End of Myself]:
https://warwick-allen.github.io/fragments-and-unity/all-poems.html#poem-at-the-end-of-myself

[At The End of Myself - source]:
https://github.com/Warwick-Allen/fragments-and-unity/blob/main/src/poems/poem/at-the-end-of-myself.poem

[Divide and Lose]:
https://warwick-allen.github.io/fragments-and-unity/all-poems.html#poem-divide-and-lose

[Divide and Lose - source]:
https://github.com/Warwick-Allen/fragments-and-unity/blob/main/src/poems/poem/divide-and-lose.poem

[Easter Joy (Immanuel Is His Name)]:
https://warwick-allen.github.io/fragments-and-unity/all-poems.html#poem-easter-joy-immanuel-is-his-name

[Easter Joy (Immanuel Is His Name) - source]:
https://github.com/Warwick-Allen/fragments-and-unity/blob/main/src/poems/poem/easter-joy-immanuel-is-his-name.poem

[Fragments & Unity - all]:
https://warwick-allen.github.io/fragments-and-unity/all-poems.html

[Fragments & Unity - source]:
https://github.com/Warwick-Allen/fragments-and-unity/#fragments--unity--poems-by-warwick-allen

[Framgents & Unity Blogger site]:
https://fragments-and-unity.blogspot.com/

[My Shepherd (2026)]:
https://warwick-allen.github.io/fragments-and-unity/all-poems.html#poem-my-shepherd-2026

[My Shepherd (2026) - source]:
https://github.com/Warwick-Allen/fragments-and-unity/blob/main/src/poems/poem/my-shepherd-2026.poem

## Prerequisites

You will need the following before getting started:

- **A GitHub account** — free to create at [github.com](https://github.com/join)
- **Git** — [download from git-scm.com](https://git-scm.com/downloads)
- **Node.js 18 or later** — [download from nodejs.org](https://nodejs.org/) (choose the LTS version)
- **A terminal** — the command-line application on your computer:
  - macOS: Terminal (built in) or [iTerm2](https://iterm2.com/)
  - Windows: Git Bash (installed with Git for Windows) or [Windows Terminal](https://apps.microsoft.com/detail/9n0dx20hk701)
  - Linux: any terminal emulator
- **A text editor** — any editor works; [Visual Studio Code](https://code.visualstudio.com/) is a popular free choice

## Quick start

### 1. Create your own repo

Pick the approach that suits you:

| | **Template** *(recommended)* | **Clone + rewire** | **Fork** |
|---|---|---|---|
| Setup | Click **Use this template** on GitHub, then clone your new repo | Clone poetic, then redirect it to your own GitHub repo | Fork on GitHub, then clone your fork |
| After setup | Ready to push to GitHub immediately | Need one extra command before you can push to GitHub | Ready to push to GitHub immediately |
| Git history | Clean slate | Inherits poetic's history | Inherits poetic's history |
| Auto-sync | Yes, once `.poetic-version` is in place | Yes, once `.poetic-version` is in place | Yes, once `.poetic-version` is in place |
| Best for | Writing poems | Writing poems | Contributing to poetic itself |

**Clone + rewire steps:**

```bash
git clone https://github.com/warwickallen/poetic.git my-poems
cd my-poems
git remote set-url origin https://github.com/YOUR-USERNAME/my-poems.git   # point at your own repo
```

**Fork caveat:** If you propose changes to `poetic` from a fork that also contains your personal poems, those poems appear in the change list. A separate repo (template or clone + rewire) keeps your collection and framework contributions cleanly apart.

### 2. Install and initialise

```bash
npm install                       # download build tools (takes a minute)
bash scripts/sync-framework.sh   # creates .poetic-version
git add .poetic-version
git commit -m "chore: initialise poetic version tracking"
git push -u origin main           # push to GitHub (-u only needed the first time)
```

`.poetic-version` identifies this repo as a poem collection (as opposed to the framework repo itself) and records which version of the framework you are tracking. It is required for automatic updates to work.

### 3. Enable GitHub Pages

In your repo settings, set Pages source to **GitHub Actions**. The included workflow (`.github/workflows/build-poems.yml`) then builds and deploys your site on every push to `main`.

### 4. Write your first poem

```bash
cp src/poems/poem/_example.poem src/poems/poem/my-poem.poem
# Open my-poem.poem in your text editor and edit it, then:
npm run build
npm start   # open http://localhost:8080
```

## Poem format

A `.poem` file looks like this:

```
My Poem Title
A Poet
2024-01-15

{Verse 1}
First line of the poem
Second line, with *emphasis* and **strong**.

{Chorus}
A recurring refrain,
sung with joy.
```

See [`docs/POEM-SYNTAX.md`](docs/POEM-SYNTAX.md) for the full specification and [`src/poems/poem/_example.poem`](src/poems/poem/_example.poem) for a working example that exercises every feature.

## Authoring workflow

### Create a poem

```bash
# Write a new poem
cp src/poems/poem/_example.poem src/poems/poem/my-poem.poem
# Edit it, then build
npm run build
```

### Convert to YAML (and back)

```bash
# .poem → YAML
node src/tools/poem-to-yaml.js src/poems/poem/my-poem.poem

# Convert all .poem files at once
node src/tools/poem-to-yaml.js --all

# YAML → .poem
node src/tools/yaml-to-poem.js src/poems/yaml/my-poem.yaml
```

### Shared variables

Edit `src/poems/poem/.shared.poem` to set variables available to every poem (e.g. `={author}=Your Name`).

This file is **user-owned** — it is not overwritten by `sync-framework.sh`. Customise it freely.

## Repository structure

```
src/
├── poems/
│   ├── poem/         # .poem source files (your poems go here)
│   └── yaml/         # Generated YAML (and _shared.yaml for shared content)
├── templates/        # Pug HTML template
└── tools/            # Build scripts
public/               # Generated HTML (git-ignored by default)
docs/                 # Documentation
editors/vim/          # Vim syntax highlighting
examples/             # Worked examples
scripts/              # Helper shell scripts
test/                 # Tests
```

For everyday writing, `src/poems/poem/` is the only directory you need to touch.

Files beginning with `_` (e.g. `_example.poem`, `_shared.yaml`) are excluded from the build.

## Staying up to date

### Versioning

Poetic releases are numbered `vMAJOR.MINOR.PATCH` (for example, `v1.2.0`). Each release is tagged on the `main` branch and listed under [Releases](https://github.com/warwickallen/poetic/releases) on GitHub.

### Manual sync

Sync framework files at any time by running:

```bash
bash scripts/sync-framework.sh            # sync from the ref in .poetic-version
bash scripts/sync-framework.sh --ref main           # always take the latest commit
bash scripts/sync-framework.sh --ref v1.2.0         # pin to a specific release
```

The script fetches the `poetic` remote, checks out all framework files at the requested ref, and updates `.poetic-version` with the synced commit. Review the staged changes, then commit.

### Configuration

Create a `.poetic-config.yaml` file in your repo root to configure site settings and auto-sync behaviour:

```yaml
auto_sync: true
sync_schedule: weekly
```

Commit it to your repo so that GitHub Actions can read it when building and deploying your site. Supported keys:

| Key | Purpose |
|---|---|
| `auto_sync` | Set to `true` to enable scheduled auto-sync (default: disabled) |
| `sync_schedule` | How often the workflow synchronisation schedule runs: `hourly`, `daily`, or `weekly` (default: `weekly`).  See [Automatic sync (GitHub Actions)](#automatic-sync-github-actions) below. |
| `skip_paths` | List of framework paths to leave untouched during sync (e.g. `public/poetic.css`) |
| `favicon` | Filename of the favicon shown in browser tabs (default: `poetic-logo.svg`; file must exist in `public/`) |
| `subtitle` | Subtitle shown beneath the site title on the index page |
| `blogger_sync` | Set to `true` to enable automatic Blogger publishing (default: `false`; see [`docs/BLOGGER.md`](docs/BLOGGER.md)) |
| `show_footer` | Set to `false` to omit the "Built with Poetic" footer from every built page (default: `true`) |
| `footer_source` | Path to the HTML file injected as the page footer (default: `public/poetic-footer.html`; see [`docs/BUILD.md`](docs/BUILD.md#footer)) |

Settings such as `favicon`, `subtitle`, `auto_sync`, and `sync_schedule` are only applied during CI if `.poetic-config.yaml` is present in the repository.

### Automatic sync (GitHub Actions)

The included workflow (`.github/workflows/sync-framework.yml`) opens a pull request (a proposal to merge the changes, which you review and approve on GitHub) if framework files are behind. Scheduled runs are **opt-in**: set `auto_sync: true` in `.poetic-config.yaml` to enable them.

To trigger a sync immediately (e.g., to pick up a specific release), use **Actions → Sync framework from poetic → Run workflow** and optionally enter a ref. Manual runs always work regardless of the `auto_sync` setting.

The `sync_schedule` configuration key controls how often the workflow actually does anything (default `weekly` if omitted):

| Value | Behaviour |
|---|---|
| `weekly` | Runs once per Monday at 09:00 UTC *(default)* |
| `daily` | Runs once per day at 09:00 UTC |
| `hourly` | Runs every hour |

The `.poetic-version` file controls the update channel:

| Setting | Behaviour |
|---|---|
| `channel=releases` | Opens a PR when a new numbered release (e.g. `v1.2.0`) is published *(recommended for most users)* |
| `channel=main` | Opens a PR whenever `poetic/main` has new commits (cutting-edge, less stable) |

To switch channels, edit `.poetic-version` and change the `channel` line.

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — version history and notable changes
- [`docs/POEM-SYNTAX.md`](docs/POEM-SYNTAX.md) — full `.poem` format specification
- [`poem-syntax.ebnf`](poem-syntax.ebnf) — formal EBNF grammar
- [`docs/YAML-SCHEMA.md`](docs/YAML-SCHEMA.md) — YAML schema for poems
- [`docs/POEM-TO-YAML.md`](docs/POEM-TO-YAML.md) — converter documentation
- [`docs/BUILD.md`](docs/BUILD.md) — GitHub Pages deployment details
- [`docs/SCRIPTS.md`](docs/SCRIPTS.md) — shell scripts reference (`edit-poem`, `sync-framework.sh`, etc.)
- [`docs/VIM-SYNTAX.md`](docs/VIM-SYNTAX.md) — Vim syntax highlighting setup
- [`docs/QUICKSTART-VIM.md`](docs/QUICKSTART-VIM.md) — quick Vim setup guide

## Contributing

If you improve a framework file (a tool, template, editor integration, or doc), please open a pull request against [warwickallen/poetic](https://github.com/warwickallen/poetic). Personal poems and your `README.md` stay in your own repo.

### Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[(scope)][!]: <description>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Add `!` after the type/scope (e.g. `feat!:`) for a breaking change.

```
feat(poem-to-yaml): support multi-line titles
fix(build-poems): resolve output path relative to repo root
docs: clarify sync-framework usage
```

Enable the commit-message check once per clone:

```bash
git config core.hooksPath .githooks
```

## Further information

### Getting help

If something is not working or you have a question, [open an issue](https://github.com/warwickallen/poetic/issues) on GitHub.

### Learning the tools

If any of the tools used here are new to you:

- **GitHub** — [GitHub's getting started guide](https://docs.github.com/en/get-started) explains repositories, commits, and pull requests
- **Git** — [Pro Git](https://git-scm.com/book/en/v2) (free online) covers everything from first steps to advanced use
- **The command line** — search for "command line basics" plus your operating system for a beginner tutorial
- **Node.js / npm** — for poetic you mostly just need `npm install` (downloads the build tools once) and `npm run build` (generates the HTML); [nodejs.org/en/learn](https://nodejs.org/en/learn) has introductory guides if you want to go deeper

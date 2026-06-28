# Poetic

A plain-text poem authoring framework. Write poems in a concise `.poem` format, build them into HTML, and optionally publish to GitHub Pages.

## What it does

- **`.poem` format** — a readable plain-text syntax for structured poetry (see [`docs/POEM-SYNTAX.md`](docs/POEM-SYNTAX.md) and the formal grammar in [`poem-syntax.ebnf`](poem-syntax.ebnf))
- **Build pipeline** — converts `.poem` → YAML → HTML with a Pug template
- **Index & all-poems view** — generates `index.html` and `all-poems.html` for browsing your collection
- **Vim syntax highlighting** — filetype detection and highlighting for `.poem` files (see [`editors/vim/`](editors/vim/))
- **GitHub Pages deployment** — included workflow deploys your published HTML on push to `main`

## Quick start

```bash
git clone https://github.com/warwickallen/poetic.git my-poems
cd my-poems
npm install
```

1. Copy `src/poems/poem/_example.poem` to `src/poems/poem/my-poem.poem` and edit it.
2. Build:

   ```bash
   npm run build
   ```

3. View locally:

   ```bash
   npm start
   # open http://localhost:8080
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

Files beginning with `_` (e.g. `_example.poem`, `_shared.yaml`) are excluded from the build.

## GitHub Pages

The included workflow (`.github/workflows/build-poems.yml`) builds and deploys to GitHub Pages on every push to `main`. Enable GitHub Pages in your repo settings (source: GitHub Actions).

## Documentation

- [`docs/POEM-SYNTAX.md`](docs/POEM-SYNTAX.md) — full `.poem` format specification
- [`poem-syntax.ebnf`](poem-syntax.ebnf) — formal EBNF grammar
- [`docs/YAML-SCHEMA.md`](docs/YAML-SCHEMA.md) — YAML schema for poems
- [`docs/POEM-TO-YAML.md`](docs/POEM-TO-YAML.md) — converter documentation
- [`docs/BUILD.md`](docs/BUILD.md) — GitHub Pages deployment details
- [`docs/VIM-SYNTAX.md`](docs/VIM-SYNTAX.md) — Vim syntax highlighting setup
- [`docs/QUICKSTART-VIM.md`](docs/QUICKSTART-VIM.md) — quick Vim setup guide

#!/bin/bash
#
# poem-to-raw.sh — extract plain-text versions of all .poem files.
#
# For each non-partial .poem source file (i.e. files not beginning with '_'),
# this script writes a plain-text rendering to raw/<stem> and appends a link
# to public/raw/index.html so the raw files are browsable via GitHub Pages.
#
# The plain text strips .poem markup and normalises common HTML entities to
# their Unicode equivalents, producing readable output suitable for linking
# from the public site.
#
# Usage:
#   bash scripts/poem-to-raw.sh
#   npm run poem-to-raw           # calls src/tools/poem-to-raw.js, which delegates here
#
# Note: This shell script is the authoritative implementation.
# src/tools/poem-to-raw.js is a thin wrapper that invokes this script so the
# build pipeline can run it without calling bash directly.
#
# Outputs:
#   raw/<stem>               — plain-text rendering of each poem
#   public/raw/index.html   — HTML index linking to raw files on GitHub
#
# Dependencies: git, awk, perl, sed

shopt -qu dotglob

repo_toplevel=$(git rev-parse --show-toplevel)
mkdir -p "$repo_toplevel/raw" "$repo_toplevel/public/raw"
index="$repo_toplevel/public/raw/index.html"
gh_repo=$(git remote get-url origin | sed 's|.*github.com[:/]||; s|\.git$||')
gh_raw="https://raw.githubusercontent.com/$gh_repo/refs/heads/main/raw"

# Write the opening of the index page; individual poem links are appended below.
cat <<HERE >"$index"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poems</title>
</head>
<body>
  <h1>Poems</h1>
  <ul>
HERE

# Regex fragment matching a valid .poem variable name.
var_re='[0-9A-Za-z][^{}$<>]*[^{}$<> ]?'

for poem_file in "$repo_toplevel"/src/poems/poem/*.poem; do
  # Skip partial/private files (names beginning with '_').
  [[ "$poem_file" =~ /_ ]] && continue;

  title="$(<"$poem_file" head -1)"
  stem="$(basename "$poem_file" .poem)"
  href="$gh_raw/$stem"
  echo "    <li><a href=\"$href\">$title</a></li>" >>"$index"

  (
    # Print the title underlined with dashes (plain-text heading).
    echo "$title" | tee >(sed s/./-/g)

    # Extract the poem body using awk, then clean up markup with perl.
    <"$poem_file" awk '
      /^\s*$/           {blank++        }  # count blank lines
      blank<1           {next           }  # skip header (title, author, date)
      /^====\s*(#.*)?$/ {exit           }  # stop at the canonical-form divider
      /^\s*{[^{]/       {next           }  # skip stanza/section label lines
      /^<<#/            {comment=1      }  # enter a block comment
      /^#>>/            {comment=0; next}  # exit a block comment
      comment           {next           }  # suppress comment lines
                        {print          }  # print all other body lines
    ' |
    perl -pe 'BEGIN {no warnings utf8; undef $/}
      # Capture variable definitions (=\{name\}=value) for later substitution.
      /=\{('"$var_re"')\}=(.*)/ and $var{$1} = $2;
      # Substitute ${name} references with their captured values.
      s: \$\{('"$var_re"')\} :$var{$1}:egx;
      # Collapse pronunciation-guide notation (/.\d{alt}/.\d{display}) → display text.
      s:/\.\d+\{[^}]*\}/\.\d+\{([^}]*)\}:\1:gx;
      # Remove remaining inline markup wrappers (/.word{text}) → text.
      s:  /\.\w+\{([^}]*)\}         :\1:gx;
      # Normalise common HTML entities to Unicode characters.
      s:  \.\.\.                     :…:gx;
      s:( &hellip; | \.\.\.         ):…:gx;
      s:  &ldquo;                    :“:gx;
      s:  &rdquo;                    :”:gx;
      s:( &mdash;  | (?<!-)---(?!-) ):—:gx;
      s:  &mdash;                    :—:gx;
      s:  &ndash;                    :–:gx;
      # Expand numeric character references (decimal and hex).
      s:  &# (\d+)         :chr     $1:egx;
      s:  &#x(\d+)         :chr hex $1:egx;
      # Ensure the file ends with exactly one newline.
      s:  \n*                       $:\n:s;
    ' | grep -vP "^=\{$var_re\}="  # strip variable definition lines from output
  ) >"$repo_toplevel/raw/$stem"
done

cat <<HERE >>"$index"
  </ul>
</body>
</html>
HERE


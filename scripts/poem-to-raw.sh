#!/bin/bash

shopt -qu dotglob

repo_toplevel=$(git rev-parse --show-toplevel)
mkdir -p "$repo_toplevel/raw" "$repo_toplevel/public/raw"
index="$repo_toplevel/public/raw/index.html"
gh_repo=$(git remote get-url origin | sed 's|.*github.com[:/]||; s|\.git$||')
gh_raw="https://raw.githubusercontent.com/$gh_repo/refs/heads/main/raw"
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
for poem_file in "$repo_toplevel"/src/poems/poem/*.poem; do
  [[ "$poem_file" =~ /_ ]] && continue;
  title="$(<"$poem_file" head -1)"
  href="$gh_raw/${title//\?/%3F}"
  echo "    <li><a href=\"$href\">$title</a></li>" >>"$index"
  (
    echo "$title" | tee >(sed s/./-/g)
    <"$poem_file" awk '
      /^\s*$/           {blank++        }
      blank<1           {next           }
      /^====\s*(#.*)?$/ {exit           }
      /^\s*{[^{]/       {next           }
      /^<<#/            {comment=1      }
      /^#>>/            {comment=0; next}
      comment           {next           }
                        {print          }
    ' |
    perl -pe 'BEGIN {no warnings utf8; undef $/}
      s:/\.\d+\{[^}]*\}/\.\d+\{([^}]*)\}:\1:gx;
      s:  /\.\w+\{([^}]*)\}         :\1:gx;
      s:  \.\.\.                     :…:gx;
      s:( &hellip; | \.\.\.         ):…:gx;
      s:  &ldquo;                    :“:gx;
      s:  &rdquo;                    :”:gx;
      s:( &mdash;  | (?<!-)---(?!-) ):—:gx;
      s:  &mdash;                    :—:gx;
      s:  &ndash;                    :–:gx;
      s:  &# (\d+)         :chr     $1:egx;
      s:  &#x(\d+)         :chr hex $1:egx;
      s:  \n*                       $:\n:s;
    '
  ) >"$repo_toplevel/raw/$title"
done
echo <<HERE >>"$index"
  </ul>
</body>
</html>
HERE


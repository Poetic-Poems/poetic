# Embedded Language Support Implementation

## Summary

Code inside `<<<language` blocks displays with proper language-specific syntax highlighting.

## The Solution

### Key Insight

Vim's syntax embedding requires **custom cluster names**, not direct use of the language's default clusters. This is the pattern used by Vim's built-in `html.vim` for embedding JavaScript and CSS.

### Implementation Pattern

```vim
" WRONG - doesn't work:
syn include @html syntax/html.vim
syn region myHtml start="..." end="..." contains=@html

" CORRECT - works:
unlet! b:current_syntax
syn include @myCustomHtml syntax/html.vim
unlet! b:current_syntax
syn region myHtml start="..." end="..." contains=@myCustomHtml
```

### What We Implemented

1. **Custom clusters** for each language:
   - `@poemHtml`, `@poemCss`, `@poemJavascript`, `@poemPython`, etc.

2. **Syntax inclusion** with proper `b:current_syntax` handling:
   ```vim
   unlet! b:current_syntax
   syn include @poemHtml syntax/html.vim
   unlet! b:current_syntax
   ```

3. **Region definitions** using `matchgroup` for delimiters:
   ```vim
   syn region poemLiteralHtml matchgroup=Delimiter
     \ start="^<<<html\>.*$" matchgroup=Delimiter end="^>>>$"
     \ keepend contains=@poemHtml
   ```

4. **Word boundaries** (`\>`) to prevent `<<<html` from matching `<<<htmlx`

5. **Opt-out mechanism** via `g:poem_no_embedded_languages` for performance

## Supported Languages

| Language   | Tags                  | Cluster Name      |
|------------|-----------------------|-------------------|
| HTML       | `html`                | `@poemHtml`       |
| CSS        | `css`                 | `@poemCss`        |
| JavaScript | `javascript`, `js`    | `@poemJavascript` |
| Python     | `python`, `py`        | `@poemPython`     |
| YAML       | `yaml`, `yml`         | `@poemYaml`       |
| JSON       | `json`                | `@poemJson`       |
| XML        | `xml`                 | `@poemXml`        |
| SQL        | `sql`                 | `@poemSql`        |
| Shell      | `shell`, `bash`, `sh` | `@poemSh`         |
| Markdown   | `markdown`, `md`      | `@poemMarkdown`   |

## Example Output

### HTML Block
```poem
<<<html
<p class="test">Hello <strong>World</strong>!</p>
>>>
```

Highlighting:
- `<p>`, `<strong>` - Tag names in Statement color
- `class="test"` - Attribute (Type) and value (Constant)
- Angle brackets - Identifier color

### Python Block
```poem
<<<python
def hello(name):
    print(f"Hello, {name}!")
>>>
```

Highlighting:
- `def`, `return` - Keywords in Statement color
- `hello`, `print` - Functions in Identifier color
- Strings - Constant color

### YAML Block
```poem
<<<yaml
server:
  host: localhost
  port: 8080
>>>
```

Highlighting:
- `server`, `host`, `port` - Keys in Identifier color
- Colons - Special color
- `8080` - Numbers in Constant color

## Technical Details

### Why Custom Clusters?

When Vim loads a syntax file with `syn include`, it creates syntax groups that belong to a cluster. By specifying the cluster name in the include statement (`@poemHtml`), we tell Vim to put all HTML syntax groups into our custom cluster, which we can then reference in our regions.

### The `b:current_syntax` Dance

Each syntax file sets `b:current_syntax` at the end. We must:
1. `unlet` it before including (so the syntax file loads)
2. `unlet` it after including (so subsequent includes work)
3. Set it to `"poem"` at the very end of our file

### Performance Considerations

Loading 10 syntax files adds ~50-100ms to initial file opening. The `g:poem_no_embedded_languages` flag allows users to disable this if needed.

## References

- Studied `html.vim` from Vim's built-in syntax files
- Pattern matches how HTML embeds JavaScript/CSS and VBScript
- Similar to how Markdown syntax files handle fenced code blocks

## Testing

Verified with HTML, Python, and YAML:
- All tags, keywords, and structures properly highlighted
- Delimiters (`<<<lang` and `>>>`) shown as Delimiter color
- Trailing text after language tags treated as comments
- Plain `<<<` blocks (no language tag) use default literal block highlighting

## Future Enhancements

Potential additions:
- More languages (Rust, Go, Ruby, PHP, etc.)
- Language-specific configuration
- Lazy loading (only include syntax when that language is used)
- Custom language mappings via configuration

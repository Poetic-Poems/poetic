" Vim syntax file
" Language:     Poem
" Maintainer:   (maintainer name)
" Last Change:  2026-07-06
" Filenames:    *.poem
" URL:          https://github.com/Poetic-Poems/poetic

if exists("b:current_syntax")
  finish
endif

" Comment blocks
syn region poemComment start="^<<#" end="^#>>" keepend

" Embedded language support for literal blocks
" Key insight: We need to create custom cluster names (like @poemHtml)
" and include syntax files into those clusters, similar to how html.vim works

" Include common embedded languages into custom clusters
if !exists('g:poem_no_embedded_languages')
  " HTML
  unlet! b:current_syntax
  syn include @poemHtml syntax/html.vim
  unlet! b:current_syntax

  " CSS
  syn include @poemCss syntax/css.vim
  unlet! b:current_syntax

  " JavaScript
  syn include @poemJavascript syntax/javascript.vim
  unlet! b:current_syntax

  " Python
  syn include @poemPython syntax/python.vim
  unlet! b:current_syntax

  " YAML
  syn include @poemYaml syntax/yaml.vim
  unlet! b:current_syntax

  " JSON
  syn include @poemJson syntax/json.vim
  unlet! b:current_syntax

  " XML
  syn include @poemXml syntax/xml.vim
  unlet! b:current_syntax

  " SQL
  syn include @poemSql syntax/sql.vim
  unlet! b:current_syntax

  " Shell
  syn include @poemSh syntax/sh.vim
  unlet! b:current_syntax

  " Markdown
  syn include @poemMarkdown syntax/markdown.vim
  unlet! b:current_syntax
endif

" Literal blocks with language-specific syntax highlighting
" Strategy: Match the <<<lang line, but start highlighting content on the next line using ms
" matchgroup highlights just the delimiters, region contains the embedded language
syn region poemLiteralHtml matchgroup=Delimiter start="^<<<html\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemHtml
syn region poemLiteralCss matchgroup=Delimiter start="^<<<css\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemCss
syn region poemLiteralJavascript matchgroup=Delimiter start="^<<<javascript\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemJavascript
syn region poemLiteralJavascriptAlt matchgroup=Delimiter start="^<<<js\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemJavascript
syn region poemLiteralPython matchgroup=Delimiter start="^<<<python\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemPython
syn region poemLiteralPythonAlt matchgroup=Delimiter start="^<<<py\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemPython
syn region poemLiteralYaml matchgroup=Delimiter start="^<<<yaml\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemYaml
syn region poemLiteralYamlAlt matchgroup=Delimiter start="^<<<yml\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemYaml
syn region poemLiteralJson matchgroup=Delimiter start="^<<<json\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemJson
syn region poemLiteralXml matchgroup=Delimiter start="^<<<xml\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemXml
syn region poemLiteralSql matchgroup=Delimiter start="^<<<sql\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemSql
syn region poemLiteralShell matchgroup=Delimiter start="^<<<shell\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemSh
syn region poemLiteralBash matchgroup=Delimiter start="^<<<bash\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemSh
syn region poemLiteralSh matchgroup=Delimiter start="^<<<sh\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemSh
syn region poemLiteralMarkdown matchgroup=Delimiter start="^<<<markdown\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemMarkdown
syn region poemLiteralMarkdownAlt matchgroup=Delimiter start="^<<<md\>.*$" matchgroup=Delimiter end="^>>>$" keepend contains=@poemMarkdown

" Plain literal blocks (no language tag or unrecognized tag)
syn region poemLiteralBlock start="^<<<$" end="^>>>$" keepend

" Literal block end markers with trailing text
syn match poemLiteralEndLine "^>>>\s\+.*$" contains=poemLiteralEndMark
syn match poemLiteralEndMark "^>>>" contained

" Variables
syn match poemVariableDef "^={\w\+}=" nextgroup=poemVariableValue
syn match poemVariableValue ".*$" contained
syn match poemVariableRef "\${[^}]\+}"

" Multi-line variables
syn region poemMultiLineVarDef start="^={\w\+}<<=" end="^=>>" keepend

" Parameters list after labels
syn match poemParams "(.\{-})" contains=poemParamsDelim,poemParamKey,poemParamValue,poemParamEquals
syn match poemParamsDelim "[(),=]" contained
syn match poemParamKey "[a-zA-Z][a-zA-Z0-9_-]*" contained
syn match poemParamValue "['\"].\{-}['\"]" contained

" Version labels MUST come before segment labels to have priority
" Version labels with trailing text - entire line is Comment, but label part is Identifier
syn match poemVersionLabelLineTrailing "^{{.\{-}}}\s*(\?.*$" contains=poemVersionLabelPart,poemParams
syn match poemVersionLabelPart "^{{.\{-}}}" contained contains=poemVersionLabelDelim,poemVariableRef
syn match poemVersionLabelDelim "{{" contained
syn match poemVersionLabelDelim "}}" contained
" Version labels without trailing text (may have params)
syn match poemVersionLabelLineOnly "^{{.\{-}}}\s*(\?.*$" contains=poemVersionLabelDelim,poemVariableRef,poemParams

" Segment labels with trailing text - must NOT start with {{
syn match poemSegmentLabelLineTrailing "^{[^{}]\+}\s*(\?.*$" contains=poemSegmentLabelPart,poemParams
syn match poemSegmentLabelPart "^{[^{}]\+}" contained contains=poemSegmentLabelDelim,poemVariableRef
syn match poemSegmentLabelDelim "{" contained
syn match poemSegmentLabelDelim "}" contained
" Segment labels without trailing text (may have params)
syn match poemSegmentLabelLineOnly "^{[^{}]\+}\s*(\?.*$" contains=poemSegmentLabelDelim,poemVariableRef,poemParams

" Dividers without trailing text (must come before trailing version for priority)
syn match poemDividerLineOnly "^----$"
" Dividers with trailing text - entire line is Comment, but ---- is Delimiter
syn match poemDividerLineTrailing "^----\s\+.*$" contains=poemDividerMark
syn match poemDividerMark "^----" contained

" End markers without trailing text (must come before trailing version for priority)
" nextgroup hands off to the audio section (see below): it is only ever
" actually used when what follows (after any blank lines) looks like a
" song-service line, so it is a no-op after every other marker.
syn match poemEndMarkerLineOnly "^====$" nextgroup=poemSongService skipwhite skipnl skipempty
" End markers with trailing text
syn match poemEndMarkerLineTrailing "^====\s\+.*$" contains=poemEndMarkerMark nextgroup=poemSongService skipwhite skipnl skipempty
syn match poemEndMarkerMark "^====" contained

" Header section. The title is the first line of the header, which follows the
" optional preamble (blank lines, variable definitions, comment blocks, and
" %directive lines) -- so it is not necessarily line 1. Match it by grammar
" rather than line number: the first non-preamble line that sits on a
" preamble boundary (start of file, or immediately after a blank line, a
" single-line variable definition, a multi-line-variable close, a
" comment-block close, or a %directive line) and is followed by the header's
" optional author line and mandatory date line. The leading negative
" lookahead keeps a preamble line (e.g. a variable definition or a %directive
" at the very top of the file) from being taken as the title, and
" contains=poemVariableRef keeps a ${var} reference in the title highlighted.
syn match poemTitle "\%(\%^\|\%(^\%(\s*\|={\w\+}=.*\|=>>.*\|#>>.*\|\s*%.*\)\n\)\@<=\)\zs\%(={\|=>>\|#>>\|<<#\|%\)\@!.\+\ze\n\%(.\+\n\)\?\d\{4\}-\d\{2\}-\d\{2\}$" contains=poemVariableRef
syn match poemDate "^\d\{4\}-\d\{2\}-\d\{2\}$"

" Audio section: each line names a song-service handler (see
" song-handlers.js / song-handlers.yaml) and, optionally (for the
" "Service: value" form), a value passed to it. The set of services is
" data-driven -- consumers add more under song_handlers: in
" .poetic-config.yaml -- so any identifier-shaped line is matched here,
" rather than a fixed list of names (Audiomack/Suno are just the two
" builtin handlers).
"
" Both are `contained`, reachable only via nextgroup: from the preceding
" "====" marker (skipping any blank lines) for the first song line, and
" from each other for every line after that. This scopes them to the
" audio section without a region: a stray identifier-shaped line
" elsewhere in the poem is never a nextgroup target, so it is never
" mistaken for a song service.
" A song value may be followed by an optional trailing parameter list
" ("Mega: id#key (video, ratio=21:9)") that configures the embed player's size
" and media type. It is highlighted with the same label-parameter groups
" (poemParams) via contains=, so keys/values/delimiters match the label form.
syn match poemSongService "^[a-zA-Z][a-zA-Z0-9_-]*" contained
      \ nextgroup=poemSongValue,poemSongService skipnl skipempty
syn match poemSongValue ":\s\+\S.*$" contained contains=poemParams
      \ nextgroup=poemSongService skipnl skipempty

" Analysis section: rendered as GitHub-Flavoured Markdown.
" Highlight it with the embedded Markdown syntax, from the {Synopsis}/{Full}
" label to the optional end-of-analysis ==== marker (or end of file). Defined
" after the segment-label rules so its region start wins on {Synopsis}/{Full}.
if !exists('g:poem_no_embedded_languages')
  " End just before the ==== line (me=s-1) rather than consuming it, so the
  " marker line is highlighted by the standalone poemEndMarker* rules below --
  " splitting ==== from its trailing "# comment" like every other marker line.
  syn region poemAnalysis
        \ matchgroup=poemAnalysisLabel start="^{Synopsis}.*$" start="^{Full}.*$"
        \ end="^====.*$"me=s-1
        \ keepend contains=@poemMarkdown,poemAnalysisLabel,poemVariableRef
  " The second label ({Full} after a {Synopsis}) appears inside the region.
  syn match poemAnalysisLabel "^{\%(Synopsis\|Full\)}.*$" contained
endif

" Markdown-style headings. The analysis section is handled by the embedded
" Markdown syntax above; these rules cover headings elsewhere (e.g. postscript
" prose) and act as a fallback when embedded languages are disabled.
syn match poemHeading1 "^#\s\+.*$"
syn match poemHeading2 "^##\s\+.*$"
syn match poemHeading3 "^###\s\+.*$"

" Metadata section (the block after a ==== marker at the end of the file).
" Labels: a '#' immediately followed by a non-space run of characters (the
" label body excludes whitespace and the characters & < > \ #), optionally
" followed by a trailing " # comment". A '#' followed by whitespace is a
" Markdown-style heading (poemHeading1 above) instead, so the two rules
" never match the same text: "#tag" is a label, "# words" is a heading.
syn match poemLabelMark "^\s*\zs#\ze[^&<>\\#[:space:]]" nextgroup=poemLabel
syn match poemLabel "[^&<>\\#[:space:]]\+" contained nextgroup=poemLabelComment skipwhite
syn match poemLabelComment "#.*$" contained

" Directives: a '%' followed by a name (letters, digits, '.', '-'), zero or
" more whitespace-separated key:value attribute pairs, and an optional
" trailing " # comment".
syn match poemDirective "^\s*%[[:alnum:]._-]\+" nextgroup=poemDirectiveAttr,poemDirectiveComment skipwhite
syn match poemDirectiveAttr "\<[[:alnum:]._]\+:[[:alnum:].-]\+" contained nextgroup=poemDirectiveAttr,poemDirectiveComment skipwhite
syn match poemDirectiveComment "#.*$" contained

" Inline markup (poem body and labels).
" Emphasis follows Markdown conventions: single markers (* or _) = italic,
" double markers (** or __) = bold. Strikethrough is also a double-marker
" (~~) pair, like strong; a single ~ is never itself markup (reserved for a
" possible future subscript syntax).
" Each pair may span multiple lines within a paragraph but must NOT cross a
" blank line (a paragraph boundary). The extra `end=/^$/` stops a region at the
" blank line so an unmatched marker cannot run away to the end of the file.
" poemStrong is defined after poemEmphasis so that, at a `**`/`__` position, the
" (later-defined) strong region wins over the single-marker emphasis region.
syn region poemEmphasis start="\*" end="\*" end="^$" keepend contains=poemStrong,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemEmphasis start="_" end="_" end="^$" keepend contains=poemStrong,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrong start="\*\*" end="\*\*" end="^$" keepend contains=poemEmphasis,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrong start="__" end="__" end="^$" keepend contains=poemEmphasis,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrikethrough start="\~\~" end="\~\~" end="^$" keepend contains=poemEmphasis,poemStrong,poemVariableRef,poemEscaped
syn region poemLink start="\[" end="\]" end="^$" keepend contains=poemLinkPipe,poemEmphasis,poemStrong,poemStrikethrough,poemSmartSingleQuote,poemSmartDoubleQuote,poemVariableRef
syn match poemLinkPipe "|" contained
syn region poemSmartSingleQuote start="`" end="`" end="^$" keepend
syn region poemSmartDoubleQuote start='"' end='"' end="^$" keepend

" Span elements
syn region poemSpan start="/\.\w[[:alnum:].-]*{" end="}" end="^$" keepend contains=poemEmphasis,poemStrong,poemVariableRef

" Special characters. `\%` is a literal-percent escape, EXCEPT `\%{`: that
" sequence is the render-time `\%{name}` context-variable literal escape
" (substituteContextVars() in poem-render.js), which must keep its backslash,
" so the negative lookahead carves it out of this rule -- mirroring the
" parser's `\\(%(?!\{)|[...])` escape-class regex in poem-to-yaml.js.
syn match poemEscaped "\\%\%({\)\@!\|\\[_*~\[`\"&'\-<>=$/{}\\]"
" Reserved "\?" sequence: not a valid escape, so it is an error in the
" .poem format.
syn match poemReservedEscape "\\?"
" Trailing line-continuation backslash: a single backslash at end of line,
" not preceded by another backslash, joins this line to the next. A
" backslash immediately preceded by another backslash is instead a literal,
" escaped backslash (see poemEscaped above) and the newline is kept, so the
" negative lookbehind keeps that pair from matching here.
syn match poemLineContinuation "\%(\\\)\@<!\\$"
" Em-dash: three hyphens not followed by another hyphen
syn match poemEmDash "---\%(-\)\@!"
" En-dash: two hyphens not followed by another hyphen
syn match poemEnDash "--\%(-\)\@!"

" Quote operator at start of quoted lines (highlight only the '>')
syn match poemQuoteOperator /^\s*\zs>\ze\(\s\|$\)/

" Trailing double-spaces (used as hard line-break markers)
syn match poemTrailingSpaces / \{2,}$/

" Define highlighting - lines with trailing text are Comment
hi def link poemTitle Title
hi def link poemDate Special

hi def link poemDividerLineTrailing Comment
hi def link poemDividerMark Delimiter
hi def link poemDividerLineOnly Delimiter
hi def link poemEndMarkerLineTrailing Comment
hi def link poemEndMarkerMark Delimiter
hi def link poemEndMarkerLineOnly Delimiter

hi def link poemVersionLabelLineTrailing Comment
hi def link poemVersionLabelPart Identifier
hi def link poemVersionLabelLineOnly Identifier
hi def link poemVersionLabelDelim Delimiter

hi def link poemSegmentLabelLineTrailing Comment
hi def link poemSegmentLabelPart Type
hi def link poemSegmentLabelLineOnly Type
hi def link poemSegmentLabelDelim Delimiter

hi def link poemParams String
hi def link poemParamsDelim Delimiter
hi def link poemParamKey Macro
hi def link poemParamValue String

hi def link poemVariableDef Macro
hi def link poemVariableValue String
hi def link poemMultiLineVarDef Macro
hi def link poemVariableRef Identifier

hi def link poemComment Comment
hi def link poemLiteralBlock PreProc
hi def link poemLiteralStartLine Comment
hi def link poemLiteralStartMark Delimiter
hi def link poemLiteralEndLine Comment
hi def link poemLiteralEndMark Delimiter

hi def link poemSongService Keyword
hi def link poemSongValue String

hi def link poemAnalysisLabel Type

hi def link poemHeading1 Title
hi def link poemHeading2 Title
hi def link poemHeading3 Title

hi def link poemLabelMark Delimiter
hi def link poemLabel Identifier
hi def link poemLabelComment Comment

hi def link poemDirective PreProc
hi def link poemDirectiveAttr Macro
hi def link poemDirectiveComment Comment

hi def link poemEmphasis Underlined
hi def link poemStrong Statement
hi def link poemStrikethrough Comment
hi def link poemLink Underlined
hi def link poemLinkPipe Delimiter
hi def link poemSmartSingleQuote String
hi def link poemSmartDoubleQuote String
hi def link poemSpan Special

hi def link poemEscaped Special
hi def link poemReservedEscape Error
hi def link poemLineContinuation Special
hi def link poemEmDash Special
hi def link poemEnDash Special
hi def link poemQuoteOperator Operator
hi def link poemTrailingSpaces Todo

let b:current_syntax = "poem"

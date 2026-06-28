" Vim syntax file
" Language:     Poem
" Maintainer:   (maintainer name)
" Last Change:  2026-06-28
" Filenames:    *.poem
" URL:          https://github.com/warwickallen/poetic

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

" Version labels MUST come before segment labels to have priority
" Version labels with trailing text - entire line is Comment, but label part is Identifier
syn match poemVersionLabelLineTrailing "^{{.\{-}}}\s\+.*$" contains=poemVersionLabelPart
syn match poemVersionLabelPart "^{{.\{-}}}" contained contains=poemVersionLabelDelim,poemVariableRef
syn match poemVersionLabelDelim "{{" contained
syn match poemVersionLabelDelim "}}" contained
" Version labels without trailing text
syn match poemVersionLabelLineOnly "^{{.\{-}}}$" contains=poemVersionLabelDelim,poemVariableRef

" Segment labels with trailing text - must NOT start with {{
syn match poemSegmentLabelLineTrailing "^{[^{}]\+}\s\+.*$" contains=poemSegmentLabelPart
syn match poemSegmentLabelPart "^{[^{}]\+}" contained contains=poemSegmentLabelDelim,poemVariableRef
syn match poemSegmentLabelDelim "{" contained
syn match poemSegmentLabelDelim "}" contained
" Segment labels without trailing text
syn match poemSegmentLabelLineOnly "^{[^{}]\+}$" contains=poemSegmentLabelDelim,poemVariableRef

" Dividers without trailing text (must come before trailing version for priority)
syn match poemDividerLineOnly "^----$"
" Dividers with trailing text - entire line is Comment, but ---- is Delimiter
syn match poemDividerLineTrailing "^----\s\+.*$" contains=poemDividerMark
syn match poemDividerMark "^----" contained

" End markers without trailing text (must come before trailing version for priority)
syn match poemEndMarkerLineOnly "^====$"
" End markers with trailing text
syn match poemEndMarkerLineTrailing "^====\s\+.*$" contains=poemEndMarkerMark
syn match poemEndMarkerMark "^====" contained

" Header section (first 3 lines)
syn match poemTitle "\%1l.*$"
syn match poemDate "^\d\{4\}-\d\{2\}-\d\{2\}$"

" Audio section
syn match poemAudioKeyword "^Audiomack$"
syn match poemSunoLine "^Suno:\s\+\S\+" contains=poemSunoKeyword
syn match poemSunoKeyword "^Suno:" contained

" Analysis section: rendered as GitHub-Flavoured Markdown.
" Highlight it with the embedded Markdown syntax, from the {Synopsis}/{Full}
" label to the optional end-of-analysis ==== marker (or end of file). Defined
" after the segment-label rules so its region start wins on {Synopsis}/{Full}.
if !exists('g:poem_no_embedded_languages')
  syn region poemAnalysis
        \ matchgroup=poemAnalysisLabel start="^{Synopsis}.*$" start="^{Full}.*$"
        \ matchgroup=poemEndMarkerMark end="^====.*$"
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

" Inline markup (poem body and labels).
" Emphasis follows Markdown conventions: single markers (* or _) = italic,
" double markers (** or __) = bold.
" Each pair may span multiple lines within a paragraph but must NOT cross a
" blank line (a paragraph boundary). The extra `end=/^$/` stops a region at the
" blank line so an unmatched marker cannot run away to the end of the file.
" poemStrong is defined after poemEmphasis so that, at a `**`/`__` position, the
" (later-defined) strong region wins over the single-marker emphasis region.
syn region poemEmphasis start="\*" end="\*" end="^$" keepend contains=poemStrong,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemEmphasis start="_" end="_" end="^$" keepend contains=poemStrong,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrong start="\*\*" end="\*\*" end="^$" keepend contains=poemEmphasis,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrong start="__" end="__" end="^$" keepend contains=poemEmphasis,poemStrikethrough,poemVariableRef,poemEscaped
syn region poemStrikethrough start="\~" end="\~" end="^$" keepend contains=poemEmphasis,poemStrong,poemVariableRef,poemEscaped
syn region poemLink start="\[" end="\]" end="^$" keepend contains=poemLinkPipe,poemEmphasis,poemStrong,poemStrikethrough,poemSmartSingleQuote,poemSmartDoubleQuote,poemVariableRef
syn match poemLinkPipe "|" contained
syn region poemSmartSingleQuote start="`" end="`" end="^$" keepend
syn region poemSmartDoubleQuote start='"' end='"' end="^$" keepend

" Span elements
syn region poemSpan start="/\.\w[[:alnum:].-]*{" end="}" end="^$" keepend contains=poemEmphasis,poemStrong,poemVariableRef

" Special characters
syn match poemEscaped "\\[_*~\[`\"&'\-<>=$/{}\\]"
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

hi def link poemAudioKeyword Keyword
hi def link poemSunoKeyword Keyword
hi def link poemSunoLine String

hi def link poemAnalysisLabel Type

hi def link poemHeading1 Title
hi def link poemHeading2 Title
hi def link poemHeading3 Title

hi def link poemEmphasis Underlined
hi def link poemStrong Statement
hi def link poemStrikethrough Comment
hi def link poemLink Underlined
hi def link poemLinkPipe Delimiter
hi def link poemSmartSingleQuote String
hi def link poemSmartDoubleQuote String
hi def link poemSpan Special

hi def link poemEscaped Special
hi def link poemEmDash Special
hi def link poemEnDash Special
hi def link poemQuoteOperator Operator
hi def link poemTrailingSpaces Todo

let b:current_syntax = "poem"

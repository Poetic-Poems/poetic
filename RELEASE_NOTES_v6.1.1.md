Poetic v6.1.1

Release date: 2026-07-19

Summary

Patch release correcting the strikethrough delimiter to the Markdown-conventional double tilde `~~text~~`, superseding v6.1.0's single-tilde `~word~` documentation for the title-markup subset (v6.1.0 shipped before this correction could be folded in).

Changed

- Strikethrough is now `~~text~~` (double tilde), matching Markdown convention — was `~text~`. Applies to both the poem-body WYSIWYG dialect and the restricted title-markup subset added in v6.1.0. A single `~` is now plain literal text, deliberately left unassigned and reserved for a possible future subscript syntax; `\~` still escapes to a literal `~`. Unmatched `~~` remains literal, and `~~…~~` pairs match across lines within a paragraph but not across paragraph boundaries, exactly like `**…**`. No poem in this repo's corpus used single-tilde strikethrough except the canonical example fixture (`_example.poem`), which is updated. See `docs/POEM-SYNTAX.md` (commit 2594f68).

Note

- This supersedes v6.1.0's title-markup documentation, which described strikethrough as single-tilde `~word~`. That was correct for what v6.1.0 shipped, but v6.1.0 was tagged and released before this correction landed, so the `[6.1.0]` CHANGELOG section is left as the historical record of what that release actually contained; this `[6.1.1]` entry is where the corrected behaviour is recorded.

Commits included

2594f68 fix(markup)!: require double-tilde ~~text~~ for strikethrough, not ~text~ (#69) (Warwick Allen)
bf2be59 docs(tech-debt): record deferred index/all-poems title markup (TD26071902) (#68) (Warwick Allen)

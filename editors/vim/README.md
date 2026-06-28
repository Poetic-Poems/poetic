# Vim Syntax Highlighting for Poem Files

Quick installation guide for `.poem` file syntax highlighting in Vim.

## Quick Install

```bash
# For Vim (default)
./install.sh

# For Neovim
./install.sh neovim
```

## Manual Install

```bash
# For Vim
cp syntax/poem.vim ~/.vim/syntax/
cp ftdetect/poem.vim ~/.vim/ftdetect/

# For Neovim
cp syntax/poem.vim ~/.config/nvim/syntax/
cp ftdetect/poem.vim ~/.config/nvim/ftdetect/
```

## Requirements

Ensure your `.vimrc` contains:

```vim
filetype on
filetype plugin on
syntax on
```

## Documentation

See `../VIM-SYNTAX.md` for complete documentation, customisation options, and troubleshooting.


#!/bin/bash
# Installation script for Poem Vim syntax highlighting

set -e

# Determine if we're installing for Vim or Neovim
if [ "$1" = "neovim" ] || [ "$1" = "nvim" ]; then
    VIM_DIR="$HOME/.config/nvim"
    echo "Installing for Neovim..."
elif [ "$1" = "vim" ] || [ -z "$1" ]; then
    VIM_DIR="$HOME/.vim"
    echo "Installing for Vim..."
else
    echo "Usage: $0 [vim|neovim]"
    echo "  vim     - Install for Vim (default)"
    echo "  neovim  - Install for Neovim"
    exit 1
fi

# Create directories if they don't exist
mkdir -p "$VIM_DIR/syntax"
mkdir -p "$VIM_DIR/ftdetect"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy files
echo "Copying syntax file..."
cp "$SCRIPT_DIR/syntax/poem.vim" "$VIM_DIR/syntax/"

echo "Copying filetype detection file..."
cp "$SCRIPT_DIR/ftdetect/poem.vim" "$VIM_DIR/ftdetect/"

echo ""
echo "Installation complete!"
echo ""
echo "Files installed to:"
echo "  $VIM_DIR/syntax/poem.vim"
echo "  $VIM_DIR/ftdetect/poem.vim"
echo ""
echo "To enable syntax highlighting, ensure your .vimrc (or init.vim) contains:"
echo "  filetype on"
echo "  filetype plugin on"
echo "  syntax on"
echo ""
echo "Then restart Vim or run :source \$MYVIMRC"


#!/bin/bash
#
# setup-linux.sh — wrapper that activates nvm before running a command.
#
# On Windows Subsystem for Linux (WSL), the system PATH often includes the
# Windows npm and node binaries before any Linux-installed ones.  Running
# `npm run build` directly can therefore invoke the Windows versions, which
# silently break on Linux-style paths.  This wrapper loads nvm first so the
# correct Linux Node.js is active, then exec's the rest of the command line.
#
# Usage:
#   ./scripts/setup-linux.sh npm run build
#   ./scripts/setup-linux.sh npm run build:all
#   ./scripts/setup-linux.sh <any command>
#
# On macOS or native Linux installs without nvm the script is a transparent
# pass-through — nvm is only loaded if ~/.nvm/nvm.sh exists.

# Load nvm if available, selecting the default (most recent) installed version.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091  # nvm's own install files, not part of this repo
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    # shellcheck disable=SC1091  # nvm's own install files, not part of this repo
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    nvm use node > /dev/null 2>&1
fi

# Replace this shell process with the requested command.
exec "$@"

#!/bin/bash
# Setup script for Linux environment
# This script ensures the correct Node.js and npm versions are used

# Load nvm if it exists
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

    # Use the nvm-installed Node.js version
    nvm use node > /dev/null 2>&1
fi

# Run the command passed as arguments
exec "$@"

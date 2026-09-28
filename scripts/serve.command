#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1
URL="http://localhost:8000"
( sleep 1; open -a Safari "$URL" ) &
python3 -m http.server 8000

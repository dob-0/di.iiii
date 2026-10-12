#!/bin/sh
# Build the MOXIR overview page to dist/ so it opens from file:// and from a server.
# Run from anywhere:  sh docs/moxir/overview/build.sh   (needs the repo's node_modules)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
node "$repo/node_modules/vite/bin/vite.js" build "$here" --config "$here/vite.config.js"
# vite writes a module script; a module script does not load from file://, so make it a classic deferred one
sed -i 's#<script type="module" crossorigin src="./app.js"></script>#<script defer src="./app.js"></script>#' "$here/dist/index.html"
grep -q '<script defer src="./app.js">' "$here/dist/index.html" || { echo "build.sh: dist/index.html still has a module script" >&2; exit 1; }
echo "built: $here/dist/index.html"

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
# --single: one self-contained HTML (script inlined, no photos) for pushing into a space as a project page.
if [ "${1:-}" = "--single" ]; then
  VITE_MEDIA=0 node "$repo/node_modules/vite/bin/vite.js" build "$here" --config "$here/vite.config.js" --outDir "$here/dist-single" >/dev/null
  node -e '
    const fs=require("fs"); const d=process.argv[1];
    let html=fs.readFileSync(d+"/index.html","utf8"); const js=fs.readFileSync(d+"/app.js","utf8").replace(/<\/script/gi,"<\\/script");
    html=html.replace(/<script[^>]*src="\.\/app\.js"[^>]*><\/script>/,"").replace("</body>",()=>"<script>"+js+"</script></body>");
    fs.writeFileSync(d+"/overview-single.html",html); console.log("single file:",d+"/overview-single.html",(html.length/1e6).toFixed(1)+" MB")' "$here/dist-single"
fi

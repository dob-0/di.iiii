#!/usr/bin/env bash
# rehearse-nginx.sh <di.iiii checkout> <nginx-bin> — the same with a REAL nginx: nginx -t of the old and new block, then the new
# block served on scratch ports 18781/18741 (a stub upstream logs what reaches it); every process it starts is stopped by PID.
# nginx-conf.sh finds mime.types as Homebrew lays it out (<prefix>/bin/nginx -> <prefix>/etc/nginx/mime.types). On Debian (r-di),
# give it that layout with two links: <x>/bin/nginx -> /usr/sbin/nginx and <x>/etc/nginx/mime.types -> /etc/nginx/mime.types.
set -euo pipefail
W=${1:?worktree}; NGX=${2:?nginx binary}
S=$(mktemp -d); NP=18781; UP=18741; stub=
cleanup() {
  [[ -f $S/run-new/nginx.pid ]] && kill "$(cat "$S/run-new/nginx.pid")" 2>/dev/null || true
  [[ -n $stub ]] && kill "$stub" 2>/dev/null || true
  sleep 0.3; rm -rf "$S"
}
trap cleanup EXIT
cd "$W"
echo "== nginx: $("$NGX" -v 2>&1)"
git show origin/dev:scripts/standby/nginx-conf.sh > "$S/old-nginx-conf.sh"
mkdir -p "$S/rel/dist"; cp nginx.conf "$S/rel/nginx.conf.prod"
echo '<!doctype html><title>shell</title>' > "$S/rel/dist/index.html"
echo '<urlset>built</urlset>' > "$S/rel/dist/sitemap.xml"
for v in old new; do
  [[ $v == old ]] && sc="$S/old-nginx-conf.sh" || sc=scripts/standby/nginx-conf.sh
  echo "== $v nginx-conf.sh with the real nginx (nginx -t runs inside)"
  bash "$sc" "$NGX" "$S/rel" 127.0.0.1:$NP 127.0.0.1:$UP "$S/run-$v" "$S/out-$v/nginx.conf" 2>&1 | sed "s#$S#<scratch>#g" || true
  echo "   sitemap-built line: $(grep -nE '^[^#]*alias ' "$S/out-$v/server.conf" | sed "s#$S#<scratch>#g")"
done
echo "== new server-env.mjs: SHELL_URL / SITEMAP_BUILT_URL for --nginx 127.0.0.1:$NP"
grep -ohE '\$\{[A-Za-z_][A-Za-z0-9_]*' docker-compose.yml docker-compose.dev.yml | sort -u | sed 's/^\${//' \
  | grep -vx 'SHELL_URL\|SITEMAP_BUILT_URL' | sed 's/.*/&=v-&/' > "$S/source.env"
node scripts/standby/server-env.mjs --compose docker-compose.yml --compose docker-compose.dev.yml \
  --set MAX_UPLOAD_MB=95 --set PORT=4001 --env "$S/source.env" --data-root /tmp/none --nginx 127.0.0.1:$NP \
  | grep -E '^(SHELL_URL|SITEMAP_BUILT_URL)=' | tee "$S/urls"
echo "== serve the new block (stub upstream on $UP logs every request it gets)"
node -e "require('http').createServer((q,r)=>{require('fs').appendFileSync('$S/upstream.log',q.url+'\n');r.end('upstream')}).listen($UP,'127.0.0.1')" & stub=$!
"$NGX" -c "$S/out-new/nginx.conf" -p "$S/run-new"; sleep 0.5
while IFS='=' read -r k url; do
  echo "   $k -> $(curl -s -o "$S/body" -w '%{http_code}' "$url") body: $(head -c 60 "$S/body")"
done < "$S/urls"
echo "   /terms (page route) -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$NP/terms)"
echo "   requests that reached the upstream: $(tr '\n' ' ' < "$S/upstream.log" 2>/dev/null || echo none)"

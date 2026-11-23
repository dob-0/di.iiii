#!/usr/bin/env bash
# rehearse-env.sh <di.iiii checkout> — rehearse a change to scripts/standby/server-env.mjs and nginx-conf.sh on a box that is not
# the Mac (r-di first, owner's rule 2026-10-08): the origin/dev copies against the working tree, in a scratch dir, no nginx needed.
# The checkout needs the ref origin/dev and the files the scripts read (the two scripts, docker-compose*.yml, nginx.conf).
# First used for languages S13a (2026-10-29): results in the session note docs/ai/sessions/fix-ux-s13a-page-route-on-mac.md.
set -euo pipefail
W=${1:?worktree}; S=$(mktemp -d); trap 'rm -rf "$S"' EXIT
cd "$W"
git show origin/dev:scripts/standby/server-env.mjs > "$S/old-server-env.mjs"
git show origin/dev:scripts/standby/nginx-conf.sh > "$S/old-nginx-conf.sh"
# a source.env like the dev tier's: every name the compose files read, but SHELL_URL/SITEMAP_BUILT_URL unset (as on the Mac)
grep -ohE '\$\{[A-Za-z_][A-Za-z0-9_]*' docker-compose.yml docker-compose.dev.yml | sort -u | sed 's/^\${//' \
  | grep -vx 'SHELL_URL\|SITEMAP_BUILT_URL' | sed 's/.*/&=v-&/' > "$S/source.env"
args=(--compose docker-compose.yml --compose docker-compose.dev.yml --set MAX_UPLOAD_MB=95 --set PORT=4001 --env "$S/source.env" --data-root /usr/local/var/di-dev/data)
echo "== old server-env.mjs, as release.sh genenv runs it today"
node "$S/old-server-env.mjs" "${args[@]}" 2>/dev/null | grep -E '^(SHELL_URL|SITEMAP_BUILT_URL)='
echo "== old server-env.mjs given the new di-atlas flag --nginx (must ignore it)"
node "$S/old-server-env.mjs" "${args[@]}" --nginx 127.0.0.1:8081 2>/dev/null | grep -E '^(SHELL_URL|SITEMAP_BUILT_URL)='
echo "== new server-env.mjs with --nginx 127.0.0.1:8081 (dev tier)"
node scripts/standby/server-env.mjs "${args[@]}" --nginx 127.0.0.1:8081 2>&1 | grep -E '^(SHELL_URL|SITEMAP_BUILT_URL)=|server-env:'
echo "== new server-env.mjs without --nginx (an old release.sh): refuses"
node scripts/standby/server-env.mjs "${args[@]}" >/dev/null 2>"$S/err" || echo "exit $?: $(cat "$S/err")"
# nginx-conf: a release dir as build-runtime.sh leaves it; nginx -t by a stand-in (no nginx on this host)
mkdir -p "$S/rel/dist" "$S/bin"; cp nginx.conf "$S/rel/nginx.conf.prod"; printf '#!/bin/sh\nexit 0\n' > "$S/bin/nginx"; chmod +x "$S/bin/nginx"
for v in old new; do
  [[ $v == old ]] && sc="$S/old-nginx-conf.sh" || sc=scripts/standby/nginx-conf.sh
  echo "== $v nginx-conf.sh: lines naming /usr/share/nginx/html or the release dist"
  bash "$sc" "$S/bin/nginx" "$S/rel" 127.0.0.1:8081 127.0.0.1:4001 "$S/run-$v" "$S/out-$v/nginx.conf" >/dev/null 2>&1 && echo "exit 0" || echo "exit $?"
  grep -nE '^[^#]*(/usr/share/nginx/html|dist)' "$S/out-$v/server.conf" | sed "s#$S#<scratch>#g"
done

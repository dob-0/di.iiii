#!/usr/bin/env bash
# build-runtime.sh — build di.iiii's production runtime natively at one pinned commit, laid out
# exactly like the two prod images, for a warm-standby host that has no Docker.
#
#   build-runtime.sh <git-sha> <out-dir>
#
# Result: <out-dir>/releases/<sha>/
#   app/      = serverXR/Dockerfile's /app  (package + npm ci --omit=dev, src, public, 2 scripts, release.json)
#   shared/   = serverXR/Dockerfile's /shared (app/../shared, as in the image)
#   dist/     = the root Dockerfile's built SPA (served by nginx in prod)
#   nginx.conf.prod = the repo's nginx.conf at that commit, unmodified
# and <out-dir>/node-v<ver>/ with the pinned Node. Nothing is started and nothing outside <out-dir>
# is touched, so running it twice is safe. Runs ON the standby host: source and packages come over
# that host's own line.
set -euo pipefail

sha=${1:?usage: build-runtime.sh <git-sha> <out-dir>}
out=${2:?usage: build-runtime.sh <git-sha> <out-dir>}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "need a full 40-char commit sha, got: $sha" >&2; exit 2; }

# Node = NODE_VERSION inside prod's node:24-alpine@sha256:d32cdf61… (both Dockerfiles). The
# tarball hash is from nodejs.org SHASUMS256.txt, whose signature was checked against the
# nodejs/release-keys list (signer 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356) on 2026-09-26.
NODE_VERSION=24.19.0
REPO=https://github.com/dob-0/di.iiii.git

case "$(uname -s)-$(uname -m)" in
  # macOS ships bash 3.2 (no associative arrays), hence one case arm per platform
  Darwin-arm64) plat=darwin-arm64 node_sha256=8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d ;;
  *) echo "no pinned Node hash for $(uname -s)-$(uname -m); add one here" >&2; exit 2 ;;
esac

mkdir -p "$out"; out=$(cd "$out" && pwd)
work="$out/.build-$sha"
rm -rf "$work"; mkdir -p "$work"
trap 'rm -rf "$work"' EXIT
log() { printf '[build %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# 1. Node, checked against the pinned hash
nd="$out/node-v$NODE_VERSION"
if [[ ! -x $nd/bin/node ]]; then
  tgz="node-v$NODE_VERSION-$plat.tar.gz"
  log "fetching $tgz"
  curl -fsSL -o "$work/$tgz" "https://nodejs.org/dist/v$NODE_VERSION/$tgz"
  got=$(shasum -a 256 "$work/$tgz" | cut -d' ' -f1)
  [[ $got == "$node_sha256" ]] || { echo "node tarball sha256 $got != pinned $node_sha256" >&2; exit 1; }
  mkdir -p "$nd.tmp" && tar -xzf "$work/$tgz" -C "$nd.tmp" --strip-components 1 && mv "$nd.tmp" "$nd"
fi
export PATH="$nd/bin:$PATH"
[[ $(node -v) == "v$NODE_VERSION" ]] || { echo "node is $(node -v), want v$NODE_VERSION" >&2; exit 1; }

# 2. source at exactly that commit
log "fetching $sha"
src="$work/src"
git init -q "$src"
git -C "$src" fetch -q --depth 1 "$REPO" "$sha"
git -C "$src" checkout -q FETCH_HEAD
[[ $(git -C "$src" rev-parse HEAD) == "$sha" ]]

# 3. server, as serverXR/Dockerfile lays it out
rel="$out/releases/$sha"
rm -rf "$rel.tmp"; mkdir -p "$rel.tmp/app/scripts"
log "server: npm ci --omit=dev"
cp "$src/serverXR/package.json" "$src/serverXR/package-lock.json" "$rel.tmp/app/"
(cd "$rel.tmp/app" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
cp -R "$src/serverXR/src" "$src/serverXR/public" "$rel.tmp/app/"
cp "$src/scripts/space-bundle.mjs" "$src/scripts/project-move.mjs" "$rel.tmp/app/scripts/"
cp -R "$src/shared" "$rel.tmp/shared"
printf '{"deployEnv":"%s","sourceRef":"%s","gitCommit":"%s","releaseId":"%s","generatedAt":"%s"}\n' \
  standby "$sha" "$sha" "$sha" "$(date -u +%FT%TZ)" > "$rel.tmp/app/release.json"

# 4. client, as the root Dockerfile builds it (VITE_API_BASE_URL empty, as in prod's build)
log "client: npm ci + build"
(cd "$src" && npm ci --no-audit --no-fund --loglevel=error && VITE_API_BASE_URL= npm run build)
cp -R "$src/dist" "$rel.tmp/dist"
cp "$src/nginx.conf" "$rel.tmp/nginx.conf.prod"
cp "$src/docker-compose.yml" "$rel.tmp/docker-compose.yml"   # server-env.mjs reads prod's variable list from it

rm -rf "$rel"; mv "$rel.tmp" "$rel"
log "done: $rel ($(du -sh "$rel" | cut -f1))"

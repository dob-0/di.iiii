#!/bin/sh
# di.iiii — one line, on your own machine.
#
#   curl -fsSL https://di-studio.xyz/get | sh
#
# This script is deliberately small and permanently stable. It only: works out
# what machine this is, makes sure there is a node, downloads the current
# release, checks it, and hands over to bootstrap.mjs. Every real decision lives
# in the versioned CLI, so the URL above never has to change.
#
# POSIX sh — no bashisms. It has to run under busybox ash on Alpine.
# Nothing is written outside $HOME. Nothing asks for sudo.

set -eu

REPO="dob-0/di.iiii"
NODE_VERSION="v22.22.0"
DI_HOME="${DI_HOME:-$HOME/.di}"

info()  { printf '%s\n' "$*"; }
dim()   { printf '  %s\n' "$*"; }
die()   { printf '\n%s\n' "$*" >&2; exit 1; }

need() {
    command -v "$1" >/dev/null 2>&1 || die "di.iiii needs \`$1\` to install, and this machine does not have it."
}

# ── what machine is this ─────────────────────────────────────────────────────

uname_s=$(uname -s)
uname_m=$(uname -m)

case "$uname_s" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    *)      die "di.iiii does not install on $uname_s yet.
On Windows, use PowerShell:  irm https://di-studio.xyz/get.ps1 | iex" ;;
esac

case "$uname_m" in
    x86_64|amd64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)             die "di.iiii does not have a build for $uname_m." ;;
esac

# musl needs a different node build, and picking the wrong one fails much later
# with a confusing dynamic-linker error.
LIBC="glibc"
if [ "$OS" = "linux" ] && [ -f /etc/alpine-release ]; then LIBC="musl"; fi
if [ "$OS" = "linux" ] && command -v ldd >/dev/null 2>&1; then
    if ldd --version 2>&1 | head -1 | grep -qi musl; then LIBC="musl"; fi
fi

need curl
need tar

# ── the plan, if that is all that was asked for ──────────────────────────────

if [ "${DI_INSTALL_DRY:-}" = "1" ]; then
    info "di.iiii install plan"
    dim "os      $OS/$ARCH ($LIBC)"
    dim "home    $DI_HOME"
    dim "node    $(command -v node >/dev/null 2>&1 && node -v || echo 'none — would download')"
    dim "source  https://github.com/$REPO/releases/latest"
    exit 0
fi

# ── a node to run the CLI with ───────────────────────────────────────────────
# Separate question from how di.iiii runs: even a docker install needs a node
# for the CLI itself.

node_ok() {
    [ -x "$1" ] || return 1
    v=$("$1" -v 2>/dev/null | sed 's/^v//') || return 1
    major=$(printf '%s' "$v" | cut -d. -f1)
    minor=$(printf '%s' "$v" | cut -d. -f2)
    # A node that cannot start prints nothing, and busybox's [ answers an empty
    # operand with "out of range" rather than false — which reads like a bug in
    # this script instead of a broken node.
    case "$major" in ''|*[!0-9]*) return 1 ;; esac
    case "$minor" in ''|*[!0-9]*) return 1 ;; esac
    [ "$major" -gt 22 ] && return 0
    [ "$major" -eq 22 ] && [ "$minor" -ge 15 ] && return 0
    return 1
}

DI_NODE=""
if node_ok "$DI_HOME/runtime/node/bin/node"; then
    DI_NODE="$DI_HOME/runtime/node/bin/node"
elif command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
    DI_NODE=$(command -v node)
else
    # node:sqlite is unflagged only later in the 22 line, which is why an older
    # 22 is not good enough and is replaced rather than used.
    # nodejs.org publishes no musl build — Alpine's node comes from Node's own
    # unofficial-builds host. Pointing musl at nodejs.org 404s, which is exactly
    # what "install on every system" quietly means in practice.
    if [ "$LIBC" = "musl" ]; then
        NODE_PKG="node-$NODE_VERSION-linux-$ARCH-musl"
        NODE_URL="https://unofficial-builds.nodejs.org/download/release/$NODE_VERSION/$NODE_PKG.tar.gz"
    else
        NODE_PKG="node-$NODE_VERSION-$OS-$ARCH"
        NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_PKG.tar.gz"
    fi

    info "getting node $NODE_VERSION…"
    mkdir -p "$DI_HOME/runtime"
    tmp_node=$(mktemp -d)
    trap 'rm -rf "$tmp_node"' EXIT
    if ! curl -fsSL "$NODE_URL" -o "$tmp_node/node.tar.gz"; then
        die "di.iiii could not start on this machine.

  docker      not checked — no node to check with
  node.js     not found, and nodejs.org could not be reached

You need one of these. Pick whichever sounds easier:

  Docker Desktop   https://docker.com/products/docker-desktop
                   install it, open it once, then run this line again
  Node.js 22       https://nodejs.org  — the big green LTS button

Nothing was installed."
    fi
    rm -rf "$DI_HOME/runtime/node"
    mkdir -p "$DI_HOME/runtime/node"
    tar -xzf "$tmp_node/node.tar.gz" -C "$DI_HOME/runtime/node" --strip-components 1
    DI_NODE="$DI_HOME/runtime/node/bin/node"
    if ! node_ok "$DI_NODE"; then
        # Alpine's base image has no libstdc++/libgcc, which the musl node needs.
        # Those are system packages, and this installer does not take root — so
        # say the one line that fixes it rather than failing in riddles.
        if [ "$LIBC" = "musl" ]; then
            rm -rf "$DI_HOME/runtime/node"
            die "di.iiii downloaded node, but it needs two system libraries this machine does not have.

On Alpine, either add them:
  apk add --no-cache libstdc++ libgcc

or just use Alpine's own node:
  apk add --no-cache nodejs npm

then run this line again."
        fi
        die "the node di.iiii downloaded does not run on this machine."
    fi
fi

# ── the release ──────────────────────────────────────────────────────────────

tmp=$(mktemp -d)
trap 'rm -rf "$tmp" "${tmp_node:-}"' EXIT

# DI_INSTALL_ARTIFACT points at an artifact already on disk — how CI exercises
# this script against a build that has not been released yet, and how you test a
# change to it without publishing anything.
if [ -n "${DI_INSTALL_ARTIFACT:-}" ]; then
    [ -f "$DI_INSTALL_ARTIFACT" ] || die "no such artifact: $DI_INSTALL_ARTIFACT"
    VERSION="${DI_INSTALL_VERSION:-0.0.0-local}"
    ARTIFACT="di-runtime-$VERSION.tar.gz"
    cp "$DI_INSTALL_ARTIFACT" "$tmp/$ARTIFACT"
    info "installing $VERSION from disk…"
else
    info "finding the newest di.iiii…"
    API="https://api.github.com/repos/$REPO/releases/latest"
    VERSION=$(curl -fsSL "$API" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
    [ -n "$VERSION" ] || die "could not read the release feed — is github.com reachable?"

    ARTIFACT="di-runtime-$VERSION.tar.gz"
    BASE="https://github.com/$REPO/releases/download/v$VERSION"

    info "downloading $VERSION…"
    curl -fsSL "$BASE/$ARTIFACT" -o "$tmp/$ARTIFACT" || die "could not download $ARTIFACT"
fi

# Verify when we can. A missing sha256 tool is a reason to say so, not a reason
# to pretend the check passed.
if [ -z "${DI_INSTALL_ARTIFACT:-}" ] && curl -fsSL "$BASE/checksums.txt" -o "$tmp/checksums.txt" 2>/dev/null; then
    SUM=""
    if command -v sha256sum >/dev/null 2>&1; then
        SUM=$(sha256sum "$tmp/$ARTIFACT" | cut -d' ' -f1)
    elif command -v shasum >/dev/null 2>&1; then
        SUM=$(shasum -a 256 "$tmp/$ARTIFACT" | cut -d' ' -f1)
    fi
    if [ -n "$SUM" ]; then
        WANT=$(grep "$ARTIFACT" "$tmp/checksums.txt" | cut -d' ' -f1 | head -1)
        if [ -n "$WANT" ] && [ "$SUM" != "$WANT" ]; then
            die "checksum mismatch — refusing to install.
  expected $WANT
  got      $SUM"
        fi
    else
        info "  (no sha256 tool here — skipping the checksum)"
    fi
fi

# Staged inside DI_HOME, not /tmp: bootstrap renames this into place, and a
# rename across filesystems (tmpfs -> home) fails outright. The .partial suffix
# is what keeps a failed install from leaving something that looks installed.
STAGED="$DI_HOME/versions/$VERSION.partial"
rm -rf "$STAGED"
mkdir -p "$STAGED"
tar -xzf "$tmp/$ARTIFACT" -C "$STAGED" --strip-components 1

# ── hand over ────────────────────────────────────────────────────────────────

DI_HOME="$DI_HOME" exec "$DI_NODE" "$STAGED/cli/bootstrap.mjs" --staged "$STAGED" --version "$VERSION"

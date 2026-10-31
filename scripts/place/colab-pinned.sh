#!/usr/bin/env bash
# The Colab CLI at a pinned version, for scripts/place/colab-job.mjs.
#
# Why pinned: google-colab-cli 0.6.0 never renews the runtime proxy token
# (tokenExpiresInSeconds 3600), so at one hour every exec answers 404/401 and
# the CLI drops the session while the runtime and the job on it live on.
# Measured 2026-10-31: an idle CPU runtime "lost" at 60-65 min, its token's exp
# 22:42:55, the loss 22:43:34; the A100 Meshroom run lost the same way at 62 min.
# 0.7.5 refreshes the token near expiry (colab_cli/common.py, "Load a session,
# refreshing its runtime proxy token if it's near expiry").
#
# uvx runs it in its own cached environment, so the installed `colab` stays as
# it is. The uv cache follows the real user even when HOME is pointed at
# another Colab login's state (HOME=…/colab/<login>).
set -euo pipefail
VERSION="${PLACE_COLAB_VERSION:-0.7.5}"
REAL_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
exec uvx --cache-dir "${UV_CACHE_DIR:-$REAL_HOME/.cache/uv}" \
  --from "google-colab-cli==${VERSION}" colab "$@"

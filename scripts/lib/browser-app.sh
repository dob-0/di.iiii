#!/usr/bin/env bash
# browser-app.sh — shell twin of scripts/lib/browserApp.mjs: which Flatpak browser the di tools launch.
#   source scripts/lib/browser-app.sh; app=$(di_browser_app) || exit 2
# Order: env DI_BROWSER_APP, then `app=` in ${XDG_CONFIG_HOME:-$HOME/.config}/di/browser.conf, then org.chromium.Chromium.
# Short names: chromium, ungoogled. A set but unknown value: ONE line on stderr, return 2 (no silent fallback).
# Never shells out to di-browser: the file is the interface.

di_browser_conf_path() { printf '%s/di/browser.conf' "${XDG_CONFIG_HOME:-$HOME/.config}"; }

di_browser_app() {
  local value="${DI_BROWSER_APP:-}" where=DI_BROWSER_APP conf line key
  # the env value is NOT trimmed: a value with spaces is set but wrong (same as di-atlas)
  if [ -z "$value" ]; then
    where=$(di_browser_conf_path)
    if [ -r "$where" ]; then
      while IFS= read -r line || [ -n "$line" ]; do
        line=${line%$'\r'}
        line=${line#"${line%%[![:space:]]*}"}
        case "$line" in ''|'#'*) continue;; *=*) ;; *) continue;; esac
        key=${line%%=*}; key=${key%"${key##*[![:space:]]}"}
        if [ "$key" = app ]; then
          value=${line#*=}
          value=${value#"${value%%[![:space:]]*}"}; value=${value%"${value##*[![:space:]]}"}
        fi
      done <"$where" 2>/dev/null || true
    fi
  fi
  case "$value" in
    ''|chromium|org.chromium.Chromium) printf 'org.chromium.Chromium\n';;
    ungoogled|io.github.ungoogled_software.ungoogled_chromium) printf 'io.github.ungoogled_software.ungoogled_chromium\n';;
    *) printf 'browser: unknown app "%s" in %s (use: chromium, ungoogled, org.chromium.Chromium, io.github.ungoogled_software.ungoogled_chromium)\n' "$value" "$where" >&2; return 2;;
  esac
}

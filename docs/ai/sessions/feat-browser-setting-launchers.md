## 2026-11-18 — the di launchers follow the one browser setting (Chromium stays the default)

- New resolver `scripts/lib/browserApp.mjs` (+ shell twin `scripts/lib/browser-app.sh`): env `DI_BROWSER_APP`, then `app=` in `~/.config/di/browser.conf`, then `org.chromium.Chromium`; short names `chromium` and `ungoogled`; a set but unknown value is refused in one line. The file is the interface; nothing shells out to `di-browser`.
- `scripts/dev-stack.mjs`, `scripts/rigbuild/rig-links.mjs` and `scripts/show/stage-open.sh` use it. Chromium mode prints the same commands as before (argv tests, and the old and new `stage-open.sh --dry-run` output compared byte for byte). Any other browser gets its own profile path, so a newer build never opens an older one's profile.
- `scripts/di/stagePlan.mjs` only lists local executables for the kiosk and launches no Flatpak, so it is unchanged.
- Not done here: di-atlas tools (their own PR), and the branches that add new `org.chromium.Chromium` sites (listed in the PR).

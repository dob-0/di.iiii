# The studio chat as an installed app

`/chat` is an ordinary page. Two things turn it into something a phone installs:
a web manifest, and — for people who want a file to send rather than a link to
open — an Android APK that wraps the same address.

Nothing here is a second copy of the chat. Both routes open
`https://di-studio.xyz/chat`; the app is a window, not a client.

## The web half (ships with the repo)

| file | what it does |
| --- | --- |
| `public/chat/manifest.webmanifest` | name, icons, `start_url: /chat`, `display: standalone` |
| `public/chat/icon-*.png` | 192, 512 and a maskable 512, cut from `public/suite/icon-512.png` |
| `public/chat-sw.js` | network-first worker, scope `/chat` only |
| `public/.well-known/assetlinks.json` | lets the APK own this origin — no address bar |

The manifest link and the worker are registered by `src/chat/StudioChatSurface.jsx`
and nowhere else. **Do not move either into `src/index.html`.** Site-wide, the
browser would offer to install the whole platform under the chat's name, and the
worker would put a cache in front of the editor — a stale app shell handed to
somebody authoring a scene is a much worse bug than a chat that needs the network.

`assetlinks.json` is served two different ways, and both must keep working:
nginx serves it straight out of `dist/` on the hosted tiers, while a `di` install
has serverXR in front (`serverXR/src/index.js`, the `/.well-known/assetlinks.json`
route) because `express.static` ignores every path with a dot segment.

## The APK

Built with [bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) as a
Trusted Web Activity: a Chrome tab with no browser chrome, tied to the origin by
the fingerprint in `assetlinks.json`.

- project: `android-twa/` (git-ignored — it is generated, and it holds nothing
  that is not either in `twa-manifest.json` or downloadable)
- package id: `xyz.distudio.chat`
- signing key: `~/di-backups/keystores/dii-studio-chat.keystore`, alias `dii-chat`,
  password in `dii-studio-chat.password` beside it, mode 600.
  **Keep it.** An APK signed with a different key cannot update an installed one;
  losing it means every phone has to uninstall before it can install again.
- fingerprint in `public/.well-known/assetlinks.json`:
  `F0:F8:3F:…:FC:F8` — if the key is ever replaced, this file changes with it,
  and the change has to be deployed before the new APK will run without an
  address bar.

### Toolchain (aylmo, 2026-09-10)

The box had a headless JRE and no JDK, and no Android SDK at all:

```
~/android-sdk/                 command line tools, platform-tools, build-tools 34 + 36.1
~/android-sdk/jdk/             Temurin 17 (bubblewrap and Gradle both refuse JDK 25)
~/android-sdk/bin -> cmdline-tools/latest/bin
~/.bubblewrap/config.json      points at the two paths above
```

The symlink is not decoration: bubblewrap looks for `<sdk>/bin/sdkmanager`, a
layout the modern SDK does not use, and refuses the path without it.

### Rebuild

```bash
cd android-twa
export JAVA_HOME=$HOME/android-sdk/jdk
export BUBBLEWRAP_KEYSTORE_PASSWORD=$(cat ~/di-backups/keystores/dii-studio-chat.password)
export BUBBLEWRAP_KEY_PASSWORD=$BUBBLEWRAP_KEYSTORE_PASSWORD
npx @bubblewrap/cli build --skipPwaValidation
```

Output: `app-release-signed.apk` (the file to hand out) and
`app-release-bundle.aab` (only needed for a Play Store listing, which this is not).

Bumping the version is `appVersionName` / `appVersionCode` in
`twa-manifest.json` — raise the code by one for every build people install over.
Answer its prompts by hand; piping `yes` into it writes "y" into the version name.

### The staging twin

`assetlinks.json` lists a second package, `xyz.distudio.chat.staging`, signed with
the same key. It exists because an APK is host-locked: the only way to see the
finished thing — no address bar, the real room, a real phone — before it reaches
the live site is to build the same app against `staging.di-studio.xyz` and run
that. Its project is `android-twa-staging/` (git-ignored whole; it is the prod
manifest with four fields changed). Delete the entry if the twin is ever retired.

### Traps

- **The icons are fetched over HTTP at build time.** `iconUrl` and
  `webManifestUrl` in `twa-manifest.json` point at a local server serving `dist/`
  (`http://localhost:4010/...`) so a build does not depend on the artwork already
  being deployed. `host` and `fullScopeUrl` are what decide where the app goes.
- **The app is host-locked.** One APK opens one origin. A build for staging is a
  different app from the build for the live site, and they cannot be swapped by
  changing a setting on the phone.
- **Without `assetlinks.json` deployed to that host** the app still runs, but
  Chrome draws its address bar across the top and it stops looking like an app.

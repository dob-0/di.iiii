# di.iiii desktop app

di.iiii in its own window, with Web MIDI, WebGPU and screen share. It is a thin Electron shell around the web app: no page of di.iiii is copied here, the window opens the live address. It sits beside `android-twa/` (the phone wrapper) and has its own `package.json`, so the web app's install does not grow.

Engine: Electron `45.3.4` (pinned exact; the newest stable on the npm registry on 2026-11-18, published 2026-11-17). Packaging: electron-builder `26.18.0`. It builds Linux AppImage and deb, macOS dmg for arm64 and x64, and Windows nsis from one config; Electron Forge has no AppImage maker, so it would have needed a second tool.

## Run

```bash
cd desktop
npm ci
npm start                          # https://diiii.xyz
npm start -- --dev                 # https://dev.diiii.xyz
npm start -- --local               # http://diiii.localhost
npm start -- --url http://127.0.0.1:5173   # any other address (or DI_DESKTOP_URL)
```

Each address keeps its own profile (`di-desktop-prod`, `-dev`, `-local`, `-custom-<hash>` under the system's app data folder), so sign-ins never cross.

## What the window allows

- The window stays on di origins: `https://diiii.xyz`, `https://dev.diiii.xyz`, `http://diiii.localhost`, plus the address you chose. A link to anything else opens in the system browser (web and mail links only; other schemes are dropped).
- Web MIDI (with sysex), screen share and camera/microphone are granted only to those origins and refused everywhere else, for page and frame alike. Full screen, pointer lock and copy-out keep working as in a browser tab.
- The page gets no Node: `contextIsolation` and `sandbox` on, `nodeIntegration` off, `webSecurity` untouched.
- Screen share: the system picker on macOS 15 and later, a short list otherwise (on Linux the system's own picker lists the sources).
- DevTools port: only with `DI_DESKTOP_CDP=<port>` (1024 to 65535, loopback only). Never on by default.
- WebGPU: Windows and macOS need no switch. On Linux the app adds `enable-unsafe-webgpu` and `enable-features=Vulkan`; `DI_DESKTOP_GPU=default` drops them. The pinned Electron's docs name no WebGPU switch, so on Linux this is measured on a machine, not documented.

## Test

```bash
cd desktop
npm run test:unit                                  # origin, permission, navigation policy
xvfb-run -a npm run test:smoke                     # real window against a local fixture page
```

The smoke test needs a display: use `xvfb-run` or `di-agent-screen exec`, never a person's own screen. On a runner without user namespaces add `DI_TEST_NO_SANDBOX=1` (adds `--no-sandbox` to the test launch only). `DI_DESKTOP_SHOTS=<dir>` writes pictures at 1536x864 and 864x1536.

## Installers (unsigned)

`.github/workflows/desktop-app.yml` builds them. On a pull request touching `desktop/` they are workflow artifacts; on a published release (or by hand with a tag) they are attached to the release.

- **macOS**: ad-hoc signed (`identity: "-"`, hardened runtime off, per electron-builder's own option notes). Apple Silicon refuses code with no signature at all; an ad-hoc signature satisfies that, so the app starts. It is not notarized, so Gatekeeper still asks on first open (right-click, Open). Notarization needs a paid Apple Developer Program account: $99 annual membership, read on developer.apple.com/programs on 2026-11-18.
- **Windows**: unsigned, so SmartScreen shows a warning on first run ("More info", then "Run anyway"). A signing certificate removes it.
- **Linux**: AppImage and deb need no signing.

## Undo

Delete `desktop/` and `.github/workflows/desktop-app.yml`. Nothing else in the repo refers to them except the copy-guard file list in `src/copyVocabulary.test.js`.

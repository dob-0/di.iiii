## 2026-11-18 — di desktop app (Electron): di in its own window with Web MIDI, WebGPU and screen share

- New `desktop/` folder (own `package.json`, Electron 45.3.4 and electron-builder 26.18.0 pinned exact) and `.github/workflows/desktop-app.yml`. The web app's install is unchanged.
- The window opens the public address, `--dev`, `--local` or a custom address, one profile per address; links off the di origins go to the system browser; midi, midiSysex and media are granted only to di origins.
- Tests: node:test units for the policy and handlers, and a Playwright `_electron` smoke test under xvfb. CI builds Linux, macOS and Windows installers unsigned (macOS ad-hoc signed).
- Not done: signed or notarized installers, auto-update, a real GPU adapter check (the virtual display has none).

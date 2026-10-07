## 2026-10-08 — the standby build runs on a Linux aarch64 host (r-di, a Raspberry Pi 3 B+)

- scripts/standby/build-runtime.sh had a pinned Node hash for macOS only. Added a `Linux-aarch64` line (Node 24.19.0, hash from nodejs.org SHASUMS256.txt over HTTPS; the release-keys signature of that file is not yet checked for this line), and a portable sha256 (`shasum` or `sha256sum`).
- New `CLIENT_DIST=<dir>`: use a dist built elsewhere at the same commit instead of the vite build, because a 905 MB Pi cannot run it. The SPA is plain files, identical on every platform.
- Measured on r-di: the release for the Mac's prod commit builds in about 80 s (`npm ci --omit=dev`, sharp arm64 binary needs no compiler), 210 MB; the server starts with throwaway secrets and an empty data root, health 200, RSS 99 MB. Run by hand, not yet a service; no prod data yet.
- Owed: systemd unit on r-di, prod data restore (secrets on the Pi need the owner's yes), cloudflared, failover decision, a test with real data under load.

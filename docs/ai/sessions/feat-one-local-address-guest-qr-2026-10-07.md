## 2026-10-07 — Phones & headsets: the place address as a QR code on the local home

- The guest path of the one local address (docs/ai/one-local-address.md §5, D). Devices without di get
  ONE https address, read from the certificate this machine serves, shown as a QR code. Never mDNS `.local`.
- Server: `GET /serverXR/api/guest-address` (`serverXR/src/guestAddress.js`, local runtimes only). States
  `ready` / `not-on-network` / `no-certificate` / `wildcard`. The name is the CN, else the first DNS name
  (the same rule as `di up --lan`'s dns hook); the port is the listen port; `--lan` is the bind; where the
  name points is looked up on this machine, cached 30 s. Catalogue entry in `catalogue/entries/platform.js`.
- Client: a **Phones & headsets** door in the local home's bar (`/#join` opens it):
  `src/landing/GuestAddressPanel.jsx`, `src/components/QrCode.jsx`, `src/utils/qrCode.js`. The code is
  drawn only for `ready` with a name that does not point elsewhere. Every other state names the setting
  (`~/.di/tls/cert.pem`) or the command (`di up --lan`). Says when auth is off (`di up --lan --guests`).
- QR library: `uqr` 0.1.3 pinned (MIT, zero deps, Nayuki port). `jsqr` 1.4.0 is dev-only, as the
  decoder in tests. Why: `docs/ai/dependency-decisions.md`.
- Tests: unit (QR decoded back by jsQR; a mutation that corrupts modules fails it), server unit + a real-server
  contract (no cert → no address; self-signed cert → its name and port), page tests in jsdom (no WebGL).
  The screenshot run decoded the QR from the rendered page's pixels, desktop DPR 2 and phone 390×844 DPR 3.
- Measured on aylmo, read-only, with its real certificate: `https://local.thedi.studio/`. The name resolves
  to 127.0.0.1 there today (the hook's loopback setting for a start without `--lan`).
- Owed: scan with a real phone (padlock, camera, WebXR on the Quest); `/<space>` in the code; Light's phone
  panel on the same address and the same encoder (it still shows `http://<raw IP>`); a per-place name and
  certificate; the place router's DNS (rebind protection).

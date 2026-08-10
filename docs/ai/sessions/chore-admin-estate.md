## 2026-08-10 — the estate map, inside /admin, without leaking it

- **New diagnostics section: `/admin` → Estate.** Renders the studio's infrastructure
  map — tailnet topology, every machine and what it is for, what runs where, the
  totals. It is observation only, so it sits in diagnostics rather than admin.
- **The map is never in this repo.** `dob-0/di.iiii` is public and the map is
  infrastructure topology: the VPS public IP, tailnet addresses, hostnames, where the
  backups live. It is authored in the private `di-atlas` and reaches the host out of
  band. `serverXR` reads it from `ESTATE_MAP_PATH` behind `requireAdminAlways` and
  hands it back as JSON; nothing is committed here and nothing goes in `public/`.
- **Framed with `sandbox=""` — every allow- token off**, scripts included. The map is
  pure HTML/CSS/SVG with no `<script>` and no inline handlers, so nothing is lost, and
  a future edit that adds script fails to run rather than quietly gaining the admin
  page's origin. There is a test for the sandbox attribute, because that is the line
  that matters.
- **Framed dark on purpose.** The map is theme-aware and would otherwise follow the
  *viewer's OS*, putting a white page inside a console that has no light mode.
  `asDarkDocument()` wraps it with `data-theme="dark"`.
- Three states are distinguished rather than collapsed into "error": no path
  configured, path configured but no file on this host (both ordinary), and a real
  failure. Source name, mtime and size are shown above the frame so a stale copy is
  visible instead of believed.
- Verified by looking: signed in as admin against a local serverXR with
  `ESTATE_MAP_PATH` set, desktop 1440×900 @2 and phone 390×844 @3. The 401-without-
  session and 200-with-session path was exercised end to end, not assumed.

**Still open:** the map has to be placed on staging and production hosts and
`ESTATE_MAP_PATH` set there — until then the section correctly says the host has no
map. A sync step from `di-atlas` at deploy time does not exist yet.

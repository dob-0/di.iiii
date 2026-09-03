## 2026-09-03 — a short door onto the map lane

The owner: *"i want short link or it would better map.di-studio.xyz and
light.di-studio.xyz, desk.di-studio.xyz audit that all and fix all link plz"*,
then, on what "desk" meant and why: *"give all to use … keep our data … we have
public and private info so keep how needed what needed … what we create as tool
it need to be on hand."*

Three different answers, because the three tools are not in the same state:

- **`map.di-studio.xyz` — built here.** The map lane is already hosted on prod
  and already sits behind `ProtectedSurface` (per-space sign-in), so a second
  hostname adds a name, not a hole. `Caddyfile` gains a `{$MAP_DOMAIN}` block
  reverse-proxying to the SAME `client:8080` as `{$SITE_DOMAIN}` — not a second
  app, the identical one under a shorter name. `docker-compose.yml` wires the
  var with the same inert-until-set default pattern `STAGING_DOMAIN` uses.
  Two things still need the owner's hand: the DNS record (no registrar access
  from this machine) and setting `MAP_DOMAIN` in prod's `.env`.
- **`light.di-studio.xyz` — not a link problem.** The lighting desk has no
  hosted implementation at all; a hosted di-studio.xyz says so rather than
  going quiet, by design (`docs/architecture/LIGHTING_DESK_DESIGN.md`, real
  ArtNet/DMX hardware access). A subdomain would proxy to the same "no desk
  here" page. Making it real is a tunnel-a-machine-with-hardware-access
  project, and a lighting rig facing the public internet is its own decision,
  not a DNS edit.
- **`desk.di-studio.xyz` — asked and answered "I meant something else."** The
  literal reading (di.desk, the coordination workspace this session runs
  inside) is local-only with zero auth by deliberate design — every framed
  tier and every agent's chat, unguarded. Asked the owner directly rather than
  guess; he confirmed that is not what he meant, without saying what he did.
  Left open, not built.

**One real limitation of `map.di-studio.xyz`, written down rather than found
later:** the session cookie is host-only (no `Domain` attribute), so signing in
on `di-studio.xyz` does not carry over to `map.di-studio.xyz` — separate
sign-ins per hostname. That is consistent with "public and private stay how
they are" (nothing shared that shouldn't be), but it is not "one session
everywhere," and making it that would mean a shared-domain cookie readable by
every subdomain added later — a real tradeoff, not made here.

Not started this session: the "audit all links, audit UX/UI, make it simple"
half of the ask — the machine this session runs on goes offline within the
hour (unrelated shutdown notice), so the infra half was finished and the audit
was left for whichever session picks this up next.

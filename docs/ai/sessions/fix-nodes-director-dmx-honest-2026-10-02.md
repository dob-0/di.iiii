## 2026-10-02 — Nodes: Director and DMX Out say what is not available on this server

- Source: nodecheck report 2026-10-02 (breakages 3 and 4); owner, ledger row 131: "yes we need full check and fix gaps".
- Director (view.director): the window used the piece's own space (algovrithm) without asking whether the server has it, so a fresh server answered 404 (console error) and the note read "the only piece registered so far". It now reads /api/spaces first, makes no settings request for a missing space, and says the server has no such space.
- DMX Out (device.dmx.out): an unreachable /light/api/summary now reads "The lighting desk is not running on this machine - start di.iiii (di up) ..." (start method from docs/architecture/LIGHTING_DESK.md); a JSON answer without a numeric `fixtures` no longer reads as a running desk with 0 fixtures. Window default height 260 -> 330 so the sentence and link are not clipped.
- Owed: the browser itself logs "Failed to load resource" when /light/api/summary is truly unreachable; only a server-side fix would silence that. On a phone the opened window's title sits under the top bar (existing cosmetic item 7 in the report).

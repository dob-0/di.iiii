## 2026-10-02 — Nodes "look broken": measured audit and eight fixes (stacked on #730)

- The owner: "fix all bugs, deep audit, no wires, nodes look so broken". Measured on the RTX 3080 at 2560×1340
  DPR 1 and 390×844 DPR 3. The full report is `docs/raw/2026-10-02-nodes-broken-audit.md`.
- Fixed: cards hiding under the next card (`settleCardStacks`, 53 → 0 overlaps); Number → Vector at the link; a
  wire is marked first and removed on purpose; empty preview boxes say what they wait for; on a phone only the
  front window mounts and the door shows only on the selected card; Image says when its wired source is empty.
- Left as they are, with reasons in the report: backward wire S-loops, 10 px port labels (contrast passes,
  the zoom is #729), window placement on create (already avoids cards).
- Split with dob-39 (#729, plan A–E): fit on open, card content, docked List/Text, row menu, no ids on screen.

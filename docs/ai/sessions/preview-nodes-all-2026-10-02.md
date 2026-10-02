## 2026-10-02 — Preview only: #731 (on #730) combined with #729, to show the owner NOPA with every Nodes fix

- Not for landing. It exists so the owner could see his NOPA project (a copy) with both sessions' fixes at once,
  on a local-only stack.
- Three small conflicts, resolved here the way whichever PR lands second should resolve them. The Windows menu
  opens in front and names the type. The cardGeometry imports are the union. The List wiki entry keeps both
  sentences.
- One real interaction: #729's `nodeCardLines` test assumed a List has no ports, but #730 gave it Rows and
  Count. The preview's test now expects two port rows above the content.

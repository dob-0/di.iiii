## 2026-08-25 — dead CSS removed, 205 lines verified selector by selector

The suite audit flagged ~1,050 dead lines. I deleted only what I verified
myself, selector by selector:

- `src/styles/layout-stack.css` — the whole file. All three selectors
  (`.panel-container`, `.panel-dock-left`, `.panel-dock-bottom`) have zero
  references in any jsx/js. Its `@import` is gone from `src/style.css`.
- The seven `--mobile-shell-*` tokens — zero `var()` reads repo-wide.
- The `.toolbar-*` family in `controls.css` — 14 selectors plus their
  pseudo-state, compound and media-query rules, and `.editor-toolbar-primary`.
  Every one checked individually: zero references.

Verified after: build clean, brace balance holds (controls 37/37,
mobile-shell 10/10), style guard tests pass, and landing/wiki/privacy render
identically with no CSS console errors.

The rest of the audit's dead list is left alone — it over-counts where BEM
modifiers are template-composed, and I only remove what I can prove.

## 2026-11-24 — a model's Colour now shows (Tint the model), and a scaled model keeps its bottom on the floor

- The model Colour was saved but hard-wired off in both render paths. It is now a tint (the colour multiplies the model's own material, texture kept), opt-in per model with `components.appearance.tint`, switched in Appearance as "Tint the model".
- Scaling a model in the inspector or with the Scale tool keeps its bottom where it was (`src/studio/utils/keepModelBottom.js`); nothing moves on load.
- Wiki (Studio editor basics) and known-fixes updated; tests beside each change.

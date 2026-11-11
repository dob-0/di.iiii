## 2026-11-11 — Show loops: a seamless shader loop renderer with checks, and words clips with a font and colour per mark (owner N3705, N3716)

- `scripts/show/loops/render-loops.mjs` renders seamless loops from fragment shaders, driven by a spec; `check-loops.py` checks the rendered loops. A `--stills` mode renders single frames, for a look check before a full render.
- `scripts/show/words-clip.sh` takes an optional font per mark (8th field), can draw a poster offset line and takes a colour per mark; `words-clip.test.mjs` covers it. The owner liked the name font made this way (N3715).
- The looks made with these shaders were shown to the owner and rejected as too childish (N3726). The renderer and the checks stay as tools; the shaders stay as examples, not as show content. The wall looks are being redone by another method, outside this branch.
- Not done: no wiki entry for the loop tools; the renderer has run on one machine only.

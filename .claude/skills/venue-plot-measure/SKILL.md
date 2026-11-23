---
name: venue-plot-measure
description: A venue sends a light plot as a PDF or a picture and a size must be read from it (an LED wall, a riser, a truss) — measure the drawn rectangle against the plot's own grid in squares, metres, LED cabinets and pixels. Script scripts/place/plot_grid_measure.py. Use whenever a plot arrives and someone asks "how big is it".
---

# venue-plot-measure

Thin entry point. The recipe is the section "Measure a drawn rectangle against the plot's own grid" in `scripts/place/README.md`; the command is `scripts/place/plot_grid_measure.py` (python3 with numpy and Pillow, poppler for a PDF; with nothing installed: `uv run --with numpy --with pillow python -I …`). Words: `docs/ai/vocabulary.md`.

1. Name the drawing: a PNG/JPG, or the PDF itself (`--dpi 300 --page 1`).
2. Find the rough outline by eye in an image viewer, in raster pixels: `--near LEFT,TOP,RIGHT,BOTTOM`.
3. Run `python3 -I scripts/place/plot_grid_measure.py plan.png --near 150,150,550,400 --grid-m 1 --cabinet-m 0.5 --cabinet-px 128 --picture out.png` with what you know of the drawing.
4. Read the lines (`grid`, `outline`, `edges on grid lines`, `cue`, `LED`, the claim) and look at the picture.

Two cautions, said in the answer every time:
- The scale (`--grid-m`) is the user's claim, not a measurement; the tool says so on its last line.
- A size read from a drawing is a reading, not a confirmed size: ask the maker of the wall to confirm it.

Limit: only thin dark outlines are read (not a filled rectangle, not a coloured outline); the tool fails with one `FAIL:` line then.

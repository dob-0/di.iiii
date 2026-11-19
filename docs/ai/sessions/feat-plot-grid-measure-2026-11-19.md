## 2026-11-19 — plot_grid_measure.py: measure a drawn rectangle against the plot's own grid

- `scripts/place/plot_grid_measure.py` generalises a one-off script: it measures a rectangle on a light plot (PNG/JPG or PDF) in grid squares, metres and, for an LED wall, whole cabinets and pixels. Every number of one drawing became an argument (`--near`, `--grid-m`, `--cabinet-m`, `--cabinet-px`, `--cue`, `--dpi`).
- `scripts/place/plot-grid-measure.test.js` draws its own plot (grid, rectangle, magenta bar) and asserts pitch, squares, cabinets, metres, a cue, the FAIL cases, the picture size and the PDF path. It skips without python3 + numpy + Pillow.
- Compared once against the old script on one private real drawing: same pitch, outline, squares and LED line. Only that one drawing was compared.
- README section added to `scripts/place/README.md`. A size read from a drawing stays a reading, not a confirmed size.
- Round 2 (review of the PR): a bad `--picture` name and a cabinet size of zero or less are one FAIL line; a see-through PNG is laid on white; the LED line names the whole cabinet ratio; the test asks for numpy with `-I`; README names the uv route and the filled/coloured-outline limit; the examples use made-up numbers; new skill `venue-plot-measure`.

## 2026-10-13 — Studio navigation (#885) brought up to dev after the #888 batch

This branch is PR #885 (fix/studio-pan-after-zoom-2026-10-12, "Navigate moves like Sketchfab, Edit exactly like Blender")
merged with land/batch-2026-10-12 (#888) so it merges into dev without conflicts. No code of its own: the navigation work
and its measurements are in docs/ai/sessions/fix-studio-pan-after-zoom-2026-10-12.md. The merge had no textual conflicts.
Checked: vitest src/studio + src/project/viewport, 811 passed, 0 failed. Browser tests NOT run (heat gate).

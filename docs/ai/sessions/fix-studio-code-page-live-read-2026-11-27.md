## 2026-11-27 — Studio's code frame answers the read bridge too

- `StudioPresentationSurface` now wires `createCodePageReadBridge` to its srcDoc code frame (same as `PublicProjectViewer` and `PresentationCanvas`). The owner opened the Reika main stage page at `/reika/projects/reika-show-summary` (Studio) and its live tiles stayed "–".
- Test: `StudioPresentationSurface.test.jsx` "answers a code page read from its own frame through the read bridge".
- Not checked live in a signed-in Studio (test browser has no sign-in); checked after install on the owner's own tab.
- The bridge's trimmed state now carries each light's plan place (x, y), so the Reika page draws the rig as the desk's minimap (owner 2026-11-27: "look to minimap and build with that").

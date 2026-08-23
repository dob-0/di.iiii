## 2026-08-23 — the one card with nothing in it was the room the product points at

- From the walkthrough audit: on `/spaces` every public space showed a live thumbnail except the
  **Open Space**, which showed an empty rectangle under a LIVE badge. It is the first card a
  visitor sees.
- The call site gated on `space.isPublic && space.publishedProjectId`. But `SpaceCardPreview`
  embeds the **space's** own live route — `buildAppSpacePath(spaceId)?preview=1` — so it never
  needed a project at all. `open` has no published project because it *is* the communal scene
  rather than a link to one, and `/open?preview=1` renders it fine (checked directly).
- Every other public space happens to have a project linked, so the extra condition looked
  correct on every card except the one it broke.
- Gate is now `space.isPublic` alone. Private spaces still get no preview — the condition that
  actually matters is untouched.

### Two corrections to the audit that produced this

- I reported "`main` / `azd` / `platform-recordar` show as LIVE with **black thumbnails**". They
  do not. I screenshotted before the preview iframes finished booting — the boot queue allows
  two at a time and they are lazy behind an IntersectionObserver. With a real wait, every one of
  them renders. The only genuinely empty card was `open`.
- I also reported the Guest Sandbox tile as **dead**. It is not: it opens the sandbox space hub,
  which carries Projects, Nodes, New project, Import and View live. What is true is weaker — it
  is the only card with no thumbnail, no address and no button, so it *reads* inert beside the
  others.

### Worth knowing

- **This fix cannot be verified on a local box.** A space's scene arrives over realtime, which
  the vite dev proxy does not forward, so the card renders black locally even when pointed at
  staging's API. Verified on staging after merge instead — the fix is one condition and the
  component is the same one nine other cards already use.

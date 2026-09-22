## 2026-09-23 — first-room traps: Headset Off means off, no admin chord for strangers, F frames the room, "+ new project" says why

Wave 2 items 2, 3 and 4 of `di-atlas/decisions/2026-09-23-connect-everything.md`.

- **Headset entry → Off** in the Nodes Publish panel wrote `'none'`, which the viewer
  reads as AR, so Off left Enter AR on the live page. Off now writes `'off'`; a missing or
  `'none'` value shows as AR, the way the viewer treats it. Only the writer changed. The viewer
  and the schema default stay as they were, because `'none'` means AR for every older project.
- **Admin mode** in the old editor (Shift+D Shift+I, or a 4-finger 3-second hold) now turns
  on only for a signed-in admin session (`useAuthSession`, the same role the admin console
  gates on). Turning it off never needs anything. The owner at a local install and auth-off
  both report role `admin`, so they keep the chord.
- **Studio F** with nothing selected now frames the whole room. An early return had made
  that branch unreachable. With a selection, F still frames just the selection.
- **Tools "+ new project"** now says why it failed, in the dialog's own sentence: the
  server's words, or "sign in to add a project to <space>." for a bare 401.
- Each has a test beside it, seen failing on the old code, and a known-fixes row.

Checked on a throwaway stack (4360/5360, data root outside the repo), 1440×900 DPR 2 and
390×844 DPR 3, with a control run of the same walk on the unfixed file for A, B and F:
- Off stores `"off"`, and the live link in a WebXR-capable browser shows no Enter AR.
  Switching back to AR brings it back. On old code: `"none"`, and Enter AR stays.
- Signed out on a read-only space, a paste is still refused after the chord (old code:
  the chord unlocked it). On the phone, the More sheet shows no Admin section after the hold
  (old code: Publish to Server and the rest). As admin, both still work.
- Alt+A then F: all three boxes framed (old code: the camera did not move). A box selected, then F: that box.
- A guest in a read-only space gets "Not created: Space is read-only.", and signed out the
  dialog says "Not created: sign in to add a project to traps-ro.", on desktop and phone.

**Not done: "Save current view wins over the auto-frame."** Stopped on purpose.
`resolveViewerCamera` puts the auto-frame ahead of `worldState.savedView` deliberately
(commit 731222d0, and the comment above `computeAutoFrameCamera`): a saved view goes stale
mid-edit and strands a fresh visitor. And `normalizeWorldState` fills `savedView` with
defaults, so it is always "present". No reading of the document can tell a view someone
pressed Save on from the default or a stale one. The walk confirmed the trap: orbit below
the floor → Save current view → the stored view is that shot, but the live page opens on
the auto-frame. The fix needs his decision, and each option changes more than this PR
should:
(a) Save current view also sets `entryView: 'fixed-camera'` with an unlocked `fixedCamera`.
    The viewer already honours that shot and then hands the camera over. But Enter AR is
    offered only on `entryView === 'scene'`, so a saved view would also remove AR.
(b) A marker on the saved view (e.g. `savedView.setAt`) that the viewer prefers over the
    auto-frame. That is a schema change in both twins (`projectSchema.js` / `.cjs`).
- The wiki is not updated here (`wikiContent.js` belongs to another agent in this wave).
  The Studio help list (`studioGuide.js`) now says what F does.

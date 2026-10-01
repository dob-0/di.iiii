## 2026-10-01 — the show chip's recording light is square; the rectangle guard reads inline styles right

From the dev.diiii.xyz MOXIR audit (owner: "do the deep audit fix everything"): the SHOW chip's red light was a circle
(`borderRadius: '50%'`, RoomLookFollower.jsx:78), allowed by an exception in `controlsAreRectangles.test.js`. The owner's
rule is rectangles only, no circles (memory feedback_no_round_ui), so the light is square and the exception is gone.
The guard also misread inline styles: its value ran to the end of the line ("0, background: …"), so a correct `0` failed
and only the exception had kept the file green; the value now ends at a comma. Guard: 4 pass, and it fails on dev's
round dot ("border-radius 50%").

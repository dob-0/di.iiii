# fix/show-tab-root-2026-11-26

## 2026-11-26 — Show tab from the root desks

Owner N6923 (picture of diiii.localhost/show/ "We could not find show"): the Light and Laser desks at /light/ and /laser/ sent their Show tab to /show/, which is a space address.
Fix: the Show desk is also mounted at /serverXR/show (never a bare /show, so a space named show stays free); the tab points there when the desk is at a root alias.
Checked headless: /light/, /laser/, /serverXR/light/ Show tab -> /serverXR/show/ (200, "Show desk").

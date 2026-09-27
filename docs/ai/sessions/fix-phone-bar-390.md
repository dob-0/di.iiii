## 2026-09-27 — the bar fits a phone: what does not fit goes behind More

- Reproduced on a local stack, signed in, 390x844 DPR3: a new project's bar was 430px in 390, WIKI cut at
  the edge; the phone rule scrolled it sideways with the scrollbar hidden.
- Priority+ on the bar: names that fit show in order, the rest under More (menu on document.body, 44px rows,
  closes on choice / outside tap / Escape / resize; More lit when you stand inside it). Desktop unchanged.
- Seen: phone bare 390/390, phone all tools 390/390, desktop 1440 all seven. Wiki "The bar" updated.
- Guard: 6 new cases in `SurfaceBar.test.jsx`, all red on the old bar. Known-fixes row added.
- Seen on the way, not fixed here: the bar's own links are 27px tall on a phone (under 44); the new-project
  name box squeezes "SPACE: MAIN SPACE" onto two lines at 390.

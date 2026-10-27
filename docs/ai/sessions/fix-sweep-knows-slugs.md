# fix/sweep-knows-slugs

## The space sweep judges short names, files and view routes right (N1290)

- 2026-10-26 whole check, area 1 (14 public spaces on dev, 212 pages): 678 links flagged, 677 of them wrong. The sweep
  knew project ids only (/network/gevorg-grigoryan is network-gevorg-grigoryan's short name: 668), judged real files as
  spaces or projects (/suite/mark.svg, /wcc/artist-works-land/index.html) and the /<space>/studio and /<work>/scene views.
- Fix: a project is known by id and slug; a path ending in a file extension is judged by its HTTP answer alone;
  studio, show and scene are views, not projects.
- Re-swept on dev with this copy: network 68 pages, 1012 links, 0 broken; open 41/0; wcc 49 + /wcc/scene (route, fixed
  after); di-iiii 41 + 1 real (/main, the space's old id).

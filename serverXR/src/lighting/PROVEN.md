# Light — what is proven, and where

One row per feature. A feature is **proven** when its automated gate passed AND it was looked at once on a named device.
`tools/proven.js` reads this table: for each row it runs `git diff --quiet <proven commit>..HEAD -- <files watched>`.
Nothing changed → "proven, untouched", the gate is skipped. Something changed → the gate runs again and the look is owed again.

```
node serverXR/src/lighting/tools/proven.js            # list every row: untouched / changed / owed
node serverXR/src/lighting/tools/proven.js --run      # re-run the gate of every changed row only
```

Method: change-based test selection (Google, "Taming Google-scale continuous testing", 2017; Fowler, "Test Impact Analysis").
A row is added or its commit moved ONLY by the person or agent who ran the gate and saw the look, with the evidence link.
Format: cells split by ` | `; "files watched" are git pathspecs from the repo root, space separated; `-` = no commit yet (owed).

| feature | gate | look (device · page) | proven | by | files watched | evidence |
|---|---|---|---|---|---|---|
| desk core | `node serverXR/src/lighting/tests/test.js` | MOXIR hall rig · `/light` | 2026-10-17 30602ebb522085be8109c490def560e20bbb9ff4 | MOXIR night, 17 Oct | serverXR/src/lighting :(exclude)serverXR/src/lighting/PROVEN.md :(exclude)serverXR/src/lighting/tools :(exclude)serverXR/src/lighting/lighting.test.js | docs/moxir/MOXIR.md; docs/moxir/devices/audit-loop.md |
| laser | `npx vitest run src/laser` (cwd serverXR) | LaserCube on the MOXIR rig · Laser Out | 2026-10-17 aa7988e3a5ed7748ddb77f18ca58fd310f745f2a | MOXIR night, 17 Oct | serverXR/src/laser | docs/moxir/devices/lasercube.md; docs/moxir/devices/laser-swap-2026-10-17.json |

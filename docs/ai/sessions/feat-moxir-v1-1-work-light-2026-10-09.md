## MOXIR v1.1 work light + 26 looks (looks layer, scratch, 2026-10-09)

Owner: "I don't like the lights - we can't see anything and can't work; I need more scenes."
Layer apart from the v1.1 build: `scripts/place/moxir_worklight.py` writes `scripts/place/rigs/moxir-looks-v1-1-worklight-2026-10-09.json` (ambient 0.6, one `floor` key, 26 looks, 28 cues, WORK first). `scripts/rigbuild/worklight-looks.mjs` puts it on scratch `moxir-v1-1-looks` (never moxir-v1-1). Levels ASSUMED, not yet seen by eye (the shared test-browser lock was stuck). Owed: the eye check, then the fold-in.

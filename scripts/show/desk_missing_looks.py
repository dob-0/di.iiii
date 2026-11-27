#!/usr/bin/env python3
"""desk_missing_looks.py: which looks of an older desk copy are gone from the desk now, and was each one removed on purpose?
Lesson N7279.3 (2026-11-27, dob-7a): a "16 looks lost" finding went to the lead before the removal record was read; all 16
had been removed on the owner's word. This audit reads the records itself before anything is called lost.
Usage: desk_missing_looks.py OLD_SHOW.json NOW_SHOW.json [RECORD ...]
  RECORD: a removal archive (.json with a looks list, e.g. live-v4/removed-*.json) or a text record (a handover .md, or the owner's ledger ~/work/OWNER_REQUESTS_2026-09-30.md), where a
  line counts when it names the look (id, name, or name without its number) and says remov/delet/archiv.
Proof run 2026-11-27 06:42 (time from the chat log): base-now vs the desk, with the 22:20 archive + the ledger: 16 gone, 16 with a record.
Read-only. Exit 0 = every missing look has a record; 1 = some have none (ask the lead before calling them lost); 2 = usage."""
import json, os, re, sys
if len(sys.argv) < 3: print(__doc__); sys.exit(2)
def looks(p):
    d = json.load(open(p)); d = d.get('show', d) if isinstance(d, dict) else d
    return d['looks'] if isinstance(d, dict) else d
old, now = looks(sys.argv[1]), looks(sys.argv[2])
have = {l['id'] for l in now}
gone = [l for l in old if l['id'] not in have]
arch, text = {}, []
for p in sys.argv[3:]:
    if p.endswith('.json'):
        for l in looks(p): arch.setdefault(l['id'], os.path.basename(p))
    else:
        text += [(os.path.basename(p), i + 1, s.lower()) for i, s in enumerate(open(p, errors='replace'))]
none = 0
for l in gone:
    name = l.get('name', '')
    if l['id'] in arch: print(f"{l['id']} ({name}): removed on purpose, in archive {arch[l['id']]}"); continue
    cands = {c.lower() for c in (l['id'], name, re.sub(r'^\d+\s+', '', name)) if len(c) >= 5}
    hit = next(((f, n) for f, n, s in text if re.search(r'remov|delet|archiv', s) and any(c in s for c in cands)), None)
    if hit: print(f"{l['id']} ({name}): removed on purpose, record {hit[0]}:{hit[1]}"); continue
    none += 1; print(f"{l['id']} ({name}): NO RECORD found")
print(f"{len(gone)} looks of the old copy are not on the desk now: {len(gone) - none} have a removal record, {none} have none"
      + (" (ask the lead before calling them lost)" if none else ""))
sys.exit(1 if none else 0)

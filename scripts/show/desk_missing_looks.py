#!/usr/bin/env python3
"""desk_missing_looks.py: which looks of an older desk copy are gone from the desk now, and is each one on a removal record?
Lesson N7279.3 (2026-11-27, dob-7a): a "16 looks lost" finding went to the lead before the removal record was read; all 16
had been removed on the owner's word. This audit reads the records itself before anything is called lost.
Usage: desk_missing_looks.py OLD_SHOW.json NOW_SHOW.json [RECORD ...]
  RECORD: a removal archive (.json with a looks list, e.g. live-v4/removed-*.json) = a structured record; or a text record
  (a handover .md, or the owner's ledger ~/work/OWNER_REQUESTS_2026-09-30.md). A text line is only a CANDIDATE for a person:
  it must name the look (id, name, or name without its number) as a whole word, case-insensitive (names under 5 letters never
  match) and hold a whole word from: removed, deleted, archived. The tool prints file, line number and the line (cut to 160
  chars) under "named on a text line, read it"; a person decides.
Exit codes: 0 every missing look has a structured (JSON archive) record; 3 the rest are only text candidates, to be read;
  1 any look has no record at all (1 wins over 3); 2 usage or a bad or unreadable input (one line, no traceback).
Proof run 2026-11-27 06:42 (time from the chat log), old rule: base-now vs the desk, the 22:20 archive + the ledger: 16 gone, 16 with a record.
Read-only."""
import json, os, re, sys

REMOVAL = re.compile(r'(?<!\w)(removed|deleted|archived)(?!\w)', re.I)
MAX_HITS = 3


def fail(msg):
    print(f"desk_missing_looks: {msg}", file=sys.stderr)
    sys.exit(2)


def looks(p):
    try:
        with open(p) as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        fail(f"cannot read {p} as JSON ({type(e).__name__})")
    if isinstance(d, dict) and isinstance(d.get('show'), dict):
        d = d['show']
    ls = d.get('looks') if isinstance(d, dict) else d
    if not isinstance(ls, list) or not all(isinstance(l, dict) and isinstance(l.get('id'), str) for l in ls):
        fail(f"{p} has no looks list of objects with an id")
    return ls


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    old, now = looks(argv[1]), looks(argv[2])
    have = {l['id'] for l in now}
    gone = [l for l in old if l['id'] not in have]
    arch, text = {}, []
    for p in argv[3:]:
        if p.endswith('.json'):
            for l in looks(p):
                arch.setdefault(l['id'], os.path.basename(p))
        else:
            try:
                with open(p, errors='replace') as f:
                    text += [(os.path.basename(p), i + 1, s.strip()) for i, s in enumerate(f)]
            except OSError as e:
                fail(f"cannot read {p} ({type(e).__name__})")
    structured = candidates = none = 0
    for l in gone:
        name = l.get('name') or ''
        if not isinstance(name, str):
            name = ''
        if l['id'] in arch:
            structured += 1
            print(f"{l['id']} ({name}): removed on purpose, in archive {arch[l['id']]}")
            continue
        cands = {c for c in (l['id'], name, re.sub(r'^\d+\s+', '', name)) if len(c) >= 5}
        pats = [re.compile(r'(?<!\w)' + re.escape(c) + r'(?!\w)', re.I) for c in cands]
        hits = [(f, n, s) for f, n, s in text if REMOVAL.search(s) and any(p.search(s) for p in pats)]
        if hits:
            candidates += 1
            print(f"{l['id']} ({name}): named on a text line, read it:")
            for f, n, s in hits[:MAX_HITS]:
                print(f"    {f}:{n}: {s[:160]}")
            continue
        none += 1
        print(f"{l['id']} ({name}): NO RECORD found")
    print(f"{len(gone)} looks of the old copy are not on the desk now: {structured} have an archive record, "
          f"{candidates} are only named on a text line (read it), {none} have no record"
          + (" (ask the lead before calling them lost)" if none else ""))
    return 1 if none else (3 if candidates else 0)


sys.exit(main(sys.argv))

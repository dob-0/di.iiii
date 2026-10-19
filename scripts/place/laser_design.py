#!/usr/bin/env python3
"""laser_design.py — write a per-scene LaserCube design into a scenes file's `laser` field. Lamp parts untouched.
Step 5 of the venue-to-show skill (docs/ai/skills/venue-to-show.md): the laser design per scene, before laser_frames.py compiles it.

    python3 -I scripts/place/laser_design.py --scenes S.json --design D.json [--apply]   # dry run prints the counts
    python3 -I scripts/place/laser_design.py --scenes S.json --clear [--apply]           # remove every `laser`

D.json = {"design": {<scene id>: <laser object or null>, ...}} — the laser object is the schema of laser_frames.py (validate_laser);
every design is validated with it before anything is written. A scene id not in S.json is an error; a scene without a design gets null.
--apply writes S.json in place with a `.pre-laser.json` backup beside it. Undo: copy the backup back, or --clear.
Example design data: scripts/place/rigs/moxir-laser-design-2026-10-15.json (an instance, not a default).
Pattern names follow beam-show practice (Pangolin BEYOND effect names, ILDA beam-show vocabulary)."""
import argparse, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from laser_frames import validate_laser


def apply_design(doc, design):
    """Set scene['laser'] from design; returns (errors, count). Pure: edits doc in place only when there are no errors."""
    ids = {s['id'] for s in doc['scenes']}
    errors = [f'unknown scene: {k}' for k in sorted(set(design) - ids)]
    for k, v in design.items():
        errors += validate_laser(v, k)
    if errors:
        return errors, 0
    for s in doc['scenes']:
        s['laser'] = design.get(s['id'])
    return [], sum(1 for s in doc['scenes'] if s.get('laser'))


def main(argv=None):
    ap = argparse.ArgumentParser(description='Write a per-scene laser design into a scenes file (see the module doc).')
    ap.add_argument('--scenes', required=True)
    ap.add_argument('--design')
    ap.add_argument('--clear', action='store_true')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args(argv)
    if bool(a.design) == a.clear:
        ap.error('give exactly one of --design FILE or --clear')
    doc = json.load(open(a.scenes, encoding='utf-8'))
    if a.clear:
        for s in doc['scenes']:
            s.pop('laser', None)
        n = 0
    else:
        errors, n = apply_design(doc, json.load(open(a.design, encoding='utf-8'))['design'])
        if errors:
            sys.exit('\n'.join(errors))
    print(f"{n} of {len(doc['scenes'])} scenes carry a laser design" + ('' if a.apply else ' (dry run, nothing written)'))
    if a.apply:
        shutil.copyfile(a.scenes, a.scenes.replace('.json', '.pre-laser.json'))
        json.dump(doc, open(a.scenes, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main()

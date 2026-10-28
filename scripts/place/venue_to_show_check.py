#!/usr/bin/env python3
"""venue_to_show_check.py - does a show project carry every step's artefact of the venue-to-show process? (2026-10-15)

The process is docs/ai/skills/venue-to-show.md: venue measure -> hall model -> rig -> looks -> cues -> laser frames ->
light environment -> the standard look -> views -> shown. Each step leaves something in the project document; this reads the
document (read-only, never writes) and prints, per step, OK / MISSING / OWED with the number it found, so a fresh agent sees
at once which step to run next instead of re-deriving the state. Generic: no production name.

    python3 -I scripts/place/venue_to_show_check.py --doc <saved document.json>
    python3 -I scripts/place/venue_to_show_check.py --api http://127.0.0.1:4337/serverXR --project <project id> \
        [--off-dmx <type,type>] [--json out.json]

Exit 0 = every step present, 1 = a step MISSING, 2 = the document could not be read. OWED = the platform cannot hold that
artefact in the document yet (named with its ledger row); it never fails the check.
"""
import argparse, json, sys, urllib.request

STANDARD_LOOK_ROW = 'N808/N810'  # the Studio's lines of light as THE look of the room page: not a document field yet


def load(a):
    if a.doc:
        raw = json.load(open(a.doc))
    else:
        raw = json.load(urllib.request.urlopen(f'{a.api.rstrip("/")}/api/projects/{a.project}/document', timeout=30))
    return raw.get('document', raw) if isinstance(raw, dict) else raw


def comp(e, k):
    return (e.get('components') or {}).get(k)


def has(e, k):
    return k in (e.get('components') or {})


def check(doc, off_dmx=()):
    off = {t.lower() for t in off_dmx}
    ents = doc.get('entities') or []
    out = []
    add = lambda step, ok, found, fix, state=None: out.append({'step': step, 'state': state or ('OK' if ok else 'MISSING'), 'found': found, 'next': '' if ok else fix})

    # 1-2. hall model: a model entity that points at a hall asset (import.mjs / swap-hall.mjs)
    hall_ids = {a.get('id') for a in doc.get('assets') or [] if 'hall' in str(a.get('name', '')).lower()}
    halls = [e for e in ents if e.get('type') == 'model' and any(h and h in json.dumps(e.get('components') or {}) for h in hall_ids)]
    add('hall model', bool(halls), f'{len(halls)} hall model(s), {len(hall_ids)} hall asset(s)',
        'hall.py -> import.mjs --replace (or swap-hall.mjs) into the project')

    # 3. rig: fixtures, patched, venue plan, rental list
    fx = [e for e in ents if comp(e, 'fixture')]
    on_dmx = [e for e in fx if str(comp(e, 'fixture').get('type', '')).lower() not in off]
    patched = [e for e in on_dmx if comp(e, 'fixture').get('universe') not in (None, '') and comp(e, 'fixture').get('address') not in (None, '', 0)]
    loose = sorted({str(comp(e, 'fixture').get('type')) for e in on_dmx if e not in patched})
    plan = [e for e in ents if has(e, 'venuePlan')]
    rental = [e for e in ents if has(e, 'rentalList')]
    add('rig (units)', bool(fx), f'{len(fx)} fixture units', 'the rig file -> epic-build.mjs --rig <file> (first build only: default mode re-creates every unit)')
    add('rig (patch)', bool(fx) and len(patched) == len(on_dmx), f'{len(patched)}/{len(on_dmx)} DMX units patched (universe + address)'
        + (f', {len(fx) - len(on_dmx)} off DMX by --off-dmx' if off else '') + (f'; unpatched types: {", ".join(loose)}' if loose else ''),
        'patch-plan.mjs / the cards page patch bars; a type that is not on DMX at all (network laser, hazer by hand) goes in --off-dmx')
    add('rig (venue plan + rental list)', bool(plan) and bool(rental), f'venuePlan {len(plan)}, rentalList {len(rental)}', 'load-plot.mjs (venuePlan) and rental.mjs (rentalList)')

    # 4. looks
    rl = next((comp(e, 'rigLooks') for e in ents if comp(e, 'rigLooks')), None) or {}
    looks = rl.get('looks') or []
    look_ids = {l.get('id') for l in looks}
    add('looks', bool(looks), f'{len(looks)} looks (source {rl.get("source") or "-"})', 'scenes_to_rig.py -> epic-build.mjs --rig <file> --looks-only --apply')

    # 5. cues: every cue's look resolves; the show clock is set
    ms = doc.get('mappingState') or {}
    cues = ms.get('cues') or []
    lit = [c for c in cues if c.get('lightLook')]
    dangling = [c.get('name') or c.get('id') for c in lit if str(c['lightLook']).removeprefix('rig-') not in look_ids and c['lightLook'] not in look_ids]
    add('cues', bool(lit) and not dangling, f'{len(cues)} cues, {len(lit)} with a look, {len(dangling)} pointing at no look' + (f' ({", ".join(map(str, dangling[:3]))})' if dangling else ''),
        'epic-build.mjs --looks-only --apply writes the cue list from the looks')
    epoch = ms.get('showEpoch') or (doc.get('showState') or {}).get('clockEpoch')
    add('show clock', bool(epoch) and bool(ms.get('loop')), f'showEpoch {epoch or "-"}, loop {bool(ms.get("loop"))}', 'epic-build.mjs --looks-only --apply (sets loop + showEpoch)')

    # 6. physics: every drawn beam carries a computed length (its first surface); physics_check.py is the full test
    beams = [e for e in ents if comp(e, 'beam') and comp(e, 'beam').get('visible', True)]
    unmeasured = [e for e in beams if not isinstance(comp(e, 'beam').get('length'), (int, float)) and not comp(e, 'beam').get('laser')]
    add('beam reach (physics)', not unmeasured, f'{len(beams) - len(unmeasured)}/{len(beams)} beams with a computed length',
        'epic-build.mjs --hall <hall record> (beam.length = first hit), then physics_check.py: 0 leaks')

    # 7. laser frames: every laser line of a cube carries its per-scene frames
    lasers = [e for e in beams if comp(e, 'beam').get('laser')]
    framed = [e for e in lasers if (comp(e, 'beam')['laser'] or {}).get('frames')]
    add('laser frames', len(framed) == len(lasers), f'{len(framed)}/{len(lasers)} laser lines with frames' if lasers else 'no laser lines (step skipped)',
        'laser_frames.py --scenes --rig --hall --out -> epic-build.mjs --rig <out> --laser-frames --apply')

    # 8. light environment: air, exposure, fog
    rs = doc.get('renderSettings') or {}
    atm = rs.get('atmosphere') or {}
    fog = (doc.get('worldState') or {}).get('fog') or {}
    add('light environment', bool(atm.get('scattering')) and rs.get('exposure') is not None,
        f'scattering {atm.get("scattering")}, exposure {json.dumps(rs.get("exposure"))}, toneMappingExposure {rs.get("toneMappingExposure")}, fog far {fog.get("far")}',
        'apply_light_env.mjs --project <id> --from-project <the picked one> --apply')

    # 9. the standard look: bloom on is what the document can hold; the lines of light are code, not data (yet)
    add('standard look (bloom)', bool((rs.get('bloom') or {}).get('enabled')), f'bloom {json.dumps(rs.get("bloom"))}', 'apply_light_env.mjs --fields bloom')
    add('standard look (lines of light)', True, f'room page render is a viewer setting (renderPlan.js), not stored in the project; row {STANDARD_LOOK_ROW}', '', state='OWED')

    # 10. views: the entry camera and the view buttons
    ps = doc.get('presentationState') or {}
    views = ps.get('viewPresets') or []
    add('views', bool(views), f'{len(views)} view presets, entry {ps.get("entryView") or "-"}', 'epic-build.mjs writes the views; views-v2.mjs for more')
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--doc'); p.add_argument('--api'); p.add_argument('--project'); p.add_argument('--json')
    p.add_argument('--off-dmx', default='', help='fixture types not driven over DMX, comma list (e.g. network lasers, a hazer run by hand)')
    a = p.parse_args()
    if not a.doc and not (a.api and a.project):
        p.error('needs --doc <file> or --api <base> --project <id>')
    try:
        doc = load(a)
    except Exception as err:  # the one place it fails: say why
        print(f'cannot read the document: {err}'); return 2
    rows = check(doc, [t.strip() for t in a.off_dmx.split(',') if t.strip()])
    w = max(len(r['step']) for r in rows)
    for r in rows:
        print(f'{r["state"]:8} {r["step"]:<{w}}  {r["found"]}' + (f'\n{"":8} {"":<{w}}  next: {r["next"]}' if r['next'] else ''))
    missing = [r['step'] for r in rows if r['state'] == 'MISSING']
    print(f'\n{len(rows) - len(missing)}/{len(rows)} steps present' + (f'; missing: {", ".join(missing)}' if missing else ''))
    if a.json:
        json.dump(rows, open(a.json, 'w'), indent=1)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())

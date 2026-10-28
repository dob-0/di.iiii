"""laser_rules.py — read the laser safety rules from their ONE homes, never hold a copy (2026-10-20).
Distances: scripts/place/laser-distance.mjs (LASER_MIN_HEIGHT_M, LASER_HAND_RULE_M).
Device values: the device's chart, scripts/place/fixtures/charts/up-la40wf.json (neverUseValues), documented in docs/moxir/devices/up-la40wf.md.
Fails loudly when an export or key moves. Tested by scripts/place/laser-rules-one-source.test.js."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
_MJS = os.path.join(HERE, 'laser-distance.mjs')
_LA40 = os.path.join(HERE, 'fixtures', 'charts', 'up-la40wf.json')


def _const(name):
    src = open(_MJS).read()
    m = re.search(r'export\s+const\s+%s\s*=\s*([0-9.]+)' % name, src)
    if m:
        return float(m.group(1))
    m = re.search(r'export\s+const\s+%s\s*=\s*(\w+)\s*\+\s*(\w+)' % name, src)  # a sum of two exports
    if not m:
        raise SystemExit('laser_rules: %s not found in laser-distance.mjs' % name)
    return _const(m.group(1)) + _const(m.group(2))


MIN_HEIGHT_M = _const('LASER_MIN_HEIGHT_M')
HAND_RULE_M = _const('LASER_HAND_RULE_M')


def la40_never_use():
    return sorted(json.load(open(_LA40))['graphics']['neverUseValues'])

"""palette_lib — colour maths + a palette-table loader for a show's light palette. Generic: no production name; the table is DATA.
Step of the venue-to-show skill: the palette / colour step (colours measured from reference footage, then turned into lamp hexes).
Moved from the MOXIR scenes-50 job's palette.py (2026-10-15, ledger N811.2); its table is scripts/place/rigs/palette-moxir-2026-10-15.json.

  python3 -I scripts/place/palette_lib.py --help
  python3 -I scripts/place/palette_lib.py TABLE.json        # print every colour with its luminance, hue and eye comfort

Table shape: {"palette": [{key, name, lamp, sampled, rule, measured, practice, role}], "surfaces": [{name, hex, source}], "wheel": [{name, hex}]}.
Each lamp hex is 'as sampled' or 'hue of the sample at full value, saturation S' (rule text 'S 0.55'); S is taste and is said so.
Eye comfort (eye()) method: WCAG 2.2 SC 2.3.1 saturated-red state on linear sRGB; longitudinal chromatic aberration of the eye
(Thibos et al. 1992, Rx = p - q/(lambda - c), q 633.46, c 214.10) over ASSUMED RGB LED peaks 630/525/465 nm. Thresholds are taste, UNVALIDATED."""
import colorsys, json, sys

def rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
def hexof(c): return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)
def hue_deg(h): return round(colorsys.rgb_to_hsv(*rgb(h))[0] * 360)
def lamp(sampled, s): return hexof(colorsys.hsv_to_rgb(colorsys.rgb_to_hsv(*rgb(sampled))[0], s, 1.0))
def _lin(h): return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb(h)]
W709 = (0.2126, 0.7152, 0.0722)

def lum(h):
    """Relative luminance, sRGB -> linear, Rec. 709 weights (WCAG 2.x)."""
    return sum(a * b for a, b in zip(W709, _lin(h)))

def returned(lamp_hex, surface_hex):
    """Share of the lamp's luminance a matte surface sends back (per-channel product, linear)."""
    return sum(a * b * c for a, b, c in zip(_lin(lamp_hex), _lin(surface_hex), W709)) / max(1e-9, lum(lamp_hex))

def planck_hex(T):
    """Planckian white at T kelvin: CIE 1931 xy by the Kim et al. 2002 cubic spline (1667-4000 K), XYZ at Y=1, linear sRGB
    (IEC 61966-2-1 matrix), scaled to max 1, sRGB-encoded."""
    if not 1667 <= T <= 4000: raise ValueError('planck_hex: 1667-4000 K only (Kim et al. 2002 spline)')
    x = -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.179910
    y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
    X, Y, Z = x / y, 1.0, (1 - x - y) / y
    lin = [max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z), max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z), max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)]
    m = max(lin); return hexof([12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in (u / m for u in lin)])

LED_NM = (630, 525, 465)
def _focus(lin):
    w = [a * b for a, b in zip(lin, W709)]; t = sum(w) or 1e-9
    return sum(wi * -633.46 / (n - 214.10) for wi, n in zip(w, LED_NM)) / t

def eye(h):
    lin = _lin(h); s = sum(lin) or 1e-9
    return {'red_share': round(lin[0] / s, 2), 'blue_share': round(lin[2] / s, 2), 'saturated_red': lin[0] / s >= 0.8,
            'saturated_green': lin[1] / s >= 0.8, 'saturated_blue': lin[2] / s >= 0.8, 'hsv_s': round(colorsys.rgb_to_hsv(*rgb(h))[1], 2),
            'focus_shift_D': round(_focus(lin) - _focus([1, 1, 1]), 2)}

def nearest_slot(h, wheel):
    """The slot the desk sends for a colour: nearest by squared sRGB distance (src/rigbuild/dmxDecode.js nearestSlot). wheel = [(name, hex)]."""
    c = [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    return min(wheel, key=lambda s: sum((int(s[1][i:i + 2], 16) - v) ** 2 for i, v in zip((1, 3, 5), c)))

def load(path):
    """Read a palette table; fill a missing lamp hex from rule 'S x' on the sampled hex, or Planckian 'NNNN K'. -> (P, C, NAME, surfaces, wheel)."""
    d = json.load(open(path)); P = []
    for r in d['palette']:
        r = dict(r)
        if not r.get('lamp'):
            rule = r['rule']
            if 'S ' in rule: r['lamp'] = lamp(r['sampled'], float(rule.split('S ')[1].split()[0].rstrip(',;')))
            elif 'Planckian' in rule: r['lamp'] = planck_hex(int(rule.split('Planckian ')[1].split()[0]))
            else: raise ValueError(f"{r['key']}: no lamp hex and no rule to make one")
        P.append(r)
    C = {r['key']: r['lamp'] for r in P}; NAME = {r['lamp']: r['name'] for r in P}
    return P, C, NAME, [(s['name'], s['hex']) for s in d.get('surfaces', [])], [(w['name'], w['hex']) for w in d.get('wheel', [])]

if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__); sys.exit(0 if len(sys.argv) == 2 else 2)
    P, C, NAME, surfaces, wheel = load(sys.argv[1])
    for r in P:
        e = eye(r['lamp']); print(f"{r['key']:4} {r['name']:18} {r['lamp']} hue {hue_deg(r['lamp']):3}° lum {lum(r['lamp']):.3f} satRed {e['saturated_red']} focus {e['focus_shift_D']:+.2f} D")

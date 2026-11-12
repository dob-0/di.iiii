#!/usr/bin/env python3
"""import_platina_manuals.py - put the five Platina rental lamps into di.iiii's fixture library, from the makers' manuals.

    python3 -I scripts/place/fixtures/import_platina_manuals.py --manuals <dir with fixtures.json> [--check]

What it is: the one-shot importer of the 2026-11-11 manual read (the owner's "collect the fixtures to have them on hand").
It reads fixtures.json (every mode, every channel with its function, value text and manual page, typed from the makers'
manuals on 2026-11-11), then WRITES, idempotently:
  1. scripts/place/fixtures/charts/<id>.json  - the maker's chart per type, value ranges as [from, to, meaning]
     (+ the maker's own text), each channel with di's `role` (and `cap` / `default` only where the manual's range supports it);
  2. scripts/place/fixtures/fixtures.json     - the kinds and the `sources` (URL, publisher, date read) of the five types.
Then `node scripts/rigbuild/chart-lists.mjs` turns the charts into the roles module and `node scripts/rigbuild/types.mjs`
regenerates the library. After that the library stands without the manuals folder: URLs, page refs and the read date are in the repo.
The PDFs are NOT copied (the makers' manuals are kept for our own reference, not redistributed).

A value not in the data is UNKNOWN (value null), never a guess. A channel list that was not read (the K15's) stays owed.
--check: write nothing; exit 1 when the repo differs from what this script would write.
"""
import argparse, copy, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, 'fixtures.json')
CHARTS = os.path.join(HERE, 'charts')
READ = '2026-11-11'

# ---- sources (every URL is from the SOURCE.txt beside the manual; publisher and date as stated there) -------------------
SOURCES = {
    'CP-K10-MAN': {'url': 'https://cdn01.4wall.com/cms/rentals/files/f5c4630faaa764.pdf',
                   'what': "Clay Paky A.LEDA B-EYE K10 / K10 EASY / K20 user manual, IST009/001 EN Rev.F 08/2016, 32 pages (a copy on the rental company 4wall's server; Claypaky's own DMX chart is behind a login). Page numbers are PDF pages.",
                   'publisher': 'Clay Paky S.p.A. (copy hosted by 4wall)', 'accessed': READ},
    'CP-K10-OFL': {'url': 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/4992b86027ee3cba19644bc7417435a68c8cdcb5/fixtures/clay-paky/a-leda-b-eye-k10.json',
                   'what': 'Clay Paky A.leda B-EYE K10 in the Open Fixture Library (MIT), pinned commit; used for the zoom range only (the manual gives no beam angle)',
                   'publisher': 'Open Fixture Library (MIT)', 'accessed': READ},
    'CP-K15-MAN': {'url': 'https://goknight.com/content/documentation/HyB-EyeK15&K25_InstructionManual_05.2023.pdf', 'what': "Clay Paky HY B-EYE K15 & K25 instruction manual, 05/2023, 12 pages; p10 '5. DIMENSIONS' (hosted by the distributor Knight)", 'publisher': 'Clay Paky S.p.A. (host: goknight.com)', 'accessed': '2026-11-12'},
    'CP-K15-DS': {'url': 'https://goknight.com/content/documentation/HyB-EyeK15_Datasheet_01.2021.pdf',
                  'what': 'Clay Paky HY B-EYE K15 datasheet, 01/2021, 1 page (hosted by the distributor Knight)',
                  'publisher': 'Clay Paky S.p.A. (host: goknight.com)', 'accessed': READ},
    'CP-K15-MENU': {'url': 'https://goknight.com/content/documentation/HyB-Eye_UserMenu_02.2022.pdf',
                    'what': 'Clay Paky HY B-EYE user menu, 02/2022 (modes: Standard / Shape / Standard + Freq / Shape + Freq; Pixel Engine RGB / RGBW with its own address)',
                    'publisher': 'Clay Paky S.p.A. (host: goknight.com)', 'accessed': READ},
    'CP-K15-MAN': {'url': 'https://goknight.com/content/documentation/HyB-EyeK15&K25_InstructionManual_05.2023.pdf',
                   'what': 'Clay Paky HY B-EYE K15 / K25 instruction manual, IST01D/001 Rev.A 05/2023 (no DMX chart inside)',
                   'publisher': 'Clay Paky S.p.A. (host: goknight.com)', 'accessed': READ},
    'CP-K15-AQUA': {'url': 'https://goknight.com/content/documentation/HyB-EyeK15Aqua_DMX-Channels_11.2024.pdf',
                    'what': 'DMX chart of the K15 AQUA, a DIFFERENT variant: read as a reference only, no value of the K15 comes from it',
                    'publisher': 'Clay Paky S.p.A. (host: goknight.com)', 'accessed': READ},
    'ACME-PLIP-MAN': {'url': 'https://res.cloudinary.com/tr2onhk1/image/upload/v1784625081/artr/specs/xcjuxizosh2ucwt4ktml.pdf',
                      'what': "User manual of the PIXEL LINE IP (STROBE 3 IP), 27 pages; the cover shows the white-label brand 'GML Grand Master Light', no ACME name in the text; third-party host",
                      'publisher': 'ACME (white-label copy, third-party host)', 'accessed': READ},
    'ACME-PLIP-DS': {'url': 'https://en.acmelighting.com/upload/other/20260415/19b3a847ddd50afd52b6a73d0065a1c7.pdf',
                     'what': "ACME's own datasheet for PIXEL LINE IP / STROBE 3 IP, 2 pages (2026-04); lists 13 modes, the manual copy 11",
                     'publisher': 'ACME (en.acmelighting.com)', 'accessed': READ},
    'ACME-XP16-MAN': {'url': 'https://en.acmelighting.com/Uploads/download/file_material/1548730155bda9de23c5da5e98.pdf',
                      'what': "ACME user manual 'XP-16R BSW III', 36 pages, PDF metadata 2018-02-05",
                      'publisher': 'ACME (en.acmelighting.com)', 'accessed': READ},
    'MAGMA-MAN': {'url': 'https://goknight.com/content/documentation/Magma%20Prime%20User%20Manual.pdf',
                  'what': 'Magma Prime user manual, 17 pages (publisher Magmatic Effects / Elation Professional B.V.)',
                  'publisher': 'Magmatic Effects / Elation Professional B.V. (host: goknight.com)', 'accessed': READ},
}

# ---- value ranges: "[from, to, meaning]" from the maker's text; the text itself is always kept ---------------------------
SEG = re.compile(r'^(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*[=:]?\s*(.*)$')


def ranges_of(text):
    if not text:
        return []
    text = re.sub(r'^p\d+(?:-\d+)?:\s*', '', text.strip())
    out = []
    for seg in re.split(r';\s*|,\s+(?=\d)', text):
        m = SEG.match(seg.strip())
        if m:
            lo = int(m.group(1))
            hi = int(m.group(2)) if m.group(2) else lo
            out.append([lo, hi, m.group(3).strip() or None])
    return out


# ---- roles ----------------------------------------------------------------------------------------------------------------
def clean(function):
    f = re.sub(r'\s*\(temporarily empty\)', '', function)
    return re.split(r' 0-255 ', f)[0].strip()


def common_role(f):
    """The maker's word (lower case) to di's role. First match wins; None = not common."""
    f = f.lower()
    table = [
        (r'^red fine$', 'rFine'), (r'^green fine$', 'gFine'), (r'^blue fine$', 'bFine'), (r'^white fine$', 'wFine'),
        (r'^red$', 'r'), (r'^green$', 'g'), (r'^blue$', 'b'), (r'^white$', 'w'),
        (r'^dimmer fine$', 'dimmerFine'), (r'^(dimmer|dimming)$', 'dimmer'),
        (r'^pan fine$', 'panFine'), (r'^pan$', 'pan'), (r'^tilt fine$', 'tiltFine'), (r'^tilt$', 'tilt'),
        (r'^pan/tilt speed$', 'speed'), (r'^zoom fine$', 'zoomFine'), (r'^zoom rotation$', 'zoomRotation'), (r'^zoom$', 'zoom'),
        (r'^focus fine$', 'focusFine'), (r'^focus$', 'focus'), (r'^frost$', 'frost'), (r'^atomized glass', 'frost'),
        (r'^shutter/strobe$', 'strobe'), (r'^strobe$', 'strobe'), (r'^colour wheel$', 'color'),
        (r'^reset$', 'control'), (r'^special function', 'control'), (r'^function$', 'function'),
        (r'^linear cto$', 'cto'), (r'^macro colour$', 'macro'),
    ]
    for pat, role in table:
        if re.match(pat, f):
            return role
    return None


def role_k10(fn):
    f = fn.lower()
    cell = re.match(r'^(red|green|blue|white) led (\d+)$', f)
    if cell:
        return f'p{int(cell.group(2)):02d}{cell.group(1)[0]}'
    table = {'shape selection': 'shape', 'shape speed': 'shapeSpeed', 'shape fade': 'shapeFade', 'shape r': 'shapeR', 'shape g': 'shapeG',
             'shape b': 'shapeB', 'shape w': 'shapeW', 'shape dimmer': 'shapeDimmer', 'background dimmer': 'bgDimmer',
             'shape transition': 'shapeTransition', 'shape offset': 'shapeOffset', 'foreground strobe': 'fgStrobe',
             'background strobe': 'bgStrobe', 'background select': 'bgSelect'}
    return table.get(f) or common_role(f)


def role_plip(fn):
    f = fn.lower()
    m = re.match(r'^(red|green|blue)(\d+)$', f)
    if m:
        return f'p{int(m.group(2)):02d}{m.group(1)[0]}'
    m = re.match(r'^white(\d+)$', f)
    if m:
        return f'cw{int(m.group(1)):02d}'
    # the bar has an RGB side and a white (CW) side; "(W)" is the white side, no suffix / "(RGB)" the RGB side
    side = 'W' if f.endswith('(w)') else ''
    base = re.sub(r'\s*\((rgb|w)\)$', '', f)
    table = {'dimming': 'dimmer', 'dimmer fine': 'dimmerFine', 'strobe duration': 'strobeDuration', 'strobe rate': 'strobeRate',
             'strobe': 'strobe', 'preset colours': 'macro', 'built-in effects': 'effect', 'built-in effect speed': 'effectSpeed',
             'fade out effect': 'fade'}
    if base in table:
        return table[base] + side
    if base.startswith('atomized glass'):
        return 'frost'
    return common_role(f)


def role_xp16(fn):
    f = fn.lower()
    table = {'gobo wheel 1 (static)': 'gobo', 'gobo wheel 2 (rotating)': 'gobo2', 'rotating gobo index/rotation': 'gobo2Rotation',
             'prism 1 (8-facet) in/out': 'prism', 'prism 1 rotation': 'rotation', 'prism 2 (6-linear) in/out': 'prism2',
             'prism 2 rotation': 'prism2Rotation'}
    return table.get(f) or common_role(f)


def role_magma(fn):
    f = fn.lower()
    table = {'fog output': 'fog', 'output volume': 'volume', 'fan': 'fan', 'output duration': 'duration', 'interval': 'interval'}
    if f.startswith('output volume'):
        return 'volume'
    return table.get(f)


# ---- caps and defaults: ONLY where the manual's own range supports them ----------------------------------------------------
def cap_of(fixture, role, page):
    if fixture == 'cp-aleda-beye-k10' and role == 'strobe':
        return {'shutter': [{'from': 0, 'to': 3, 'open': False}, {'from': 104, 'to': 107, 'open': True},
                            {'from': 208, 'to': 212, 'open': True}, {'from': 252, 'to': 255, 'open': True}]}
    if fixture == 'acme-xp16r-bsw':
        if role == 'strobe':
            return {'shutter': [{'from': 0, 'to': 7, 'open': False}, {'from': 8, 'to': 15, 'open': True}, {'from': 248, 'to': 255, 'open': True}]}
        if role == 'frost':
            return {'frost': {'from': 8, 'to': 255, 'basis': f'MANUAL {page}: 000-007 off; 008-255 on (an insert, not a curve)'}}
        if role == 'prism':
            return {'prism': True, 'prismIn': {'from': 8, 'facets': 8, 'basis': f'MANUAL {page}: 008-255 prism 1 in; 8 facets from the manual p5'}}
        if role == 'rotation':
            return {'prismRotation': {'prism': 1, 'index': {'from': 0, 'to': 127}, 'basis': f'MANUAL {page}: 0-127 index; 128-189 CCW, 190-193 stop, 194-255 CW'}}
    return None


def default_of(fixture, role):
    if role in ('pan', 'tilt'):
        return 128
    if role == 'strobe' and fixture in ('cp-aleda-beye-k10', 'acme-xp16r-bsw'):
        return 255
    if role in ('control', 'function'):
        return 0
    return None


ROLE_FN = {'cp-aleda-beye-k10': role_k10, 'acme-pixel-line-ip': role_plip, 'acme-xp16r-bsw': role_xp16, 'magmatic-magma-prime': role_magma}


def channels_of(fixture_id, mode):
    out = []
    seen = {}
    for c in mode['channels']:
        label = clean(c['function'])
        role = ROLE_FN[fixture_id](label)
        if role is None:
            raise SystemExit(f'{fixture_id} {mode["name"]} ch {c["n"]}: no role for "{label}"')
        if role in seen:
            raise SystemExit(f'{fixture_id} {mode["name"]}: role {role} twice (ch {seen[role]} and {c["n"]})')
        seen[role] = c['n']
        page = (c.get('src') or '').split(' ')[-1] or None
        # the text: the value column, or (when the maker's function cell carries the range) what follows the name
        text = c.get('range')
        if text in (None, 'None'):
            text = None
        ch = {'ch': c['n'], 'function': label, 'role': role}
        if text:
            ch['text'] = text
            rr = ranges_of(text)
            if rr:
                ch['ranges'] = rr
        if page:
            ch['page'] = page
        d = default_of(fixture_id, role)
        if d is not None:
            ch['default'] = d
        cap = cap_of(fixture_id, role, page or '')
        if cap:
            ch['cap'] = cap
        out.append(ch)
    return out


def mode_by(fixture, name):
    return next(m for m in fixture['modes'] if m['name'] == name)


# ---- the five kinds ---------------------------------------------------------------------------------------------------------
def spec(value, src, basis='EXACT', **extra):
    return {'value': value, 'src': src, 'basis': basis, **extra}


def unknown(note):
    return {'value': None, 'basis': 'UNKNOWN', 'accessed': READ, 'note': note}


def build(manuals):
    fx = {f['id']: f for f in manuals['fixtures']}
    kinds, charts = {}, {}

    # 1. Clay Paky A.LEDA B-EYE K10 ----------------------------------------------------------------------------------------
    f = fx['cp-aleda-beye-k10']
    std, shp = channels_of('cp-aleda-beye-k10', mode_by(f, 'Basic Engine / Standard')), channels_of('cp-aleda-beye-k10', mode_by(f, 'Basic Engine / Shapes'))
    prgb, prgbw = channels_of('cp-aleda-beye-k10', mode_by(f, 'Pixel Engine / RGB')), channels_of('cp-aleda-beye-k10', mode_by(f, 'Pixel Engine / RGBW'))
    combo = []
    for n, c in enumerate(shp + prgbw, 1):
        c = copy.deepcopy(c)
        c['engine'] = 'basic' if n <= 35 else 'pixel'
        c['engine_ch'] = c['ch']
        c['ch'] = n
        combo.append(c)
    k10_modes = {
        '21': ('Basic Standard', std, 'Basic engine, Standard mode (display: Set Up > Basic Engine > Mode = Standard), p22.'),
        '35': ('Basic Shapes', shp, 'Basic engine, Shape mode (Set Up > Basic Engine > Mode = Shape), p22. Channels 1-21 are the Standard list.'),
        '57': ('Pixel RGB', prgb, 'Pixel engine, RGB: 19 LEDs x 3, LEDs only, NO pan / tilt / zoom / dimmer (those live in the basic engine). A second engine with its own DMX address and universe (Set Up > Pixels Engine), switched on by the basic engine FUNCTION channel (value 103-105 = pixel map enabled), p22, p25.'),
        '76': ('Pixel RGBW', prgbw, 'Pixel engine, RGBW: 19 LEDs x 4, LEDs only, no pan / tilt / zoom / dimmer. Second engine, own address, enabled from the basic engine FUNCTION channel 103-105, p22, p25.'),
        '111': ('Shapes + Pixel RGBW', combo, 'The combined mode the Platina plan uses: the Shapes list (35) followed by the Pixel RGBW list (76). It is TWO ENGINES addressed side by side: patch the basic engine at address A and the pixel engine at A + 35 (own address and universe in the lamp\'s menu); channel 18 (FUNCTION) at 103-105 enables the pixel map. Not a single mode of the lamp: a patch convention built from two exact lists (manual p22, p25; the manual\'s own note on two engines).'),
    }
    kinds['aledaK10'] = {
        'code': 'CP-ALEDA-BEYE-K10',
        'identified': "EXACT - Clay Paky's own model A.LEDA B-EYE K10 (C61419); the rental list says 'A.leda K10 19x15'. Whether the rented lamps are K10 or K10 Easy (20/34-channel basic modes) and their firmware is not confirmed: read it on the display (Information > System Version)",
        'product': 'Clay Paky A.LEDA B-EYE K10, 19 x 15 W RGBW LED moving head wash with Kaleido shapes and a pixel engine',
        'maker': 'Clay Paky S.p.A.', 'maker_basis': "the maker's own manual (copy on 4wall's server), read 2026-11-11", 'maker_model': 'A.LEDA B-EYE K10 (C61419)',
        'manual': {'url': SOURCES['CP-K10-MAN']['url'], 'date': 'IST009/001 EN Rev.F 08/2016', 'read': f'{READ}, pdftotext + page images p20, p22', 'basis': 'EXACT',
                   'note': "the K10 manual also covers K10 Easy (C61415) and K20 (C61420); a copy hosted by a rental company, not Claypaky's own server"},
        'maker_chart': {'file': 'scripts/place/fixtures/charts/cp-aleda-beye-k10.json', 'modes': {k: 'EXACT' for k in k10_modes}},
        'look': 'A round-faced LED head (19 lenses in a 1 + 6 + 12 pattern) in a U-yoke on a flat base with side handles.',
        'specs': {
            'size_mm': spec([358, 253, 494], 'CP-K10-MAN', order='W x D x H', note='p20 drawing: base 253 x 358, 494 high with the head tilted forward (423 with the head upright), 360 across the yoke, 248 head; the 3D body is the one built for the same drawing (aledaK10)'),
            'weight_kg': spec(14.5, 'CP-K10-MAN', note='p20: K10 14.5 kg (K10 Easy: not stated; K20 21 kg)'),
            'power_w': spec(450, 'CP-K10-MAN', note="p20 'Input power K10 450 VA' - the manual gives VA, not W; kept as published"),
            'source': spec('19 x Osram Ostar RGBW LED, 15 W, average life 50,000 h; 5500 lm (K10 Easy 4800 lm)', 'CP-K10-MAN', note='p20'),
            'zoom_deg': spec([4, 60], 'CP-K10-OFL', note='from the Open Fixture Library entry for this exact model (MIT), not from the manual (p26 gives lens-rotation angle 0-60 deg only)'),
            'pan_tilt_deg': spec([540, 210], 'CP-K10-MAN', note='p20'),
            'ip': spec('IP20', 'CP-K10-MAN', note='p20'),
            'beam_deg': unknown('not published by the manual (total output 5500 lm only; the OFL zoom range is the lens range)'),
            'dmx_channels': spec([21, 35, 57, 76, 111], 'CP-K10-MAN', note='21 / 35: basic engine Standard / Shape; 57 / 76: the pixel engine RGB / RGBW (a second engine with its own address); 111 = Shapes 35 + Pixel RGBW 76, two engines addressed side by side (pixel address = basic address + 35) - a patch convention, not a lamp mode'),
        },
        'modes_info': {k: {'label': v[0], 'note': v[2]} for k, v in k10_modes.items()},
        'model': copy.deepcopy(json.load(open(MANIFEST, encoding='utf-8'))['kinds']['beeEye']['model']),
    }
    kinds['aledaK10']['model']['note'] = "drawn to the K10 outer size of the manual's p20 drawing (358 x 253 x 494); the same body as the UP-HK1915 stand-in"
    charts['cp-aleda-beye-k10'] = chart('aledaK10', kinds['aledaK10'], 'cp-aleda-beye-k10', k10_modes, f,
                                         pixel_note='the pixel engine is a second engine (own address) switched on by basic FUNCTION 103-105')

    # 2. Clay Paky HY B-EYE K15 -- channel lists OWED --------------------------------------------------------------------
    f = fx['cp-hy-beye-k15']
    k15_info = {
        '22': ('Basic (22 per datasheet)', "From the datasheet's '22/36/57/76 DMX channels' only. CHANNEL LIST OWED: the standard K15 DMX chart sits behind the maker's login (claypaky.it -> e-assist.tech). 22 is probably Standard + Freq (the AQUA sheet counts Standard 21 / Standard Freq 22): an inference, not read."),
        '36': ('Shape (36 per datasheet)', 'From the datasheet only. CHANNEL LIST OWED. Probably Shape + Freq (AQUA: Shape 35 / Shape Freq 36): an inference, not read.'),
        '57': ('Pixel RGB', 'From the datasheet only. CHANNEL LIST OWED. Pixel engine, own address (user menu 02.2022); pixels only, no pan / tilt / zoom - inferred from the menu structure and the K10 manual, not read for the K15.'),
        '76': ('Pixel RGBW', 'From the datasheet only. CHANNEL LIST OWED. Pixel engine RGBW, 19 x 4; pixels only (inferred, as above).'),
        '112': ('Shape + Pixel RGBW', "The combined mode the Platina plan uses: the 36-channel basic list followed by the 76-channel pixel list = 112, two engines addressed side by side (pixel address = basic address + 36). LIST OWED with the two it is made of."),
    }
    kinds['hyK15'] = {
        'code': 'CP-HY-BEYE-K15',
        'identified': "EXACT - Clay Paky's own model HY B-EYE K15 (C61480), read from its datasheet; the rented unit's variant is not confirmed. The channel lists are OWED (maker login)",
        'product': 'Clay Paky HY B-EYE K15, 19 x RGBW LED moving head with Kaleido FX and a pixel engine',
        'maker': 'Clay Paky S.p.A.', 'maker_basis': "the maker's own datasheet 01/2021 (hosted by the distributor Knight), read 2026-11-11", 'maker_model': 'HY B-EYE K15 (C61480)',
        'manual': {'url': SOURCES['CP-K15-DS']['url'], 'date': '01/2021', 'read': f'{READ}, pdftotext p1', 'basis': 'EXACT',
                   'note': 'datasheet only; the standard K15 DMX chart was NOT obtained (claypaky.it links to e-assist.tech, login; two manual hosts refused automated reading). The K15 AQUA chart is a different variant and is NOT copied in as this lamp'},
        'maker_chart': {'file': 'scripts/place/fixtures/charts/cp-hy-beye-k15.json', 'modes': {k: 'OWED' for k in k15_info}},
        'look': 'The B-EYE family look: a round head with 19 lenses in a U-yoke.',
        'specs': {
            'size_mm': {'value': [391, 329, 438], 'src': 'CP-K15-MAN', 'basis': 'EXACT', 'order': 'W x D x H, head upright (home)', 'accessed': '2026-11-12', 'note': "manual p10 drawing: base 329 x 387, 391 across the yoke, 438 high with the head upright, 496 with the head horizontal, lens face 240, head 224 deep zoomed in / 264 zoomed out. The maker's product page (claypaky.it/products/hy-b-eye-k15, read 2026-11-12) gives the same base 329 x 387 and 496 mm. Which base side lies along the yoke is read from the drawing (387), not printed."},
            'weight_kg': spec(20.7, 'CP-K15-DS', note='datasheet p1'),
            'power_w': spec(700, 'CP-K15-DS', note="datasheet p1 '700 VA at 230 V' - VA, not W; kept as published"),
            'source': spec('19 RGBW LEDs, 40 W each driven (OSRAM OSTAR Stage II LE RTDUW S2WN), 6000 K', 'CP-K15-DS', note='datasheet p1'),
            'zoom_deg': spec([4, 60], 'CP-K15-DS', note="datasheet p1 '4-60 deg electronic zoom range'"),
            'pan_tilt_deg': spec([540, 200], 'CP-K15-DS', note='datasheet p1; 16-bit pan / tilt'),
            'ip': spec('IP20', 'CP-K15-DS', note='datasheet p1'),
            'beam_deg': unknown('not published (the zoom range above is the lens range)'),
            'dmx_channels': spec([22, 36, 57, 76, 112], 'CP-K15-DS', note="datasheet '22/36/57/76 DMX channels'; 112 = the 36-channel basic list + the 76-channel pixel list (two engines, pixel address = basic address + 36). The channel LISTS are owed; the Aqua variant's chart is NOT used"),
        },
        'modes_info': {k: {'label': v[0], 'note': v[1]} for k, v in k15_info.items()},
        'model': {'archetype': 'moving-head', 'params': {'base_mm': [387, 329, 120], 'handles': False, 'arm_t_mm': 25, 'arm_w_mm': 130, 'arm_gap_mm': 10, 'tilt_axis_mm': 346, 'head': {'shape': 'box', 'round': 0.22, 'width_mm': 300, 'depth_mm': 300, 'below_axis_mm': 140, 'above_axis_mm': 84, 'lens_mm': 40, 'lens_layout': 'hex19', 'lens_pitch_mm': 48}}, 'note': "drawn to the manual's p10 drawing: 391 across the yoke, 438 high upright, head 224 deep, 19 lenses inside the 240 mm face. ASSUMED (not printed): base height 120, head body 300 wide, tilt axis at 346 (496 with the head horizontal minus half the head)."},
    }
    charts['cp-hy-beye-k15'] = {
        'kind': 'hyK15', 'code': 'CP-HY-BEYE-K15', 'maker': 'Clay Paky S.p.A.', 'manual': kinds['hyK15']['manual'],
        'howToRead': 'the K15 channel lists are OWED: modes carry their footprint from the datasheet only. Nothing here is a K15 channel.',
        'owed': ["the standard K15 DMX chart (claypaky.it / e-assist.tech, login) for Standard, Shape, Standard + Freq, Shape + Freq and the Pixel engine", 'pixel map of the 19 LEDs'],
        'reference_only': "The K15 AQUA chart (a different variant, source CP-K15-AQUA) counts Standard 21 / Standard Freq 22 / Shape 35 / Shape Freq 36 / pixels 57 / 76. It is NOT this lamp and no channel of it is carried; it only shows why 22 and 36 are probably the Freq variants.",
        'modes': {k: {'status': 'OWED', 'name': v[0], 'note': v[1], 'channels': None} for k, v in k15_info.items()},
    }

    # 3. ACME Pixel Line IP ---------------------------------------------------------------------------------------------------
    f = fx['acme-pixel-line-ip']
    pl_modes = {}
    order = [7, 15, 21, 39, 112, 17, 33, 65, 68, 117, 70]  # the lamp's own menu order (manual p9)
    for n in order:
        m = mode_by(f, f'{n} Channel')
        pl_modes[str(n)] = (f'{n} Channel', channels_of('acme-pixel-line-ip', m), m.get('note') or '', m.get('src'))
    kinds['pixelLineIp'] = {
        'code': 'ACME-PIXEL-LINE-IP',
        'identified': "EXACT - ACME's PIXEL LINE IP (STROBE 3 IP), 1 m, IP66. The manual copy carries the white-label brand 'GML Grand Master Light'; which revision / variant (STROBE 3 IP 672 RGB or STROBE 1) the rented bars are is not confirmed",
        'product': 'ACME PIXEL LINE IP (STROBE 3 IP), 1 m LED bar, 32 RGB + 16 white (CW) cells, IP66',
        'maker': 'ACME (Foshan Yi Feng Electric Industrial Co.)', 'maker_basis': "ACME's own datasheet (en.acmelighting.com, 2026-04) and the manual copy, read 2026-11-11", 'maker_model': 'PIXEL LINE IP (STROBE 3 IP)',
        'manual': {'url': SOURCES['ACME-PLIP-MAN']['url'], 'date': '2026 (copy; no date in the file)', 'read': f'{READ}, pdftotext p6, p9-25', 'basis': 'EXACT',
                   'product_page': SOURCES['ACME-PLIP-DS']['url'],
                   'note': 'white-label manual copy on a third-party host; the datasheet is ACME\'s own and lists 13 modes (35, 38, 70N, 119 are not in the manual copy)'},
        'maker_chart': {'file': 'scripts/place/fixtures/charts/acme-pixel-line-ip.json', 'modes': {k: 'EXACT' for k in pl_modes}},
        'look': 'A 1 m aluminium bar with a long diffuse front window, an omega bracket or sliding clamps on the back.',
        'specs': {
            'size_mm': spec([1000, 90, 124], 'ACME-PLIP-DS', order='L x W x H', note="datasheet 'Omega bracket version' 1,000 x 90 x 124 mm; with the sliding clamp 1,000 x 192 x 237 mm. The manual p10 says 'Fixture size 100*124*90 mm (L*W*H)' - a missing zero (100 for 1000) and W / H swapped against the datasheet; the datasheet is used"),
            'weight_kg': spec(8.3, 'ACME-PLIP-MAN', note="manual p6 'NW 8.3 kg (not incl. clamps)'; the datasheet says 7.3 kg (omega bracket) / 8.3 kg (sliding clamp)"),
            'power_w': spec(420, 'ACME-PLIP-MAN', note='manual p6; datasheet also 420 W'),
            'source': spec('672 x 0.5 W RGB LED + 112 x 3 W CW LED (32 RGB cells + 16 white cells, 16 sections for the white)', 'ACME-PLIP-MAN', note='manual p6; the cell sizes (21 / 7 LEDs) are arithmetic, not stated'),
            'beam_deg': spec(101, 'ACME-PLIP-MAN', note='RGB; the CW LEDs 108 deg (manual p6, datasheet)'),
            'field_deg': spec(149, 'ACME-PLIP-MAN', note='RGB; the CW LEDs 152 deg (manual p6)'),
            'ip': spec('IP66', 'ACME-PLIP-MAN', note='manual: protection rating IP66'),
            'effects': spec('SMART Glass DMX frost (atomized glass) in front of the LEDs; 40 built-in RGB effects, 9 white effects, 32 preset colours', 'ACME-PLIP-MAN', note='manual p10-12'),
            'dmx_channels': spec(order, 'ACME-PLIP-MAN', note="the manual's modes in the lamp's menu order (p9): 7, 15, 21, 39, 112, 17, 33, 65, 68, 117, 70; all counted. The datasheet lists 13 (35, 38, 70N, 119 not in the manual copy: channel lists owed)"),
        },
        'modes_info': {k: {'label': v[0], 'note': v[2], 'page': v[3]} for k, v in pl_modes.items()},
        'photometry': {'lux': 1163, 'at_m': 2, 'beam_deg': 101, 'src': 'ACME-PLIP-DS', 'basis': 'EXACT', 'centre': 'RGB LEDs at full, datasheet photometric table (the CW LEDs: 2,919 lux at 2 m, 108 deg)', 'note': 'datasheet: 101 deg RGB 1,163 / 291 / 129 / 73 lux at 2 / 4 / 6 / 8 m'},
        'model': {'archetype': 'led-bar', 'params': {'box_mm': [1000, 90, 124], 'bracket_h_mm': 24, 'bracket_at': 0.3, 'window_w_mm': 70, 'cells': 16, 'fins': 3}, 'note': "drawn to the datasheet's omega-bracket size 1,000 x 90 x 124 mm (L x W x H). The window is cut into 16 cells (the 16 white cells of the 112-channel mode; the 32 RGB cells are two per drawn cell). Bracket height 24 mm and window width 70 mm are ASSUMED from the maker's photo, not published."},
    }
    charts['acme-pixel-line-ip'] = chart('pixelLineIp', kinds['pixelLineIp'], 'acme-pixel-line-ip', pl_modes, f,
                                         pixel_note='cell order Red1..32 left to right is NOT stated; the menu has Pixel Seq Invert')

    # 4. ACME XP-16R BSW III --------------------------------------------------------------------------------------------------
    f = fx['acme-xp16r-bsw']
    xp_modes = {}
    for n, name in ((19, 'Mode 1 (19)'), (21, 'Mode 2 (21)')):
        m = mode_by(f, name)
        xp_modes[str(n)] = (f'Mode {1 if n == 19 else 2}', channels_of('acme-xp16r-bsw', m), m.get('note') or '', m.get('src'))
    kinds['xp16r'] = {
        'code': 'ACME-XP16R-BSW',
        'identified': "EXACT - ACME's XP-16R BSW III (the manual's title). The rental list says 'xp16r BWS' (sic): the revision of the rented hardware is NOT confirmed (no document read shows a 23-channel XP-16R; a 32-page web copy labelled XP-16R BSW was in fact the XP-15R SZ manual and was rejected)",
        'product': 'ACME XP-16R BSW III, 16R discharge beam / spot / wash moving head',
        'maker': 'ACME (Foshan Yi Feng Electric Industrial Co.)', 'maker_basis': "ACME's own manual (en.acmelighting.com), read 2026-11-11", 'maker_model': 'XP-16R BSW III',
        'manual': {'url': SOURCES['ACME-XP16-MAN']['url'], 'date': '2018-02-05 (PDF metadata)', 'read': f'{READ}, pdftotext + page image p6', 'basis': 'EXACT'},
        'maker_chart': {'file': 'scripts/place/fixtures/charts/acme-xp16r-bsw.json', 'modes': {k: 'EXACT' for k in xp_modes}},
        'look': 'A discharge moving head: rounded yoke arms, a big front lens, two prisms and a base with two side handles.',
        'specs': {
            'size_mm': spec([393, 344, 585], 'ACME-XP16-MAN', order='W x D x H', note="manual p5C 'Dimension 585 x 344 x 393 mm'; the drawing: 585 high, 393 wide (front), 344 deep (base with handles), 230 head thickness"),
            'weight_kg': spec(21.4, 'ACME-XP16-MAN', note='manual p5C'),
            'power_w': spec(480, 'ACME-XP16-MAN', note='manual p4'),
            'source': spec('PHILIPS MSD Platinum 16R discharge lamp, lamp life 1500 h', 'ACME-XP16-MAN', note='manual p5, p8'),
            'zoom_deg': spec([3, 32], 'ACME-XP16-MAN', note='manual p5C photometric diagram: 3 deg and 32 deg columns'),
            'pan_tilt_deg': spec([540, 270], 'ACME-XP16-MAN', note='manual p5'),
            'ip': unknown('not stated in the manual read'),
            'effects': spec('colour wheel (spec: white + 14 colours; DMX chart: white + Color 1-29), static gobo wheel (spec: 17 + open; chart: Gobo 1-16), rotating gobo wheel (12 + open), prism 1 (8-facet, rotating), prism 2 (6-linear, rotating), frost (DMX on / off; the spec says variable)', 'ACME-XP16-MAN', note='manual p5 vs p24-25: the slot counts of the spec and of the DMX chart disagree (colours 14 vs 29, gobos 17 vs 16); names are only pictured'),
            'dmx_channels': spec([19, 21], 'ACME-XP16-MAN', note="menu: DMX Settings > DMX Channel Mode 'Mode1 (19)' / 'Mode 2 (21)' (p12); Mode 2 adds zoom fine and focus fine"),
        },
        'modes_info': {k: {'label': v[0], 'note': v[2], 'page': v[3]} for k, v in xp_modes.items()},
        'photometry': {'lux': 810000, 'at_m': 5, 'beam_deg': 3, 'src': 'ACME-XP16-MAN', 'basis': 'EXACT', 'centre': 'centre, at the narrowest zoom (3 deg)', 'note': 'manual p5C photometric diagram: 3 deg 810,000 / 200,000 / 90,000 / 52,000 lux at 5 / 10 / 15 / 20 m; 32 deg 9,700 / 2,100 / 950 / 900 lux'},
        'model': {'archetype': 'moving-head', 'params': {
            'base_mm': [300, 344, 130], 'handles': True, 'arm_t_mm': 40, 'arm_w_mm': 150, 'arm_gap_mm': 15, 'tilt_axis_mm': 440,
            'head': {'shape': 'box', 'round': 0.2, 'width_mm': 270, 'depth_mm': 230, 'below_axis_mm': 140, 'above_axis_mm': 130, 'lens_mm': 150}}},
    }
    charts['acme-xp16r-bsw'] = chart('xp16r', kinds['xp16r'], 'acme-xp16r-bsw', xp_modes, f)

    # 5. Magmatic Magma Prime -------------------------------------------------------------------------------------------------
    f = fx['magmatic-magma-prime']
    mg_modes = {}
    for n, name in ((1, '1 CH'), (3, '3 CH'), (5, '5 CH')):
        m = mode_by(f, name)
        mg_modes[str(n)] = (f'{n} CH', channels_of('magmatic-magma-prime', m), m.get('note') or '', m.get('src'))
    kinds['magmaPrime'] = {
        'code': 'MAGMATIC-MAGMA-PRIME',
        'identified': "EXACT - Magmatic Effects' (Elation Professional) Magma Prime, from its user manual. Which fluid the rental holds is not confirmed",
        'product': 'Magmatic (Elation) Magma Prime hazer',
        'maker': 'Magmatic Effects (Elation Professional B.V.)', 'maker_basis': "the maker's own manual, read 2026-11-11", 'maker_model': 'Magma Prime',
        'manual': {'url': SOURCES['MAGMA-MAN']['url'], 'date': '(no date in the file)', 'read': f'{READ}, pdftotext p12, p14, p16', 'basis': 'EXACT'},
        'maker_chart': {'file': 'scripts/place/fixtures/charts/magmatic-magma-prime.json', 'modes': {k: 'EXACT' for k in mg_modes}},
        'look': 'A compact grey hazer box with a round nozzle in its front and the fluid tank inside.',
        'specs': {
            'size_mm': spec([338, 160, 400], 'MAGMA-MAN', order='L x W x H', note='manual p16: 13.3 x 6.30 x 15.70 in'),
            'weight_kg': spec(10.2, 'MAGMA-MAN', note='manual p16: 22.48 lbs'),
            'power_w': spec(700, 'MAGMA-MAN', note='manual p16 rated power; AC 120 V 60 Hz (US) or AC 230 V 50 Hz (EU) versions, breaker 9 A @ 120 V / 5 A @ 230 V'),
            'tank_l': spec(1.3, 'MAGMA-MAN', note='manual p16: fluid 1.3 L'),
            'fluid_ml_per_min': spec(3.4, 'MAGMA-MAN', note='manual, SPECIFICATIONS > PERFORMANCE: Fluid Consumption 0.115 oz/min (3.4 ml/min); max output 4,000 CFM'),
            'dmx_channels': spec([1, 3, 5], 'MAGMA-MAN', note="menu DMX SET > DMX Mode 1 / 3 / 5 (p12), table p14; the 1 CH list is read from the table layout (output volume), confirm on the unit"),
        },
        'modes_info': {k: {'label': v[0], 'note': v[2], 'page': v[3]} for k, v in mg_modes.items()},
        'model': {'archetype': 'hazer', 'params': {'box_mm': [160, 338, 290], 'nozzle_d_mm': 50}},
    }
    charts['magmatic-magma-prime'] = chart('magmaPrime', kinds['magmaPrime'], 'magmatic-magma-prime', mg_modes, f)
    return kinds, charts


def chart(kind_key, kind, fixture_id, modes, fixture, pixel_note=None):
    c = {
        'kind': kind_key, 'code': kind['code'], 'maker': kind['maker'], 'model': kind['maker_model'], 'manual': kind['manual'],
        'howToRead': "value ranges are [from, to, meaning] parsed from the maker's own text (`text` is that text, verbatim); `role` is di's role; `cap` / `default` only where the manual's range supports them (others are owed). Every mode here is read from the maker's manual (EXACT).",
        'modes': {},
    }
    if pixel_note:
        c['pixels'] = pixel_note
    for key, tup in modes.items():
        name, chans, note = tup[0], tup[1], tup[2]
        c['modes'][key] = {'status': 'EXACT', 'name': name, 'note': note or None, 'channels': chans}
        if len(tup) > 3 and tup[3]:
            c['modes'][key]['src'] = tup[3]
        if note is None or note == '':
            del c['modes'][key]['note']
    for key, m in c['modes'].items():
        if m['channels'] is not None and len(m['channels']) != int(key):
            raise SystemExit(f'{fixture_id} mode {key}: {len(m["channels"])} channels read')
    c['owed'] = OWED.get(fixture_id, [])
    return c


OWED = {
    'cp-aleda-beye-k10': ['shape macro slot names (manual p27-28 not transcribed)', 'macro colour table (p24; not carried as caps)', 'beam angle at the zoom ends (OFL range only)', 'zoom cap (degrees per DMX value)', 'which of K10 / K10 Easy the rented lamps are', 'pixel cell centres (p30: LED 1 centre, 2-7 first ring, 8-19 outer ring)'],
    'acme-pixel-line-ip': ['modes 35, 38, 70N, 119 of the datasheet (not in the manual copy)', 'physical cell order', 'frost cap (the manual says 128+ is full fog, so a linear curve is not stated)', 'revision / variant of the rented bars'],
    'acme-xp16r-bsw': ['colour and gobo slot names and counts (14 vs 29 colours, 17 vs 16 gobos: the manual disagrees with itself)', 'colour wheel / gobo slot caps', 'zoom direction (0-255 = 100%-0%: which end is narrow is not stated)', 'prism 2 cap', 'IP rating', 'whether the rented unit has 23 channels (no such XP-16R was found)'],
    'magmatic-magma-prime': ['which fluid the rental holds', 'confirm the 1 CH function on the unit'],
}


def render(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manuals', required=True)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    manuals = json.load(open(os.path.join(a.manuals, 'fixtures.json'), encoding='utf-8'))
    kinds, charts = build(manuals)
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    for k, v in SOURCES.items():
        manifest['sources'][k] = v
    for k, v in kinds.items():
        manifest['kinds'][k] = v
    files = {MANIFEST: render(manifest)}
    for fid, c in charts.items():
        files[os.path.join(CHARTS, f'{fid}.json')] = render(c)
    stale = [p for p, t in files.items() if not os.path.exists(p) or open(p, encoding='utf-8').read() != t]
    if a.check:
        print('check:', 'DIFFERENT ' + ', '.join(os.path.relpath(p) for p in stale) if stale else 'same')
        sys.exit(1 if stale else 0)
    for p, t in files.items():
        open(p, 'w', encoding='utf-8').write(t)
    print('wrote', ', '.join(os.path.relpath(p) for p in files))


if __name__ == '__main__':
    main()

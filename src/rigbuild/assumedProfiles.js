// ASSUMED DMX PROFILES — channel lists to TEST THE VISUALISER WITH while the real
// charts are owed. docs/architecture/RIG_BUILD.md §18.1.
//
// Why these exist. UPlight publishes no manual or DMX chart for any of the MOXIR codes
// (RIG_BUILD.md §13.8): the lamps have footprints and no channel lists, so a DMX value
// meant nothing to them and the room could not be driven from the desk. The owner asked
// for "channel lists to test with NOW". Each list below is the published chart of the
// CLOSEST DOCUMENTED EQUIVALENT — the stand-in manual already collected for that code in
// src/rigbuild/items/media.json — or, where no stand-in manual has a chart, an Open
// Fixture Library profile of the same class.
//
// What keeps them honest:
//   - every one is a SEPARATE mode, named `<n>ch-assumed`, beside the type's real
//     modes — the real `16ch` of UP-B380F keeps `channels: null` (owed). When the
//     rental house sends the chart, the real mode gets its list and the lamps are
//     switched back to it; this file's entry is deleted; nothing else changes;
//   - every one carries `assumed` words — "ASSUMED from <equivalent> manual p.N —
//     verify on the rental unit" — which the patch sheet, the plot, the desk's fixture
//     name and the visualiser all print;
//   - it is NEVER exported as the fixture's chart: gdtf.js leaves assumed modes out.
//
// Where a chart does not say something the room needs to draw it (a colour wheel whose
// slots the manual numbers but does not name, a strobe rate range, which end of the zoom
// is narrow), the gap is filled by a named second source or a stated assumption, in
// `fill` — never silently.
//
// The channel spec (read by src/rigbuild/dmxDecode.js):
//   { role, label, default?, cap? }
//   role     the DESK's role for that channel (serverXR/src/lighting/roles.js): the
//            desk's attribute editor, fader names and FX read it. Unique per mode.
//   default  the channel's resting value on the desk (a shutter that is 0 = CLOSED
//            rests open, pan/tilt rest at centre = home).
//   cap      what the value MEANS, where the room draws it:
//            { wheel: [{ from, to, colour, name } | { from, to, half: [a, b] } | { from, to, spin }] }
//            { shutter: [{ from, to, open: true|false } | { from, to, strobe: [hzLo, hzHi] }] }
//            { rate: [{ from, to, single: true } | { from, to, hz: [lo, hi] }] }
//            { zoom: { from, to, deg: [atFrom, atTo] } }
//            { cto: true }  { gobo: true }  { prism: true }  { haze: true }  { lamp: true }

// Colours for a wheel the manual numbers without naming: Clay Paky Sharpy's wheel in
// Open Fixture Library (MIT), in order — the 380 W "Sharpy-class" beam every one of
// these chassis descends from. An ASSUMPTION about the colours, stated as one.
const OFL_COMMIT = '4992b86027ee3cba19644bc7417435a68c8cdcb5'
const SHARPY = {
    what: 'Clay Paky Sharpy colour wheel, in order (Open Fixture Library, MIT)',
    url: `https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/${OFL_COMMIT}/fixtures/clay-paky/sharpy.json`,
    colours: [
        ['Red', '#c41c1a'], ['Orange', '#ed8229'], ['Aquamarine', '#7abd82'], ['Green', '#05822b'],
        ['Light Green', '#9ec233'], ['Lavender', '#8f73ad'], ['Pink', '#ed8080'], ['Yellow', '#ffed00'],
        ['Magenta', '#e30082'], ['Cyan', '#00a6eb'], ['CTO 260', '#f5c745'], ['CTO 190', '#f5d985'],
        ['CTB 8000', '#96c7b8'], ['Blue', '#004f99']
    ]
}
const OPEN = ['Open (white)', '#ffffff']

// A stepped wheel: `n` colours after open, each `step` values wide, a half position
// between each pair, then a last half back to open. Values as the chart prints them.
const steppedWheel = (n, step, colours) => {
    const slots = [OPEN, ...colours.slice(0, n)]
    const out = []
    for (let i = 0; i <= n * 2 + 1; i++) {
        const from = i * step
        const to = from + step - 1
        if (i % 2 === 0) {
            const [name, colour] = slots[i / 2]
            out.push({ from, to, name, colour })
        } else {
            const a = (i - 1) / 2
            const b = a + 1 <= n ? a + 1 : 0
            out.push({ from, to, half: [a, b] })
        }
    }
    return { slots: slots.map(([name, colour]) => ({ name, colour })), ranges: out }
}

const B380F_WHEEL = steppedWheel(13, 5, SHARPY.colours) // 0–139, per the chart p.6
const BSW_WHEEL = steppedWheel(7, 10, SHARPY.colours) // 0–159, per the chart p.14

const aux = (n, label) => ({ role: `aux${n}`, label })

export const ASSUMED_PROFILES = {
    'UP-B380F': {
        equivalent: 'UPlus Lighting "380 IP BEAM" (IP65, 371 W Osram lamp, 2°, pan 540° / tilt 270° 16-bit)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'searched 2026-09-29 (maker sites pro-uplight.com + uplight.com.cn, 2 made-in-china listings and their 10 description images, OFL, QLC+): no chart for UP-B380F anywhere. The UPlus body differs (finned head vs smooth drum, display on the arm vs the base, 424×367×725 mm 27 kg vs 460×310×690 mm 23 kg, 400 vs 450/500 W) — only the 16-channel count and 540°/270° match. The maker lists ONE mode, 16ch (uplight.com.cn pd45714311)',
        manual: { title: '"380 IP BEAM" user manual', url: 'https://www.upluslighting.com/wp-content/uploads/2024/01/380-IP-BAEM.pdf', pages: '6–8', sha256: '31712c3ae62a1dec0ed39601dd720e90df0eedb75b2ae178dfcce231dccf974a', accessed: '2026-09-29' },
        assumed: 'ASSUMED from UPlus 380 IP BEAM manual p.6–8 — verify on the rental unit',
        fill: [
            'colour wheel slots are numbered, not named, in the chart: colours taken in order from the Clay Paky Sharpy wheel (OFL) — ASSUMED',
            'strobe 51–240 "slow to fast": 1–25 Hz from the spec page ("Strobe: 0-25Hz", p.4); 5–50 and 241–251 are not in the chart and are drawn open',
            'pan/tilt: DMX centre (32768) is home — beam straight out of the base (up standing, down hung); the range is the type\'s 540°/270°',
            'CH16 lamp on/off is not drawn: the room assumes the lamp struck'
        ],
        modes: [{
            name: '16ch-assumed',
            channels: [
                { role: 'color', label: 'Colour wheel', default: 0, cap: { wheel: B380F_WHEEL.ranges.concat([{ from: 140, to: 199, spin: 'forward' }, { from: 200, to: 255, spin: 'reverse' }]) } },
                { role: 'strobe', label: 'Shutter / strobe', default: 255, cap: { shutter: [{ from: 0, to: 0, open: false }, { from: 1, to: 50, open: true }, { from: 51, to: 240, strobe: [1, 25] }, { from: 241, to: 255, open: true }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'gobo', label: 'Gobo wheel', cap: { gobo: true } },
                { role: 'prism', label: 'Prism', cap: { prism: true } },
                { role: 'rotation', label: 'Prism 1 rotation' },
                aux(1, 'Prism 2 rotation'),
                { role: 'frost', label: 'Frost' },
                { role: 'focus', label: 'Focus' },
                { role: 'pan', label: 'Pan', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tilt', label: 'Tilt', default: 128 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'speed', label: 'Pan/tilt speed' },
                { role: 'control', label: 'Reset' },
                { ...aux(2, 'Lamp on/off'), cap: { lamp: true } }
            ]
        }]
    },
    'UP-250BSW': {
        equivalent: 'Aolait "250W LED 3IN1 BSW Moving Head Light" (250 W white LED, pan 540° / tilt 270° + fine, 3-facet prism)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'searched 2026-09-29 (all 11 UP-250BSW listings, 125 description images, both maker sites, QLC+, OFL, Google): no 24ch or 30ch chart anywhere. The Aolait unit is a DIFFERENT fixture (no LED ring, other base and yoke, 17/20ch) — kept only so the desk can test; never patch the rental unit by it',
        manual: { title: '250W LED SPOT moving head user manual', url: 'https://aolait.com/wp-content/uploads/2020/11/250W-LED-SPOT-Moving-Head-Light-user-manual.pdf', pages: '13–17', sha256: '251282d3b67d69ccf87b43ef92dc302ca1eb87be9d00797b3bd165ff1ffde062', accessed: '2026-09-28' },
        assumed: 'ASSUMED from Aolait 250W LED BSW manual p.13–17 (its 17ch mode — UP-250BSW publishes 24/30ch) — verify on the rental unit',
        fill: [
            'the equivalent has 17/20ch modes, not UP-250BSW\'s 24/30: its 17ch is used as its own mode, so the footprint is 17',
            'colour wheel slots numbered, not named: Clay Paky Sharpy wheel order (OFL) — ASSUMED',
            'strobe rates are not printed: 4–103 drawn as 1–20 Hz (ASSUMED)',
            'zoom 0–255 drawn 10°→30° (the type\'s published zoom); which end is narrow is ASSUMED',
            'pan/tilt: DMX centre is home; range 540°/270° (the type\'s, itself ASSUMED for the class)'
        ],
        modes: [{
            name: '17ch-assumed',
            channels: [
                { role: 'pan', label: 'Pan (X)', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tilt', label: 'Tilt (Y)', default: 128 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'speed', label: 'XY speed' },
                { role: 'strobe', label: 'Shutter / strobe', default: 255, cap: { shutter: [{ from: 0, to: 3, open: false }, { from: 4, to: 103, strobe: [1, 20] }, { from: 104, to: 107, open: true }, { from: 108, to: 207, strobe: [1, 20] }, { from: 208, to: 212, open: true }, { from: 213, to: 251, strobe: [2, 12] }, { from: 252, to: 255, open: true }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'color', label: 'Colour wheel', default: 0, cap: { wheel: BSW_WHEEL.ranges.concat([{ from: 160, to: 205, spin: 'forward' }, { from: 206, to: 209, spin: 'stop' }, { from: 210, to: 255, spin: 'reverse' }]) } },
                { role: 'gobo', label: 'Gobo wheel', cap: { gobo: true } },
                { role: 'gobo2', label: 'Rotating gobo', cap: { gobo: true } },
                { role: 'rotation', label: 'Gobo rotation' },
                { role: 'zoom', label: 'Zoom', cap: { zoom: { from: 0, to: 255, deg: [10, 30] } } },
                { role: 'focus', label: 'Focus' },
                { role: 'frost', label: 'Frost' },
                { role: 'prism', label: 'Prism', cap: { prism: true } },
                aux(1, 'Prism rotation'),
                { role: 'control', label: 'Reset' }
            ]
        }]
    },
    'UP-HK1915': {
        equivalent: 'Aolait AL1019WR "19x15W Bee-Eye LED Beam Wash Zoom" (19 × 15 W RGBW, zoom 4°–60°)',
        grade: 'EQUIVALENT',
        gradeWhy: 'same OEM body (the Clay Paky B-EYE K10 clone): the Aolait manual lists exactly the 21/23/35/78/92/97/99 modes UPlight\'s own listings give, calls the fixture "HAWKEYE II" (UPlight sells "Hawk Eye"), and its drawings match UPlight\'s photos (19 hex lenses, cross of 4 keys on a mono LCD, powerCON in/out, 3-pin DMX). Differs: tilt 270° vs UPlight\'s 230°, 450 vs 350 W. Researched 2026-09-29',
        manual: { title: '19X15W LED Bee-Eye user manual', url: 'https://aolait.com/wp-content/uploads/2020/11/19X15W-Led-Bee-Eye-User-Manual.pdf', pages: '8 (printed 8/20)', sha256: '7a0906f76348e49b8fd7833927c7ac30cfc97019cd0b046d2ccf629a6386ef82', accessed: '2026-09-28' },
        assumed: 'ASSUMED from Aolait AL1019WR bee-eye manual p.8 — verify on the rental unit',
        fill: [
            'the footprint matches UP-HK1915\'s published 21ch — the ORDER is the equivalent\'s',
            'strobe rates are not printed: 4–203 drawn as 1–20 Hz (ASSUMED); 204–255 random, drawn at 8 Hz',
            'CTO "linear colour temperature": 0 = none, 255 = full warm (ASSUMED direction)',
            'zoom 0–255 drawn 4°→60° (the type\'s published range); which end is narrow is ASSUMED',
            'pan/tilt: DMX centre is home; range 540°/230° (the type\'s)'
        ],
        modes: [{
            name: '21ch-assumed',
            channels: [
                { role: 'r', label: 'Red' }, aux(1, 'Red fine'),
                { role: 'g', label: 'Green' }, aux(2, 'Green fine'),
                { role: 'b', label: 'Blue' }, aux(3, 'Blue fine'),
                { role: 'w', label: 'White', default: 0 }, aux(4, 'White fine'),
                { ...aux(5, 'CTO'), cap: { cto: true } },
                { role: 'macro', label: 'Macro colour' },
                { role: 'strobe', label: 'Shutter / strobe', default: 0, cap: { shutter: [{ from: 0, to: 3, open: true }, { from: 4, to: 203, strobe: [1, 20] }, { from: 204, to: 255, strobe: [8, 8] }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'dimmerFine', label: 'Dimmer fine', default: 0 },
                { role: 'pan', label: 'Pan', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tilt', label: 'Tilt', default: 128 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'control', label: 'Function' },
                aux(6, 'Reset'),
                { role: 'zoom', label: 'Zoom', cap: { zoom: { from: 0, to: 255, deg: [4, 60] } } },
                { role: 'rotation', label: 'Zoom lens rotation' }
            ]
        }]
    },
    'UP-PL5403': {
        equivalent: 'UPlus Lighting "IP PAR-54X3" (54 × 3 W RGBW, 25°, IP65)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'searched 2026-09-29: the maker lists ONE mode, 8 channels (uplight.com.cn pd48298011, "8通道模式"), and publishes no order. The UPlus body differs (298×282×157 mm 5 kg vs 290×230×260 mm 5.9 kg / 310×310×330 mm 8 kg) — a generic RGBW-PAR stand-in only',
        manual: { title: '"IP PAR-54X3" user manual', url: 'https://www.upluslighting.com/wp-content/uploads/2024/01/IP-PAR-54X3.pdf', pages: '6', sha256: '66619bec1668b4424b2338520db23e7543ae5bccfcc537cebda0beb4be7243a6', accessed: '2026-09-29' },
        assumed: 'ASSUMED from UPlus IP PAR-54X3 manual p.6 — verify on the rental unit',
        fill: [
            'strobe "slow to fast" rates are not printed: 1–255 drawn as 1–20 Hz, 0 = no strobe (ASSUMED)',
            'CH7 function 0–50 = the channels drive the light; the built-in programs above 50 are not drawn'
        ],
        modes: [{
            name: '8ch-assumed',
            channels: [
                { role: 'dimmer', label: 'Total dimmer' },
                { role: 'r', label: 'Red' }, { role: 'g', label: 'Green' }, { role: 'b', label: 'Blue' },
                { role: 'w', label: 'White', default: 0 },
                { role: 'strobe', label: 'Total strobe', default: 0, cap: { shutter: [{ from: 0, to: 0, open: true }, { from: 1, to: 255, strobe: [1, 20] }] } },
                { role: 'control', label: 'Function choice' },
                { role: 'speed', label: 'Function speed' }
            ]
        }, {
            name: '4ch-assumed',
            channels: [{ role: 'r', label: 'Red' }, { role: 'g', label: 'Green' }, { role: 'b', label: 'Blue' }, { role: 'w', label: 'White', default: 0 }]
        }]
    },
    'UP-COB200': {
        equivalent: 'FOS Technologies "PAR COB 200W LED TW" (200 W warm + cool white COB, 60°)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'the maker lists 4 channels (its made-in-china store, "Channel 4CH", read 2026-09-29) and publishes no order; the FOS unit is the same class (tunable-white 200 W COB PAR, 290 × 260 × 305 mm, 4.9 kg vs 295 × 295 × 350 mm, 5.1 kg) — a stand-in only',
        manual: { title: '"PAR COB 200W LED TW" user manual', url: 'https://www.fos-lighting.eu/uploads/products_1_2_1_61.pdf', pages: '5', sha256: 'd50487773376424a313b68f4ad67044e852ab5b5484543bf0df9c81cbf6d2a92', accessed: '2026-09-29' },
        assumed: 'ASSUMED from FOS PAR COB 200W LED TW manual p.5 (mode a4CH) — verify on the rental unit',
        fill: ['strobe "gradual from slow to fast" rates are not printed: 5–255 drawn as 1–25 Hz (the UPlight listing\'s "1~25 flashes/second"), 0–4 = open'],
        modes: [{
            name: '4ch-assumed',
            channels: [
                { role: 'dimmer', label: 'Master dimmer' },
                { role: 'warm', label: 'Warm white' },
                { role: 'cool', label: 'Cold white' },
                { role: 'strobe', label: 'Strobe', default: 0, cap: { shutter: [{ from: 0, to: 4, open: true }, { from: 5, to: 255, strobe: [1, 25] }] } }
            ]
        }]
    },
    'EXT-STROBE': {
        equivalent: 'Martin Atomic 3000 (its 4-channel mode is the Atomic 3000 LED\'s "Atomic 3000 compatible" mode)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'no strobe is chosen yet (another supplier), and no Yerevan rental lists one (checked 2026-09-29): a planning type',
        manual: { title: 'Open Fixture Library: Martin Atomic 3000, "4-channel"', url: `https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/${OFL_COMMIT}/fixtures/martin/atomic-3000.json`, pages: 'mode "4-channel"', accessed: '2026-09-29', licence: 'MIT (Open Fixture Library)' },
        assumed: 'ASSUMED from Martin Atomic 3000 4-channel (Open Fixture Library) — verify on the rental unit',
        fill: ['flash rate 6–255 = 0.5–25 Hz and 0–5 = single flash, as OFL gives them; effects (ramps, random) drawn as a plain strobe'],
        modes: [{
            name: '4ch-assumed',
            channels: [
                { role: 'dimmer', label: 'Intensity' },
                aux(1, 'Flash duration'),
                { role: 'speed', label: 'Flash rate', cap: { rate: [{ from: 0, to: 5, single: true }, { from: 6, to: 255, hz: [0.5, 25] }] } },
                { role: 'control', label: 'Effects' }
            ]
        }]
    },
    'EXT-BLINDER': {
        equivalent: 'Chauvet Professional STRIKE 4',
        grade: 'STILL ASSUMED',
        gradeWhy: 'no blinder is chosen yet (another supplier), and no Yerevan rental lists one (checked 2026-09-29): a planning type',
        manual: { title: 'STRIKE 4 DMX chart', url: 'https://chauvetprofessional.com/wp-content/uploads/2015/07/Strike_4_DMX_EN_Rev1_WO.pdf', pages: '1', accessed: '2026-09-29' },
        assumed: 'ASSUMED from Chauvet STRIKE 4 DMX chart p.1 — verify on the rental unit',
        fill: ['strobe 11–132 "0–20 Hz (all pods)" drawn 1–20 Hz; 133–255 random macros drawn at 8 Hz'],
        modes: [{
            name: '3ch-assumed',
            channels: [
                { role: 'dimmer', label: 'Dimmer H' },
                { role: 'dimmerFine', label: 'Dimmer L', default: 0 },
                { role: 'strobe', label: 'Strobe', default: 0, cap: { shutter: [{ from: 0, to: 10, open: true }, { from: 11, to: 132, strobe: [1, 20] }, { from: 133, to: 255, strobe: [8, 8] }] } }
            ]
        }, {
            name: '1ch-assumed',
            channels: [{ role: 'dimmer', label: 'Dimmer H' }]
        }]
    },
    'EXT-HAZER': {
        equivalent: 'Antari HZ-1000',
        grade: 'STILL ASSUMED',
        gradeWhy: 'no hazer is chosen yet (another supplier), and no Yerevan rental lists one (checked 2026-09-29): a planning type',
        manual: { title: 'HZ-1000 user manual', url: 'https://www.antari.com/usermanual/HZ/HZ-1000/HZ-1000.pdf', pages: '7 (printed 5)', accessed: '2026-09-29' },
        assumed: 'ASSUMED from Antari HZ-1000 manual p.7 — verify on the rental unit',
        fill: ['haze is not drawn in the room yet; the channels are patched so the desk can drive a real unit'],
        modes: [{
            name: '2ch-assumed',
            channels: [
                { role: 'aux1', label: 'Haze output', cap: { haze: true } },
                { role: 'speed', label: 'Fan' }
            ]
        }]
    },
    'UP-YZ31P': {
        equivalent: 'Antari Z-1500 III fog machine',
        grade: 'STILL ASSUMED',
        gradeWhy: 'UP-YZ31P is on neither maker site (2026-09-29); UPlight\'s own multi-angle smoke machines (UP-F1500D … 3000DL) are 2ch — candidates for the rental house to confirm, not an identification',
        manual: { title: 'Z-1500 III / Z-3000 III user manual', url: 'https://antari.com/wp-content/uploads/Z-1500lllC.pdf', pages: '8', sha256: '3df177a72b7a6d1f98d42dc882671f00b74d9dbdf335bbc45ee1f7e79819aa17', accessed: '2026-09-28' },
        assumed: 'ASSUMED from Antari Z-1500 III manual p.8 — verify on the rental unit',
        fill: ['fog is not drawn in the room'],
        modes: [{ name: '1ch-assumed', channels: [{ role: 'aux1', label: 'Fog output', cap: { haze: true } }] }]
    },
    'UP-Q108S': {
        equivalent: 'MagicFX PSYCO2JET (the collected MagicFX CO2jet II manual has no DMX table; same maker, same class)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'UP-Q108S is on neither maker site (2026-09-29); UPlight\'s DMX CO2 column machines are UP-QZ150Y/QZ250Y/QZ12L/QZ18L (no channel count printed)',
        manual: { title: 'Open Fixture Library: MagicFX PSYCO2JET, "Raw"', url: `https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/${OFL_COMMIT}/fixtures/magicfx/psyco2jet.json`, pages: 'mode "Raw"', accessed: '2026-09-29', licence: 'MIT (Open Fixture Library)' },
        assumed: 'ASSUMED from MagicFX PSYCO2JET "Raw" (Open Fixture Library) — verify on the rental unit',
        fill: ['CO₂ is not drawn in the room; a static CO2jet II ignores the angle channel'],
        modes: [{ name: '3ch-assumed', channels: [{ role: 'tilt', label: 'Angle', default: 128 }, { role: 'speed', label: 'Speed' }, aux(1, 'Output (valve ≥ 200)')] }]
    },
    'UP-LA40WF': {
        equivalent: 'Laserworld CS-1000RGB (an RGB animation laser; the Blue Sea BLLO-RGB40 publishes no chart)',
        grade: 'STILL ASSUMED',
        gradeWhy: 'the unit is identified — UPlight\'s own page (uplight.com.cn pd48855201) names UP-LA40WF, DMX512/ILDA — but publishes no DMX mode or chart (checked 2026-09-29)',
        manual: { title: 'Open Fixture Library: Laserworld CS-1000RGB, "11-channel"', url: `https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/${OFL_COMMIT}/fixtures/laserworld/cs-1000rgb.json`, pages: 'mode "11-channel"', accessed: '2026-09-29', licence: 'MIT (Open Fixture Library)' },
        assumed: 'ASSUMED from Laserworld CS-1000RGB 11-channel (Open Fixture Library) — verify on the rental unit',
        fill: ['the laser is not drawn in the room; laser safety (IEC 60825-1, audience scanning) is a separate sign-off'],
        modes: [{
            name: '11ch-assumed',
            channels: [
                { role: 'control', label: 'Mode' }, aux(1, 'Pattern'), aux(2, 'Circular movement'), aux(3, 'Y rotation'),
                aux(4, 'X rotation'), aux(5, 'Horizontal movement'), aux(6, 'Vertical movement'), { role: 'zoom', label: 'Manual zoom' },
                aux(7, 'Pattern buildup'), { role: 'strobe', label: 'Dot effect / strobe' }, { role: 'color', label: 'Colour' }
            ]
        }]
    }
}

/** The assumed modes for a crew code, as type modes (the shape fixtureTypes carries). */
export const assumedModesOf = (code) => {
    const entry = ASSUMED_PROFILES[code]
    if (!entry) return []
    return entry.modes.map((m) => ({
        name: m.name,
        footprint: m.channels.length,
        channels: m.channels.map((c) => ({ ...c })),
        channelsSource: {
            basis: 'ASSUMED',
            grade: entry.grade || 'STILL ASSUMED',
            gradeWhy: entry.gradeWhy || null,
            fixture: entry.equivalent,
            url: entry.manual.url,
            title: entry.manual.title,
            pages: entry.manual.pages,
            ...(entry.manual.sha256 ? { sha256: entry.manual.sha256 } : {}),
            ...(entry.manual.licence ? { licence: entry.manual.licence } : {}),
            accessed: entry.manual.accessed,
            fill: entry.fill.slice()
        },
        assumed: entry.assumed,
        src: null,
        basis: 'ASSUMED'
    }))
}

/** Is this a test mode (assumed), not the maker's? */
export const isAssumedMode = (mode) => Boolean(mode && (mode.basis === 'ASSUMED' || mode.assumed))

export const ASSUMED_WHEEL_SOURCE = SHARPY

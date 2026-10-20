// FIXTURE TYPES — what a crew calls "the fixture": maker + model, its DMX modes,
// its power and weight, its body and its optics, each number with a source.
// docs/architecture/RIG_BUILD.md §2.1. A type is library data, never an entity;
// a lamp in the room points at one by id (`components.fixture.type`).
//
// A type library is GENERATED from a sourced manifest (the first one is MOXIR's,
// scripts/place/fixtures/fixtures.json) by `typesFromManifest` below — run by
// scripts/rigbuild/types.mjs and checked by a test that regenerates the committed
// file and compares, so the two can never drift.
//
// The rule that matters most: nothing is invented. A mode is a footprint the
// maker (or a named equivalent) publishes; a channel LIST is carried only where a
// source gives one (Open Fixture Library, a manual) and is otherwise null and said
// to be owed. A type with no mode at all is `modesOwed` and its lamps can never be
// given an address.

// Channel lists taken from Open Fixture Library (MIT), pinned to the commit the
// manifest was checked at. Keyed by the crew code of the type it is attached to;
// `fixture` says which OFL fixture it is and whether that is the fixture itself or
// the named equivalent the manifest models it on. Each entry names the OFL
// channel, in order, and becomes the desk profile's role (the desk's own
// alphabet: letters, digits, _ and -).
import { assumedModesOf, isAssumedMode } from './assumedProfiles.js'

const OFL_COMMIT = '4992b86027ee3cba19644bc7417435a68c8cdcb5'
export const OFL_CHANNEL_LISTS = {
    'UP-YH600F': {
        fixture: 'Showven Sparkular (BT01)',
        basis: 'EQUIVALENT',
        url: `https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/${OFL_COMMIT}/fixtures/showven/sparkular.json`,
        licence: 'MIT (Open Fixture Library)',
        modes: {
            // OFL "Sparkular (BT01)", mode "Default": Fountain (0-15 off, then height
            // steps), Control (arming/safety).
            2: [
                { role: 'Fountain', label: 'Fountain height' },
                { role: 'Control', label: 'Control' }
            ]
        }
    }
}

// Channel lists TESTED on the rental units themselves (manifest source SEVAN): the
// same UPlight rental gear ran live at the Sevan festival (Dilijan camp) on the
// studio's Art-Net desk, and the owner confirmed it as MOXIR's units on 2026-10-01.
// These are the maker's modes, not stand-ins: they win over OFL and fill the real
// mode (the ASSUMED ones stay after it, RIG_BUILD.md §18.1). Order and meanings are
// the desk's profiles as patched and run there; a meaning nobody wrote down stays a
// plain `c<n>`/aux channel, never guessed. Roles are unique within a mode.
const SEVAN = {
    fixture: 'the rental unit itself (Sevan festival rig, Dilijan camp, 2026)',
    basis: 'TESTED',
    url: null,
    licence: null
}
const laserChannel = (n, label) => ({ role: `c${n}`, label })
// The colour slots of the U-Plus laser's ch 5 (IP-LL30 manual, "Selection of color"; slot centres are what the tested desk used)
const LASER_COLOURS = [
    { from: 0, to: 16, colour: '#ffffff', name: 'white' }, { from: 17, to: 33, colour: '#ff0000', name: 'red' },
    { from: 34, to: 50, colour: '#00ff00', name: 'green' }, { from: 51, to: 67, colour: '#0000ff', name: 'blue' },
    { from: 68, to: 84, colour: '#ffff00', name: 'yellow' }, { from: 85, to: 101, colour: '#ff00ff', name: 'purple' },
    { from: 102, to: 118, colour: '#00ffff', name: 'cyan' }
]
export const TESTED_CHANNEL_LISTS = {
    'UP-PL5403': {
        ...SEVAN,
        modes: {
            // Desk profile "Wash 8ch". Channels 7-8 were never used there and their
            // meaning was not written down: aux, not guessed.
            8: [
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'r', label: 'Red' },
                { role: 'g', label: 'Green' },
                { role: 'b', label: 'Blue' },
                { role: 'w', label: 'White' },
                { role: 'strobe', label: 'Strobe' },
                // U-Plus IP PAR-54X3 8-ch chart (APPROVED by the owner 2026-10-15, scripts/place/fixtures/charts/up-pl5403.json): 7 = function
                // choice (0-50 = channels 1-7 control), 8 = its speed. The desk never uses them: both rest at 0, so
                // the colour is the one set on channels 1-6. Roles stay aux1/aux2 (a desk that holds this profile keeps it).
                { role: 'aux1', label: 'Function choice (0 = channels 1-7 control; 51-255 built-in programs, never sent)', default: 0 },
                { role: 'aux2', label: 'Function speed (0; never sent)', default: 0 }
            ]
        }
    },
    'UP-LA40WF': {
        ...SEVAN,
        modes: {
            // Desk profile "Laser 32ch". Ch 1 is named dimmer (as on that desk) so master
            // and blackout reach it. The per-colour dimmers run 0 = BRIGHTEST, so they are
            // plain channels, never the r/g/b roles. A laser is held dark by
            // deskLookValues.js (every channel 0) until the IEC 60825-1 sign-off.
            // STATIC BEAM (the entry lasers, one fixed beam each, 2026-10-15): the channels REST at the
            // values a static beam needs, so only ch 1 (dimmer) decides lit or dark — ch 2 = 200 (built-in
            // graphics), ch 3 = 0 (graphic 1, the first of the chart: the manual lists no graphic names, so which one is a
            // single line or dot is ASSUMED, walk it on setup day), ch 4 = 0 (normal display; owner 2026-10-15),
            // ch 5 colour (cap.laserColour), ch 6/7 position from the aim (cap.aim: 0-125 by hand, 64 = centre,
            // the scan half-angle is fixtures.json laser.scan_field_half_deg, ASSUMED), ch 16-18 = 0 (brightest),
            // everything else 0, ch 20-32 = 0 (the second graphic stays off). Maker chart:
            // scripts/place/fixtures/charts/up-la40wf.json (APPROVED by the owner 2026-10-15 as the IP-LL40 in 32-ch mode; the PRINTED manual with the unit, photographed 2026-10-16, agrees row for row — its misprints are in the chart file; the tested values below agree with it).
            32: [
                { role: 'dimmer', label: 'Ch 1 output (named dimmer so master/blackout reach it)', default: 0 }, // a laser RESTS dark: with no look on the desk it must emit nothing (MOXIR 2026-10-17: a cleared desk fell back to full)
                { ...laserChannel(2, 'Mode (0-49 auto, 50-99 voice, 100-149 PRG, 150-199 ILD, built-in graphics 200-255 by the PDF, 250-255 by the printed manual; static beam 250 — inside both)'), default: 250 },
                { ...laserChannel(3, 'Graphic select (one graphic per two values; static beam 0 = graphic 1)'), default: 0 },
                { ...laserChannel(4, 'Display mode (0 normal, 64 highlight, 128 segmented, 192 point display; static beam 0)'), default: 0 },
                { ...laserChannel(5, 'Colour (0-16 white, 17 red, 34 green, 51 blue, 68 yellow, 85 purple, 102 cyan; static beam 8 white)'), default: 8, cap: { laserColour: LASER_COLOURS } },
                { ...laserChannel(6, 'X position (0-125 by hand, 64 centre)'), default: 64, cap: { aim: { axis: 'x', from: 0, to: 125, centre: 64, halfDeg: 18.5, basis: 'ASSUMED — scan_field_half_deg, fixtures.json' } } },
                { ...laserChannel(7, 'Y position (0-125 by hand, 64 centre)'), default: 64, cap: { aim: { axis: 'y', from: 0, to: 125, centre: 64, halfDeg: 18.5, basis: 'ASSUMED — scan_field_half_deg, fixtures.json' } } },
                laserChannel(8, 'Zoom (0-10 none, 11-87 by hand, 88-150 zoom, 151-200 zoom out, 201-255 loop)'),
                laserChannel(9, 'X rotation (0 none, 1-128 by hand, 129-255 auto)'),
                laserChannel(10, 'Y rotation (0 none, 1-128 by hand, 129-255 auto)'),
                laserChannel(11, 'Centre rotation (0 none, 1-128 by hand, 129-192 clockwise, 193-255 counter-clockwise; 150 = slow clockwise, tested)'),
                laserChannel(12, 'Gradual painting (0-10 none, 10-74 by hand, 75-104 grow, 105-144 fade, 145-184 loop fade, 185-224 / 225-255 end-to-end draw)'),
                laserChannel(13, 'X wave (0-9 none, 10-69 small, 70-129 medium, 130-189 large, 190-255 maximum)'),
                laserChannel(14, 'Y wave (0-9 none, 10-69 small, 70-129 medium, 130-189 large, 190-255 maximum)'),
                laserChannel(15, 'Strobe (0-10 none, 11-199 auto slow to fast, 200-255 by sound)'),
                laserChannel(16, 'Red level (0 brightest)'),
                laserChannel(17, 'Green level (0 brightest)'),
                laserChannel(18, 'Blue level (0 brightest)'),
                laserChannel(19, 'Out-of-bounds (0-49 rebound, 50-99 to a line, 100-149 blanking, 150-255 pass through)'),
                ...Array.from({ length: 13 }, (_, i) => laserChannel(20 + i, i === 2 ? 'Graphic 2 colour (mirror ch 5)' : `Graphic 2, ch ${20 + i}`))
            ]
        }
    }
}

// ARCHIVED modes: kept selectable (`mode: 'walk-2026-10-09'`, `mode: 'pdf-380-ip-beam-2026-10-15'`), never the default,
// never exported (gdtf.js). Each carries its reason (owner's rule 2026-10-15: every mark reads APPROVED or ARCHIVED).
// A code may keep several (an array); the resolver takes one or many.
export const ARCHIVED_CHANNEL_LISTS = {
    'UP-B380F': [{
        name: 'walk-2026-10-09',
        footprint: 16,
        reason: 'the desk profile walked on Sevan units 2026-10-09 (ch 1-10). The printed manual with the unit (owner 2026-10-16) has this SAME order and is the default with the manual\'s value ranges; the walk stays for the record (its caps were ASSUMED where the manual now states them)',
        ...SEVAN,
        modes: {
            // Desk profile "Beam 16ch", the map from its manual: strobe 255 = open,
            // 0-3 = dark; colour 0 = white, 12 = colour 1…; gobo 5-89 = gobo 1-17,
            // 171+ = shake; prism 1 in at 128+; RESET must stay 0.
            16: [
                { role: 'pan', label: 'Pan', default: 128 },
                { role: 'tilt', label: 'Tilt', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'speed', label: 'Pan/tilt speed' },
                // frost's curve is not on the chart: read as linear (beamOptics.js)
                { role: 'frost', label: 'Frost', cap: { frost: { basis: 'ASSUMED — linear, 0 clear … 255 full; the chart states no curve' } } },
                { role: 'strobe', label: 'Shutter / strobe (255 open, 0-3 dark)', default: 255, cap: { shutter: [{ from: 0, to: 3, open: false }, { from: 255, to: 255, open: true }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'color', label: 'Colour wheel (0 white, 12 colour 1…)', default: 0 },
                // gobo 5-89 = gobos 1-17 and 171+ = shake are the chart's (TESTED); the
                // even five-value slots inside 5-89 (5-9 gobo 1, 10-14 gobo 2 …) are DERIVED,
                // not stated; 90-170 is left unmapped rather than guessed
                { role: 'gobo', label: 'Gobo (5-89 gobo 1-17, 171+ shake)', cap: { gobo: true, goboSlots: { from: 5, to: 89, count: 17, basis: 'TESTED range; slots DERIVED' }, goboShake: { from: 171, basis: 'TESTED' } } },
                // 128+ in is the chart's (TESTED); 16 facets from the spec (fixtures.json)
                { role: 'prism', label: 'Prism 1 insert (128+ in)', cap: { prism: true, prismIn: { from: 128, facets: 16, basis: 'TESTED threshold' } } },
                { role: 'rotation', label: 'Prism 1 rotation', cap: { prismRotation: { prism: 1, basis: 'ASSUMED — index or spin not stated; read as an index, 0…255 → 0…360°' } } },
                { role: 'aux1', label: 'Prism 2', cap: { prism2: { kind: 'honeycomb', in: { from: 128 }, basis: "ASSUMED — prism 1's threshold" } } },
                { role: 'aux2', label: 'Prism 2 rotation', cap: { prismRotation: { prism: 2, basis: 'ASSUMED — index or spin not stated; read as an index, 0…255 → 0…360°' } } },
                { role: 'focus', label: 'Focus' },
                { role: 'control', label: 'Reset (always 0)', default: 0 }
            ]
        }
    }, {
        name: 'pdf-380-ip-beam-2026-10-15',
        footprint: 16,
        reason: 'the downloaded U-Plus "380 IP BEAM" PDF chart (pan ch 10, colour first), approved 2026-10-15 from a product page; NOT the unit\'s chart — the printed manual with the unit (owner 2026-10-16) has pan on ch 1. Kept so a desk that holds this profile still decodes',
        fixture: 'U-Plus IP65 380W Beam, PDF manual "380 IP BEAM" (upluslighting.com 2024-01) — ARCHIVED 2026-10-16',
        basis: 'ARCHIVED',
        url: 'https://www.upluslighting.com/wp-content/uploads/2024/01/380-IP-BAEM.pdf',
        licence: null,
        modes: {
            16: [
                { role: 'color', label: 'Colour wheel (0 white, 10-14 colour 1 … 130-134 colour 13, 140+ rotate)', default: 0 },
                { role: 'strobe', label: 'Strobe (0 close, 1-4 open, 51-240 slow to fast, 252-255 open)', default: 255, cap: { shutter: [{ from: 0, to: 0, open: false }, { from: 1, to: 4, open: true }, { from: 252, to: 255, open: true }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'gobo', label: 'Gobo (0-4 white, 5-69 gobo 1-13, 191+ shake)', cap: { gobo: true, goboSlots: { from: 5, to: 69, count: 13, basis: 'APPROVED chart: 5-wide slots stated' }, goboShake: { from: 191, basis: 'APPROVED chart' } } },
                { role: 'prism', label: 'Prism (0-63 none, 64 prism 1, 128 prism 2, 192 both)', cap: { prism: true, prismIn: { from: 64, facets: 16, basis: 'APPROVED chart for the thresholds; which prism is 8 or 16 facets is ASSUMED' } } },
                { role: 'rotation', label: 'Prism 1 rotation (0-127 angle, 128+ spin)', cap: { prismRotation: { prism: 1, basis: 'APPROVED chart; read as an index 0…255 → 0…360° (0-127 = 0-400°)' } } },
                { role: 'aux1', label: 'Prism 2 rotation (0-127 angle, 128+ spin)', cap: { prismRotation: { prism: 2, basis: 'APPROVED chart; read as an index 0…255 → 0…360°' } } },
                { role: 'frost', label: 'Frost (0-127 none, 128-191 frost, 192-255 colourful)', cap: { frost: { from: 128, to: 191, basis: 'APPROVED chart: an insert, not a curve' } } },
                { role: 'focus', label: 'Focus' },
                { role: 'pan', label: 'Pan', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tilt', label: 'Tilt', default: 128 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'speed', label: 'Pan/tilt speed' },
                { role: 'control', label: 'Reset (26-76 effects, 77-127 XY, 128+ all; always 0)', default: 0 },
                { role: 'lamp', label: 'Lamp (10-100 off, 101-255 on; the desk never sends it, 0)', default: 0 }
            ]
        }
    }]
}
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/

// The id every lamp uses: the rental/crew code, lowercased. A code, not a
// maker.model, because the code is what the rental list, the crew and the plot
// all say, and it does not change when the real maker behind a rental label is
// finally found (only `maker`/`model` do).
export const typeIdOf = (code) => String(code || '').trim().toLowerCase().replace(/\s+/g, '-')

const specValue = (spec) => (spec && typeof spec === 'object' ? spec.value ?? null : null)

const sourced = (spec) => {
    if (!spec || typeof spec !== 'object' || spec.value == null) return null
    const out = { value: spec.value, src: spec.src ?? null, basis: spec.basis ?? null }
    if (spec.order) out.order = spec.order
    if (spec.note) out.note = spec.note
    return out
}

const modeName = (footprint) => `${footprint}ch`

// Modes from the manifest's `dmx_channels` (a list of footprints). A channel list
// is attached where the unit was tested (TESTED_CHANNEL_LISTS, first) or OFL has
// the fixture (or its named equivalent) with a mode of that footprint.
const modesOf = (kind) => {
    const spec = kind.specs?.dmx_channels
    const list = Array.isArray(spec?.value) ? spec.value.filter((n) => Number.isInteger(n) && n > 0) : []
    const sources = [TESTED_CHANNEL_LISTS[kind.code], MAKER_CHANNEL_LISTS[kind.code], OFL_CHANNEL_LISTS[kind.code]].filter(Boolean)
    const real = list.map((footprint) => {
        const entry = sources.find((s) => s.modes?.[footprint]) || null
        const listed = entry ? entry.modes[footprint] : null
        return {
            name: modeName(footprint),
            footprint,
            channels: listed ? listed.map((c) => ({ ...c })) : null,
            channelsSource: listed ? { fixture: entry.fixture, url: entry.url, licence: entry.licence, basis: entry.basis } : null,
            src: spec?.src ?? null,
            basis: spec?.basis ?? null
        }
    })
    // The ASSUMED test modes (assumedProfiles.js, RIG_BUILD.md §18.1) come AFTER the
    // real ones, so a lamp's default is still the maker's mode, and they are never
    // mistaken for it: `basis: 'ASSUMED'`, a name ending `-assumed`, their words.
    const kept = [].concat(ARCHIVED_CHANNEL_LISTS[kind.code] || []).map((archived) => ({
        name: archived.name,
        footprint: archived.footprint,
        channels: archived.modes[archived.footprint].map((c) => ({ ...c })),
        channelsSource: { fixture: archived.fixture, url: archived.url, licence: archived.licence, basis: 'ARCHIVED' },
        src: spec?.src ?? null,
        basis: 'ARCHIVED',
        archived: true,
        reason: archived.reason
    }))
    return [...real, ...kept, ...assumedModesOf(kind.code)]
}

const realModes = (modes) => modes.filter((m) => !isAssumedMode(m) && !m.archived)

const MAKER_UPLIGHT = 'UPlight Stage Equipment (Guangzhou) Co., Ltd.'

// Channel lists from the MAKER's own manual for this very model (basis EXACT). The
// LaserCube Ultra MK2 (ULTRA MK2 Guide v1.2, pp. 57-59): the default 16-channel profile
// selects cues of an SD-card playlist (page × cue) and scales, moves, rotates and
// recolours them. Ch 5 (Fader) is named dimmer so master and blackout reach it; ch 1 at
// 0-31 is the cube's own blackout, its default. At MOXIR the cubes run OFF DMX (streamed
// from di Raw over the network, owner 2026-10-04): this is the reference, not the patch.
const LASERCUBE_MK2_MANUAL = {
    fixture: 'Wicked Lasers LaserCube Ultra MK2 (ULTRA MK2 Guide v1.2, DMX/Art-Net channel layout)',
    basis: 'EXACT',
    url: 'https://www.laseros.com/manual-mk2.pdf',
    licence: null
}
// UP-B380F colour wheel, SEEN on the units at MOXIR 2026-10-16 23:1x–23:25: every universe 1 beam held on each
// slot (scripts/rigbuild/wheel-walk.mjs --set), named by the owner's eye (slots 1-4) and from his photos sent
// through di.bo (slots 5, 7-13; docs/moxir/devices/photos/b380f-wheel-slot*-2026-10-16.jpg). The printed manual
// numbers the slots without naming them. Slots 6 and 8 are UNSURE (6 looked white; 8 shared its frame with pink
// washes). Log: docs/moxir/devices/up-b380f-wheel-walk-2026-10-16.txt. The hex codes are estimates spaced by the names
// (hue: red 5°, red-orange 20°, orange 29°, amber 41°, yellow 53°), so a look's red picks slot 1 — owner 2026-10-17:
// "i click the red room and it not the red".
const B380F_SLOTS_SEEN = [
    ['open', '#ffffff'], ['red', '#ff2a0a'], ['green', '#00d12a'], ['blue', '#1f3cff'], ['yellow', '#ffe000'],
    ['magenta', '#ff2fc8'], ['white (unsure)', '#f2f2f2'], ['amber', '#ffb000'], ['lavender (unsure)', '#e8b4ff'],
    ['lime', '#8cff3a'], ['orange', '#ff7a00'], ['red-orange', '#ff5a1e'], ['warm white', '#fff0c0'], ['light blue', '#a8d8ff']
]
const B380F_WHEEL_SEEN = [
    ...B380F_SLOTS_SEEN.flatMap(([name, colour], i) => [
        // An UNSURE slot keeps its name but no colour, so a look never picks it (dmxDecode.js nearestSlot skips it).
        name.includes('unsure') ? { from: i * 10, to: i * 10 + 4, name } : { from: i * 10, to: i * 10 + 4, name, colour },
        { from: i * 10 + 5, to: i * 10 + 9, half: [i, i + 1 < B380F_SLOTS_SEEN.length ? i + 1 : 0] }
    ]),
    { from: 140, to: 200, spin: 'forward' },
    { from: 201, to: 255, spin: 'reverse' }
]

export const MAKER_CHANNEL_LISTS = {
    // APPROVED (the owner's word, 2026-10-16 16:2x — he sent the printed manual: "the beam real chart"): UP-B380F runs the
    // PRINTED "MOVEHEAD FIXTURE USER MANUAL" shipped with the unit (ch. 3, pp. 13-15), 16 ch, pan FIRST — the order the 10-09
    // walk found on the Sevan units. Value ranges verbatim in scripts/place/fixtures/charts/up-b380f.json; photos in
    // docs/moxir/devices/photos/b380f-manual-p13…p15.jpg. The downloaded "380 IP BEAM" PDF (pan ch 10) is NOT the unit's chart:
    // archived as mode `pdf-380-ip-beam-2026-10-15`; the walk stays as `walk-2026-10-09` (ARCHIVED_CHANNEL_LISTS).
    // Ch 16 (reset) rests at 0 = none: the desk never strikes, kills or resets a lamp (100-105 lamp off, 200-205 on, 240+ reset).
    'UP-B380F': {
        fixture: 'U-Plus UP-B380F, the printed "MOVEHEAD FIXTURE USER MANUAL" with the unit (ch. 3 Channel table, pp. 13-15), photographed by the owner 2026-10-16',
        basis: 'APPROVED',
        url: null,
        licence: null,
        modes: {
            16: [
                { role: 'pan', label: 'Pan (0-540°)', default: 128 },
                { role: 'tilt', label: 'Tilt (0-270°)', default: 128 },
                { role: 'panFine', label: 'Pan fine', default: 0 },
                { role: 'tiltFine', label: 'Tilt fine', default: 0 },
                { role: 'speed', label: 'Pan/tilt speed (fast to slow)' },
                { role: 'frost', label: 'Frost (0-127 none, 128-191 colourful, 192-255 frost)', cap: { frost: { from: 192, to: 255, basis: 'MANUAL (printed, 2026-10-16): 192-255 insert frost; 128-191 is a colour filter, not frost' } } },
                { role: 'strobe', label: 'Strobe (0-3 dark, 4-103 pulse, 104-107 open, 108-207 fade, 208-212 open, 213-251 random, 252-255 open)', default: 255, cap: { shutter: [{ from: 0, to: 3, open: false }, { from: 104, to: 107, open: true }, { from: 208, to: 212, open: true }, { from: 252, to: 255, open: true }] } },
                { role: 'dimmer', label: 'Dimmer' },
                { role: 'color', label: 'Colour wheel (0-4 white, 10-14 colour 1 … 130-134 colour 13, 5-wide splits between, 140-200 rotate fwd, 201-255 rev)', default: 0, cap: { wheel: B380F_WHEEL_SEEN } },
                { role: 'gobo', label: 'Gobo (0-4 white, 5-9 gobo 1 … 85-89 gobo 17, 90-128 rotate rev, 129-131 stop, 132-170 rotate fwd, 171-255 shake gobo 1-17)', cap: { gobo: true, goboSlots: { from: 5, to: 89, count: 17, basis: 'MANUAL (printed, 2026-10-16): 5-wide slots' }, goboShake: { from: 171, basis: 'MANUAL (printed, 2026-10-16): 171-255 shake gobo 1-17' } } },
                { role: 'prism', label: 'Prism 1 (0-127 none, 128-255 in)', cap: { prism: true, prismIn: { from: 128, facets: 16, basis: 'MANUAL (printed, 2026-10-16): 128-255 insert prism 1; 16 facets from the spec (fixtures.json)' } } },
                { role: 'rotation', label: 'Prism 1 rotation (0-127 = 0-360°, 128-190 fwd, 191-192 stop, 193-255 rev)', cap: { prismRotation: { prism: 1, index: { from: 0, to: 127 }, basis: 'MANUAL (printed, 2026-10-16): 0-127 is an index 0…360°; 128-190 spin forward, 191-192 stop, 193-255 spin reverse' } } },
                { role: 'aux1', label: 'Prism 2 (0-127 none, 128-255 in)', cap: { prism2: { kind: 'honeycomb', in: { from: 128 }, basis: 'MANUAL (printed, 2026-10-16): 128-255 insert prism 2' } } },
                { role: 'aux2', label: 'Prism 2 rotation (0-127 = 0-360°, 128-190 fwd, 191-192 stop, 193-255 rev)', cap: { prismRotation: { prism: 2, index: { from: 0, to: 127 }, basis: 'MANUAL (printed, 2026-10-16): 0-127 is an index 0…360°; 128-190 spin forward, 191-192 stop, 193-255 spin reverse' } } },
                { role: 'focus', label: 'Focus (far to near)' },
                { role: 'control', label: 'Reset (0-99 none; 100-105 lamp off, 200-205 lamp on, 210-215 reset XY, 220-235 reset effects, 240-255 reset all — always 0)', default: 0 }
            ]
        }
    },
    'EXT-LC-ULTRA-MK2': {
        ...LASERCUBE_MK2_MANUAL,
        modes: {
            16: [
                laserChannel(1, 'Access mode (0-31 blackout, 33-95 basic 4 ch, 97-159 standard 8, 161-223 extended 12, 225-255 full 16)'),
                laserChannel(2, 'Page (9 pages of 48 cues)'),
                laserChannel(3, 'Cue select (0-31 blackout, then cues 1-48)'),
                laserChannel(4, 'Speed (0-15 100 %, 17-31 pause, 33… 25 % … 128 100 % … 255 200 %)'),
                { role: 'dimmer', label: 'Fader (named dimmer so master/blackout reach it)' },
                laserChannel(6, 'Scale (zero … full size)'),
                laserChannel(7, 'X size (0 −full, 128 zero, 255 +full)'),
                laserChannel(8, 'Y size (0 −full, 128 zero, 255 +full)'),
                laserChannel(9, 'Rotation (0 … 360°)'),
                { ...laserChannel(10, 'X position (128 centre)'), default: 128 },
                { ...laserChannel(11, 'Y position (128 centre)'), default: 128 },
                laserChannel(12, 'Reserved'),
                laserChannel(13, 'Scan rate (0-31 default 35K pps, 33-223 6K-29K, 225+ 30K)'),
                laserChannel(14, 'Reserved'),
                laserChannel(15, 'Recolour (0-31 off, 33-223 hue sweep, 225+ white)'),
                laserChannel(16, 'Reserved')
            ]
        }
    }
}

// The manifest's own words decide identity: an EXACT kind is the maker's model; a
// NOT FOUND kind is a rental label modelled on a named equivalent, and its maker is
// owed (the equivalent is carried as `modelledOn`, never as the maker).
const identityOf = (kind) => {
    const identified = String(kind.identified || '')
    const exact = identified.startsWith('EXACT')
    const product = String(kind.product || '')
    return {
        identified: exact ? 'EXACT' : 'EQUIVALENT',
        identifiedNote: identified,
        // a maker the manifest names (the owner's eye on a manual, 2026-10-15) wins over the rental label's
        maker: kind.maker || (exact && /UPlight/i.test(product) ? MAKER_UPLIGHT : null),
        model: exact ? kind.code : null,
        modelledOn: exact ? null : product.replace(/^equivalent:\s*/i, '')
    }
}

const opticsOf = (kind) => {
    const p = kind.photometry || {}
    const out = {
        beam_deg: specValue(kind.specs?.beam_deg) ?? p.beam_deg ?? null,
        zoom_deg: specValue(kind.specs?.zoom_deg),
        lux: p.lux ?? null,
        at_m: p.at_m ?? null,
        photometrySrc: p.src ?? null,
        photometryBasis: p.basis ?? null
    }
    if (p.note) out.note = p.note
    return out
}

// PROVENANCE (owner, 2026-10-13: "collect real, close data so it is right in real life"). Every
// sourced value already carries its `basis`; a type's provenance says, in one place, how the type
// is known (`identified`: exact, the maker's own model, or a named equivalent), when its
// sources were read (`date`), which they are (`sources`), and how each of its values was got
// (`values`): MEASURED by us on a real unit (none yet — the manifest: "nothing here was measured
// by us"), TESTED (run on the rental units: a channel map patched and played), from the maker's
// datasheet (EXACT, or COMPONENT: the part inside), from an equivalent's (EQUIVALENT), ASSUMED
// (a stated guess), or UNKNOWN (looked for, not found). The rule for adding a type:
// src/rigbuild/types/library/README.md.
export const PROVENANCE_BASES = Object.freeze(['measured', 'tested', 'datasheet', 'equivalent', 'assumed', 'unknown'])
const basisWord = (basis) => {
    const b = String(basis || '').trim().toUpperCase()
    if (b.startsWith('MEASURED')) return 'measured'
    if (b.startsWith('TESTED')) return 'tested'
    if (b.startsWith('EXACT') || b.startsWith('COMPONENT')) return 'datasheet'
    if (b.startsWith('EQUIVALENT')) return 'equivalent'
    if (b.startsWith('ASSUMED')) return 'assumed'
    if (b.startsWith('UNKNOWN')) return 'unknown'
    return null
}
/** How each value of a type was got: a count per PROVENANCE_BASES, from every `basis` field in it. Pure. */
export const valueBasesOf = (type) => {
    const counts = Object.fromEntries(PROVENANCE_BASES.map((b) => [b, 0]))
    const walk = (node) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(walk); return }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'sources' || key === 'provenance') continue
            if (/basis$/i.test(key) && typeof value === 'string') {
                const word = basisWord(value)
                if (word) counts[word] += 1
            } else walk(value)
        }
    }
    walk(type)
    return counts
}
const accessedDatesOf = (node, out = []) => {
    if (!node || typeof node !== 'object') return out
    for (const [key, value] of Object.entries(node)) {
        if (key === 'accessed' && typeof value === 'string') out.push(value.slice(0, 10))
        else accessedDatesOf(value, out)
    }
    return out
}
const provenanceOf = (type, manifest) => ({
    identified: type.identified === 'EXACT' ? 'exact' : 'equivalent',
    // the newest date anything in this type was read (the manifest's, a source's or a value's own `accessed`)
    date: [manifest?.accessed || manifest?.writtenAt, ...accessedDatesOf(type)]
        .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || null,
    sources: Object.keys(type.sources || {}),
    values: valueBasesOf(type)
})

/**
 * The type library from a fixtures manifest. Pure; the output is what
 * src/rigbuild/types/library/ holds (scripts/rigbuild/types.mjs writes it).
 *
 * @param {object} manifest   scripts/place/fixtures/fixtures.json
 * @param {object} [options]
 * @param {string} [options.manifestFile]  the manifest's path, recorded as provenance
 * @param {string} [options.glbDir]        where the bodies are, relative to the repo
 * @param {Record<string, object>} [options.sidecars]  fixtures/glb/<kind>.json by kind
 */
export const typesFromManifest = (manifest, { manifestFile = 'scripts/place/fixtures/fixtures.json', glbDir = 'scripts/place/fixtures/glb', sidecars = {} } = {}) => {
    const kinds = manifest?.kinds || {}
    const sources = manifest?.sources || {}
    const types = []
    for (const [kindKey, kind] of Object.entries(kinds)) {
        if (!CODE_RE.test(String(kind.code || ''))) throw new Error(`kind ${kindKey}: no usable code`)
        const modes = modesOf(kind)
        const used = new Set()
        for (const spec of Object.values(kind.specs || {})) {
            for (const key of String(spec?.src || '').split(/[,\s]+/)) if (sources[key]) used.add(key)
        }
        if (kind.photometry?.src && sources[kind.photometry.src]) used.add(kind.photometry.src)
        const sidecar = sidecars[kindKey] || null
        const type = {
            id: typeIdOf(kind.code),
            code: kind.code,
            ...identityOf(kind),
            product: kind.product || null,
            // the maker's own model name and manual where the manifest holds them (basis on the manual: APPROVED by the owner's eye and word, 2026-10-15, for the three U-Plus kinds)
            ...(kind.maker_model ? { makerModel: kind.maker_model } : {}),
            ...(kind.manual ? { manual: kind.manual } : {}),
            // the maker's DMX chart(s) with value ranges, kept beside the desk's modes (scripts/place/fixtures/charts/); never what the desk sends unless a mode says so
            ...(kind.maker_chart ? { makerChart: kind.maker_chart } : {}),
            category: kind.model?.archetype || null,
            modes,
            // The mode a lamp takes when none is chosen: the first the source lists.
            // A planning default, not the crew's decision — the sheet prints it and
            // the inspector changes it.
            defaultMode: realModes(modes).length ? realModes(modes)[0].name : null,
            // Owed = no mode the maker (or its named equivalent) publishes. An assumed
            // test mode does not pay that debt; `assumedMode` names the one to test with.
            modesOwed: realModes(modes).length === 0,
            assumedMode: modes.find(isAssumedMode)?.name || null,
            power_w: sourced(kind.specs?.power_w),
            // the mains draw where the maker states one beside the rating (a LED PAR: 162 W rated, 200 W supply)
            supply_w: sourced(kind.specs?.supply_w),
            weight_kg: sourced(kind.specs?.weight_kg),
            size_mm: sourced(kind.specs?.size_mm),
            pan_tilt_deg: sourced(kind.specs?.pan_tilt_deg),
            ip: sourced(kind.specs?.ip),
            optics: opticsOf(kind),
            // A hazer's or fog machine's output, what the room's haze is worked out from
            // (src/objectComponents/hazeField.js). Null on every lamp.
            fluid_ml_per_min: sourced(kind.specs?.fluid_ml_per_min),
            // each emitter's CIE 1931 xy and lumens at full, when a source gives them (dmxDecode.js emitterMix)
            ...(kind.emitters ? { emitters: kind.emitters } : {}),
            nozzle_d_mm: Number(kind.model?.params?.nozzle_d_mm) > 0 ? Number(kind.model.params.nozzle_d_mm) : null,
            model3d: {
                glb: `${glbDir}/${kindKey}.glb`,
                sidecar: `${glbDir}/${kindKey}.json`,
                builtBy: sidecar?.builtBy || null,
                frame: sidecar?.frame || null,
                // Heights in the body's own frame (metres, base on y=0): where the
                // pan and tilt axes are and where the light leaves. What turns a
                // lamp's lens position into its mount point (lampGeometry.js).
                panY: sidecar?.panY ?? null,
                tiltY: sidecar?.tiltY ?? null,
                lensY: sidecar?.lensY ?? null,
                // The body's own bounding box at home (x width, z depth, y height),
                // what a GDTF Model's Length/Width/Height must say (gdtf.js).
                sizeAtHome_mm: sidecar?.sizeAtHome_mm ?? null,
                licence: manifest?.modelsLicence?.licence || null
            },
            sources: Object.fromEntries([...used].sort().map((key) => [key, sources[key]])),
            manifest: { file: manifestFile, kind: kindKey, writtenAt: manifest?.writtenAt || null, accessed: manifest?.accessed || null }
        }
        type.provenance = provenanceOf(type, manifest)
        types.push(type)
    }
    return {
        library: 'types',
        howToRead: 'docs/architecture/RIG_BUILD.md §2.1; adding a type: src/rigbuild/types/library/README.md. Generated by scripts/rigbuild/types.mjs from the manifest named in each type — never edit by hand.',
        generatedFrom: manifestFile,
        types
    }
}

// ---- reading a library ------------------------------------------------------

export const typeById = (library, id) => {
    const want = typeIdOf(id)
    const list = Array.isArray(library) ? library : library?.types || []
    return list.find((type) => type.id === want) || null
}

export { isAssumedMode }

export const modeOf = (type, name) => {
    if (!type) return null
    const want = name || type.defaultMode
    return (type.modes || []).find((mode) => mode.name === want) || null
}

export const footprintOf = (type, name) => modeOf(type, name)?.footprint ?? null

// What a lamp draws from the mains, for circuits and totals: the maker's SUPPLY power where it states
// one beside the rating, else the rating. Planning on the rating put 16 PARs (2592 W rated, 3200 W at
// supply) on one 16 A circuit over its 2944 W limit (audit A-05, 2026-10-05).
export const powerOf = (type) => {
    for (const v of [type?.supply_w?.value, type?.power_w?.value]) {
        const w = Number(v)
        if (v != null && Number.isFinite(w) && w >= 0) return w
    }
    return null
}

/**
 * What is wrong with a lamp's type and mode, in words a crew reads. Pure.
 * @returns {{code: string, message: string}[]}
 */
export const typeFlags = (fixture, library) => {
    const flags = []
    if (!fixture?.type) return flags
    const type = typeById(library, fixture.type)
    if (!type) return [{ code: 'unknown-type', message: `type "${fixture.type}" is not in the library` }]
    const mode = modeOf(type, fixture.mode)
    if (!mode && type.modesOwed) return [{ code: 'mode-unknown', message: `${type.code}: no DMX mode is known (owed)` }]
    if (!mode) {
        flags.push({ code: 'mode-unknown', message: `${type.code}: no mode "${fixture.mode}" (known: ${type.modes.map((m) => m.name).join(', ')})` })
        return flags
    }
    if (!mode.channels) flags.push({ code: 'channels-owed', message: `${type.code} ${mode.name}: channel list owed` })
    // A test mode is patched and drawn, and SAID to be assumed wherever flags are shown.
    if (isAssumedMode(mode)) flags.push({ code: 'channels-assumed', message: `${type.code} ${mode.name}: ${mode.assumed || 'ASSUMED channel list — verify on the rental unit'}` })
    return flags
}

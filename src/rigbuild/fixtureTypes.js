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
export const TESTED_CHANNEL_LISTS = {
    'UP-B380F': {
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
    },
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
                { role: 'aux1', label: 'Ch 7 (unused in the tested map)' },
                { role: 'aux2', label: 'Ch 8 (unused in the tested map)' }
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
            32: [
                { role: 'dimmer', label: 'Ch 1 output (named dimmer so master/blackout reach it)' },
                laserChannel(2, 'Mode (25 auto, 75 voice, 250 manual graphics)'),
                laserChannel(3, 'Graphic select'),
                laserChannel(4, 'Display mode'),
                laserChannel(5, 'Colour (8 white, 25 red, 76 yellow, 93 purple, 110 cyan)'),
                laserChannel(6, 'X position (64 centre)'),
                laserChannel(7, 'Y position (64 centre)'),
                ...[8, 9, 10].map((n) => laserChannel(n, `Ch ${n}`)),
                laserChannel(11, 'Centre rotation (150 slow clockwise)'),
                laserChannel(12, 'Ch 12'),
                laserChannel(13, 'Wave 1'),
                laserChannel(14, 'Wave 2'),
                laserChannel(15, 'Strobe'),
                laserChannel(16, 'Red level (0 brightest)'),
                laserChannel(17, 'Green level (0 brightest)'),
                laserChannel(18, 'Blue level (0 brightest)'),
                laserChannel(19, 'Ch 19'),
                ...Array.from({ length: 13 }, (_, i) => laserChannel(20 + i, i === 2 ? 'Graphic 2 colour (mirror ch 5)' : `Graphic 2, ch ${20 + i}`))
            ]
        }
    }
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
    const sources = [TESTED_CHANNEL_LISTS[kind.code], OFL_CHANNEL_LISTS[kind.code]].filter(Boolean)
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
    return [...real, ...assumedModesOf(kind.code)]
}

const realModes = (modes) => modes.filter((m) => !isAssumedMode(m))

const MAKER_UPLIGHT = 'UPlight Stage Equipment (Guangzhou) Co., Ltd.'

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
        maker: exact && /UPlight/i.test(product) ? MAKER_UPLIGHT : null,
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

/**
 * The type library from a fixtures manifest. Pure; the output is what
 * src/rigbuild/types/<name>.json holds.
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
        types.push({
            id: typeIdOf(kind.code),
            code: kind.code,
            ...identityOf(kind),
            product: kind.product || null,
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
            weight_kg: sourced(kind.specs?.weight_kg),
            size_mm: sourced(kind.specs?.size_mm),
            pan_tilt_deg: sourced(kind.specs?.pan_tilt_deg),
            ip: sourced(kind.specs?.ip),
            optics: opticsOf(kind),
            // A hazer's or fog machine's output, what the room's haze is worked out from
            // (src/objectComponents/hazeField.js). Null on every lamp.
            fluid_ml_per_min: sourced(kind.specs?.fluid_ml_per_min),
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
        })
    }
    return {
        library: 'types',
        howToRead: 'docs/architecture/RIG_BUILD.md §2.1. Generated by scripts/rigbuild/types.mjs from the manifest named in each type — never edit by hand.',
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

export const powerOf = (type) => {
    const w = Number(type?.power_w?.value)
    return Number.isFinite(w) && w >= 0 ? w : null
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

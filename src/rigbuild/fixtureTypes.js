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
// is attached where OFL has the fixture (or its named equivalent) with a mode of
// that footprint.
const modesOf = (kind) => {
    const spec = kind.specs?.dmx_channels
    const list = Array.isArray(spec?.value) ? spec.value.filter((n) => Number.isInteger(n) && n > 0) : []
    const entry = OFL_CHANNEL_LISTS[kind.code] || null
    return list.map((footprint) => {
        const ofl = entry?.modes?.[footprint] || null
        return {
            name: modeName(footprint),
            footprint,
            channels: ofl ? ofl.map((c) => ({ ...c })) : null,
            channelsSource: ofl ? { fixture: entry.fixture, url: entry.url, licence: entry.licence, basis: entry.basis } : null,
            src: spec?.src ?? null,
            basis: spec?.basis ?? null
        }
    })
}

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
            defaultMode: modes.length ? modes[0].name : null,
            modesOwed: modes.length === 0,
            power_w: sourced(kind.specs?.power_w),
            weight_kg: sourced(kind.specs?.weight_kg),
            size_mm: sourced(kind.specs?.size_mm),
            pan_tilt_deg: sourced(kind.specs?.pan_tilt_deg),
            ip: sourced(kind.specs?.ip),
            optics: opticsOf(kind),
            model3d: {
                glb: `${glbDir}/${kindKey}.glb`,
                sidecar: `${glbDir}/${kindKey}.json`,
                builtBy: sidecar?.builtBy || null,
                frame: sidecar?.frame || null,
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
    if (type.modesOwed) return [{ code: 'mode-unknown', message: `${type.code}: no DMX mode is known (owed)` }]
    const mode = modeOf(type, fixture.mode)
    if (!mode) {
        flags.push({ code: 'mode-unknown', message: `${type.code}: no mode "${fixture.mode}" (known: ${type.modes.map((m) => m.name).join(', ')})` })
        return flags
    }
    if (!mode.channels) flags.push({ code: 'channels-owed', message: `${type.code} ${mode.name}: channel list owed` })
    return flags
}

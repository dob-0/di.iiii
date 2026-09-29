// GDTF — a fixture type written as a GDTF 1.2 file (DIN SPEC 15800:2022), authored
// here from our own sourced type library. docs/architecture/RIG_BUILD.md §6.
//
// Never derived from a GDTF Share file (its terms, §9, forbid derivative and
// commercial use). What goes in:
//
//   - the modes we know, each with its footprint. A channel list from a source (OFL)
//     becomes user-defined attributes named after its channels; a footprint with NO
//     list becomes user-defined attributes OwedChannel1..N (GDTF allows user-defined
//     attributes, spec Annex A note 1) — the mode has the right width and claims
//     nothing about what any channel does. A type with no known mode is written with
//     none; its fixtures in an MVR carry no address.
//   - weight and power (PhysicalDescriptions/Properties), the body as ONE glTF model
//     (models/gltf/body.glb, our AGPL geometry), and a Beam at the lens with the
//     datasheet beam angle.
//   - GDTF draws a device HANGING, Z up, base at the origin, the beam down -Z. Our
//     bodies are glTF (Y up) standing with the beam +Y, so the body geometry is turned
//     180 degrees about X and the beam sits lensY below the base.
//
// Not modelled (owed, stated in the file's Description): pan and tilt as separate
// Axis geometries, wheels, emitters, the real channel functions.

import { isAssumedMode } from './assumedProfiles.js'

export const GDTF_DATA_VERSION = '1.2'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))

// GDTF's nametype: letters, digits and a small punctuation set. Everything else
// becomes '_' so a code like "UP-B380F" stays itself.
export const gdtfName = (value) => String(value ?? '').replace(/[^a-zA-Z0-9#%()*+\-/:;<=>@_` "']/g, '_') || '_'

// A GDTF matrix (4x4, rows, metres): no exponent notation allowed by its schema.
const num = (v) => {
    const n = Math.abs(v) < 1e-9 ? 0 : v
    return Number(n.toFixed(6)).toString()
}
export const gdtfMatrix = (rows) => rows.map((r) => `{${r.map(num).join(',')}}`).join('')

// A stable UUID from text, so the same rig exports the same file: four FNV-1a
// 32-bit hashes (different seeds) laid out as RFC 4122 with the version nibble set to
// 5. Deterministic and well-formed; NOT the SHA-1 name-based UUID of RFC 4122 §4.3.
const fnv = (text, seed) => {
    let h = seed >>> 0
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
    return h.toString(16).padStart(8, '0')
}
export const stableUuid = (text) => {
    const s = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x7f4a7c15].map((seed) => fnv(text, seed)).join('').split('')
    s[12] = '5'
    s[16] = ((parseInt(s[16], 16) & 0x3) | 0x8).toString(16)
    const t = s.join('')
    return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20, 32)}`
}

export const gdtfFileName = (type) => `${gdtfName(type.maker ? type.maker.split(/[ ,(]/)[0] : 'Unidentified')}@${gdtfName(type.code)}@di.gdtf`.replace(/[ /:]/g, '_')

const attributesOfMode = (mode) => {
    if (mode.channels && mode.channels.length === mode.footprint) {
        return mode.channels.map((c) => ({ name: gdtfName(c.role), pretty: c.label || c.role }))
    }
    return Array.from({ length: mode.footprint }, (_, i) => ({ name: `OwedChannel${i + 1}`, pretty: `Ch ${i + 1} (owed)` }))
}

/**
 * description.xml for a type.
 * @param {object} type  a record of src/rigbuild/types/*.json
 */
export const gdtfDescription = (type) => {
    // Never an ASSUMED test mode (assumedProfiles.js): a GDTF file goes to a crew's console
    // as THE fixture, and a stand-in's chart must never be taken for the maker's.
    const modes = (type.modes || []).filter((m) => !isAssumedMode(m))
    const attributes = new Map()
    for (const mode of modes) for (const a of attributesOfMode(mode)) if (!attributes.has(a.name)) attributes.set(a.name, a)
    const size = type.model3d?.sizeAtHome_mm || null
    const lensY = Number(type.model3d?.lensY) || 0
    const power = Number(type.power_w?.value)
    const weight = Number(type.weight_kg?.value)
    const beamDeg = Number(type.optics?.beam_deg ?? type.optics?.zoom_deg?.[0])
    const hasModel = !!size
    const owed = [
        'pan/tilt axes',
        ...(modes.some((m) => !m.channels) ? ['channel functions (list owed from the maker)'] : []),
        ...(type.modesOwed ? ['every DMX mode (owed from the rental house)'] : [])
    ]
    const description = `Authored by di.iiii from its sourced type library (${type.manifest?.file || 'types'}, kind ${type.manifest?.kind || type.id}); `
        + `${type.identified === 'EXACT' ? 'the maker\'s model' : `a rental label, modelled on ${type.modelledOn || 'an equivalent'}`}. `
        + `Not modelled: ${owed.join('; ')}. Geometry: our own (AGPL-3.0-only). Not from GDTF Share.`

    const modeXml = modes.map((mode) => {
        const channels = attributesOfMode(mode).map((a, i) => `
        <DMXChannel DMXBreak="1" Offset="${i + 1}" Highlight="None" Geometry="Body">
          <LogicalChannel Attribute="${esc(a.name)}" Snap="No" Master="None">
            <ChannelFunction Name="${esc(a.name)}" Attribute="${esc(a.name)}" DMXFrom="0/1" Default="0/1"/>
          </LogicalChannel>
        </DMXChannel>`).join('')
        return `
    <DMXMode Name="${esc(gdtfName(mode.name))}" Geometry="Body" Description="${esc(`${mode.footprint} channels${mode.channels ? `; list from ${mode.channelsSource?.fixture || 'a source'} (${mode.channelsSource?.basis || ''})` : '; list owed'}`)}">
      <DMXChannels>${channels}
      </DMXChannels>
    </DMXMode>`
    }).join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<GDTF DataVersion="${GDTF_DATA_VERSION}">
  <FixtureType Name="${esc(gdtfName(type.code))}" ShortName="${esc(gdtfName(type.code))}" LongName="${esc(type.product || type.code)}" Manufacturer="${esc(type.maker || 'Unidentified (rental label)')}" Description="${esc(description)}" FixtureTypeID="${stableUuid(`gdtf:${type.id}`)}" CanHaveChildren="Yes">
    <AttributeDefinitions>
      <FeatureGroups>
        <FeatureGroup Name="Control" Pretty="Control">
          <Feature Name="Control"/>
        </FeatureGroup>
      </FeatureGroups>
      <Attributes>${[...attributes.values()].map((a) => `
        <Attribute Name="${esc(a.name)}" Pretty="${esc(a.pretty)}" Feature="Control.Control"/>`).join('')}
      </Attributes>
    </AttributeDefinitions>
    <PhysicalDescriptions>
      <Connectors>
        <Connector Name="Power" Type="Power"/>
      </Connectors>
      <Properties>${Number.isFinite(weight) ? `
        <Weight Value="${num(weight)}"/>` : ''}${Number.isFinite(power) ? `
        <PowerConsumption Value="${num(power)}" Connector="Power"/>` : ''}
      </Properties>
    </PhysicalDescriptions>
    <Models>${hasModel ? `
      <Model Name="Body" Length="${num(size.width_x / 1000)}" Width="${num(size.depth_z / 1000)}" Height="${num(size.height_y / 1000)}" PrimitiveType="Undefined" File="body"/>` : ''}
    </Models>
    <Geometries>
      <Geometry Name="Body"${hasModel ? ' Model="Body"' : ''} Position="${gdtfMatrix([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]])}">
        <Beam Name="Beam" Position="${gdtfMatrix([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, lensY], [0, 0, 0, 1]])}"${Number.isFinite(beamDeg) ? ` BeamAngle="${num(beamDeg)}" FieldAngle="${num(beamDeg)}"` : ''} BeamType="Wash" LampType="${type.category === 'laser' ? 'LED' : 'Discharge'}"${Number.isFinite(power) ? ` PowerConsumption="${num(power)}"` : ''}/>
      </Geometry>
    </Geometries>
    <DMXModes>${modeXml}
    </DMXModes>
    <Revisions>
      <Revision Text="${esc(`authored by di.iiii scripts/rigbuild from ${type.manifest?.file || 'the type library'} (${type.manifest?.writtenAt || ''})`)}"/>
    </Revisions>
  </FixtureType>
</GDTF>
`
}

/**
 * A .gdtf archive (zip): description.xml + the body model. `glb` is the body's bytes
 * (Uint8Array) or null. `JSZip` is passed in so this module stays free of it.
 */
export const gdtfArchive = async (JSZip, type, glb, { date = new Date(Date.UTC(2026, 8, 28)) } = {}) => {
    const zip = new JSZip()
    zip.file('description.xml', gdtfDescription(type), { date })
    if (glb && type.model3d?.sizeAtHome_mm) zip.file('models/gltf/body.glb', glb, { date, binary: true, createFolders: false })
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

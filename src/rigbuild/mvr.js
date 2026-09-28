// MVR — the rig as an MVR 1.6 file (DIN SPEC 15801:2023) for the crew's console.
// docs/architecture/RIG_BUILD.md §6.
//
// An .mvr is a zip: GeneralSceneDescription.xml, one .gdtf per fixture type used
// (gdtf.js, authored here), and the geometry files the scene names. What each part
// of the room becomes:
//
//   lamp (components.fixture.type)  Fixture: Matrix at its MOUNT (lampGeometry.js),
//                                   GDTFSpec + GDTFMode, FixtureID = the fixture #,
//                                   UnitNumber, Addresses (absolute = (u-1)*512 + a,
//                                   only when patched), Position (by name), Function =
//                                   its circuit
//   piece (components.piece)        Truss (truss, tower) or SceneObject (deck) with its
//                                   own GLB (scripts/rigbuild/pieces/<kind>.glb)
//   rig box (a `box` whose id starts `rig-`, e.g. MOXIR's stage deck and goalpost,
//                                   drawn by rig.mjs before pieces existed)
//                                   SceneObject: a unit cube GLB scaled to the box
//
// Axes: MVR is right-handed, Z up, millimetres (mvr-spec "Node Definition: Matrix");
// the room is Y up, metres: MVR (x, y, z) = (x, -z, y) x 1000. A Matrix is
// {u}{v}{w}{o}. A fixture's GDTF is drawn hanging, so a hung lamp is the identity
// and a standing one is turned 180 degrees about X. The lamp's heading (the turn
// of its base) is NOT in the document — only its beam — so fixtures are exported
// square to the room; that is owed.
//
// Pure: no zip library, no files. `mvrScene` returns the XML and the list of
// resources the archive must hold; the caller zips (scripts/rigbuild/export-mvr.mjs).

import { gdtfFileName, gdtfName, stableUuid } from './gdtf.js'
import { lensFromMount, mountFromLens } from './lampGeometry.js'
import { modeOf, typeById } from './fixtureTypes.js'
import { pieceKindOf, pieceOf } from './pieces.js'
import { spotAimDirection } from '../project/viewport/spotLightAim.js'
import { isAssumedMode } from './assumedProfiles.js'

export const MVR_VERSION = { major: 1, minor: 6 }

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
const num = (v) => {
    const n = Math.abs(v) < 1e-9 ? 0 : v
    return Number(n.toFixed(4)).toString()
}
const vec = (v) => `{${v.map(num).join(',')}}`

/** Room metres (Y up) -> MVR millimetres (Z up). */
export const toMvr = ([x, y, z]) => [x * 1000, -z * 1000, y * 1000]

export const mvrMatrix = ({ u = [1, 0, 0], v = [0, 1, 0], w = [0, 0, 1], o = [0, 0, 0] } = {}) => `${vec(u)}${vec(v)}${vec(w)}${vec(o)}`

// A turn about the room's Y (three.js sense) is a turn about MVR's Z by the same angle.
const yawBasis = (yaw) => ({ u: [Math.cos(yaw), Math.sin(yaw), 0], v: [-Math.sin(yaw), Math.cos(yaw), 0], w: [0, 0, 1] })

export const absoluteAddress = (universe, address) => (universe - 1) * 512 + address

const isLamp = (e) => typeof e?.components?.fixture?.type === 'string' && e.components.fixture.type !== ''

/**
 * @param {object} args
 * @param {object[]} args.entities
 * @param {object} args.library
 * @param {object} [args.meta]  { title, provider, providerVersion }
 * @returns {{ xml: string, gdtf: object[], pieces: string[], cube: boolean, fixtures: number, skipped: string[] }}
 */
export const mvrScene = ({ entities = [], library, meta = {} }) => {
    const positions = new Map()
    const positionUuid = (name) => {
        if (!name) return null
        if (!positions.has(name)) positions.set(name, stableUuid(`position:${name}`))
        return positions.get(name)
    }
    const usedTypes = new Map()
    const skipped = []
    const children = []

    for (const e of entities.filter(isLamp)) {
        const f = e.components.fixture
        const type = typeById(library, f.type)
        if (!type) { skipped.push(`${e.id}: type "${f.type}" is not in the library`); continue }
        usedTypes.set(type.id, type)
        const chosen = modeOf(type, f.mode || type.defaultMode)
        // An ASSUMED test mode is not in the GDTF (gdtf.js leaves it out): the file names the
        // maker's mode of the same footprint when there is one, else no mode — never the test's.
        const mode = chosen && isAssumedMode(chosen)
            ? (type.modes || []).find((m) => !isAssumedMode(m) && m.footprint === chosen.footprint) || null
            : chosen
        const beam = e.type === 'spotLight' ? spotAimDirection(e.components.transform?.rotation || [0, 0, 0]) : [0, f.hung ? -1 : 1, 0]
        const lens = e.components.transform?.position || [0, 0, 0]
        const mount = mountFromLens({ lens, hung: f.hung === true, beam, type })
        const basis = f.hung ? {} : { u: [1, 0, 0], v: [0, -1, 0], w: [0, 0, -1] }
        const patched = mode && Number.isInteger(f.universe) && Number.isInteger(f.address)
        const pos = positionUuid(f.position)
        children.push(`
        <Fixture name="${esc([type.code, f.position, f.unit].filter((x) => x != null && x !== '').join(' '))}" uuid="${stableUuid(`fixture:${e.id}`)}">
          <Matrix>${mvrMatrix({ ...basis, o: toMvr(mount) })}</Matrix>
          <GDTFSpec>${esc(gdtfFileName(type))}</GDTFSpec>
          <GDTFMode>${esc(mode ? gdtfName(mode.name) : '')}</GDTFMode>${pos ? `
          <Position>${pos}</Position>` : ''}${f.circuit ? `
          <Function>${esc(`circuit ${f.circuit}`)}</Function>` : ''}
          <FixtureID>${esc(f.index ?? '')}</FixtureID>${Number.isInteger(f.index) ? `
          <FixtureIDNumeric>${f.index}</FixtureIDNumeric>` : ''}
          <UnitNumber>${Number.isInteger(f.unit) ? f.unit : 0}</UnitNumber>${patched ? `
          <Addresses>
            <Address break="0">${absoluteAddress(f.universe, f.address)}</Address>
          </Addresses>` : ''}
        </Fixture>`)
    }

    const pieces = new Set()
    let cube = false
    for (const e of entities) {
        const kind = pieceKindOf(e)
        const t = e.components?.transform || {}
        const yaw = t.rotation?.[1] || 0
        if (kind) {
            const piece = pieceOf(kind)
            pieces.add(kind)
            const tag = piece.category === 'deck' ? 'SceneObject' : 'Truss'
            children.push(`
        <${tag} name="${esc(e.name || piece.label)}" uuid="${stableUuid(`piece:${e.id}`)}">
          <Matrix>${mvrMatrix({ ...yawBasis(yaw), o: toMvr(t.position || [0, 0, 0]) })}</Matrix>
          <Geometries>
            <Geometry3D fileName="${esc(kind)}.glb"/>
          </Geometries>${tag === 'Truss' ? `
          <FixtureID></FixtureID>` : ''}
        </${tag}>`)
            continue
        }
        if (e.type === 'box' && String(e.id).startsWith('rig-')) {
            cube = true
            const size = (t.scale || [1, 1, 1]).map((s, i) => s * ((e.components.primitive?.size || [1, 1, 1])[i] ?? 1))
            // The unit cube is base-anchored like the room's primitives; its own
            // matrix scales it to the box (room x, z, y -> MVR x, y, z).
            children.push(`
        <SceneObject name="${esc(e.name || e.id)}" uuid="${stableUuid(`box:${e.id}`)}">
          <Matrix>${mvrMatrix({ ...yawBasis(yaw), o: toMvr(t.position || [0, 0, 0]) })}</Matrix>
          <Geometries>
            <Geometry3D fileName="cube.glb">
              <Matrix>${mvrMatrix({ u: [size[0], 0, 0], v: [0, size[2], 0], w: [0, 0, size[1]] })}</Matrix>
            </Geometry3D>
          </Geometries>
        </SceneObject>`)
        }
    }

    const aux = [...positions.entries()].map(([name, uuid]) => `
      <Position name="${esc(name)}" uuid="${uuid}"/>`).join('')
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<GeneralSceneDescription verMajor="${MVR_VERSION.major}" verMinor="${MVR_VERSION.minor}" provider="${esc(meta.provider || 'di.iiii')}" providerVersion="${esc(meta.providerVersion || 'rigbuild')}">
  <Scene>
    <AUXData>${aux}
    </AUXData>
    <Layers>
      <Layer name="${esc(meta.title || 'rig')}" uuid="${stableUuid(`layer:${meta.title || 'rig'}`)}">
        <ChildList>${children.join('')}
        </ChildList>
      </Layer>
    </Layers>
  </Scene>
</GeneralSceneDescription>
`
    return { xml, gdtf: [...usedTypes.values()], pieces: [...pieces], cube, fixtures: children.filter((c) => c.includes('<Fixture ')).length, skipped }
}

// Re-exported for the export script's own checks.
export { lensFromMount }

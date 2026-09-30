import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { aimFixture } from '../../scripts/place/fixture-lib.mjs'
import { typeById } from './fixtureTypes.js'
import beam380Url from '../../scripts/place/fixtures/glb/beam380.glb?url'
import beeEyeUrl from '../../scripts/place/fixtures/glb/beeEye.glb?url'
import bsw250Url from '../../scripts/place/fixtures/glb/bsw250.glb?url'
import co2Url from '../../scripts/place/fixtures/glb/co2.glb?url'
import laserUrl from '../../scripts/place/fixtures/glb/laser.glb?url'
import parUrl from '../../scripts/place/fixtures/glb/par.glb?url'
import smokeUrl from '../../scripts/place/fixtures/glb/smoke.glb?url'
import sparkUrl from '../../scripts/place/fixtures/glb/spark.glb?url'
import strobeUrl from '../../scripts/place/fixtures/glb/strobe.glb?url'
import blinderUrl from '../../scripts/place/fixtures/glb/blinder.glb?url'
import hazerUrl from '../../scripts/place/fixtures/glb/hazer.glb?url'
import cob200Url from '../../scripts/place/fixtures/glb/cob200.glb?url'
import beam380 from '../../scripts/place/fixtures/glb/beam380.json'
import beeEye from '../../scripts/place/fixtures/glb/beeEye.json'
import bsw250 from '../../scripts/place/fixtures/glb/bsw250.json'
import co2 from '../../scripts/place/fixtures/glb/co2.json'
import laser from '../../scripts/place/fixtures/glb/laser.json'
import par from '../../scripts/place/fixtures/glb/par.json'
import smoke from '../../scripts/place/fixtures/glb/smoke.json'
import spark from '../../scripts/place/fixtures/glb/spark.json'
import strobe from '../../scripts/place/fixtures/glb/strobe.json'
import blinder from '../../scripts/place/fixtures/glb/blinder.json'
import hazer from '../../scripts/place/fixtures/glb/hazer.json'
import cob200 from '../../scripts/place/fixtures/glb/cob200.json'

// THE LAMPS' BODIES in the room — one body per lamp entity, posed where its beam goes
// (docs/architecture/RIG_BUILD.md §12; the owed item of §10.8 for view A).
//
// The models are the MOXIR fixtures (scripts/place/fixtures/, ours, AGPL): separate
// Base / Yoke / Head / Lens nodes, so a head can be turned. Each part of each kind is
// ONE InstancedMesh with a matrix per lamp — the same arrangement fixtures-glb.mjs
// bakes into a file, and the part matrices come from the same function
// (fixture-lib.mjs aimFixture: the lamp's mount, hung or standing, and its beam), so
// a head in the room is turned exactly where its beam goes, and follows a look. For a
// hundred lamps it is (kinds × parts × materials) draw calls, ~40, however many hang.
// A lens is unlit and takes its lamp's light colour.
//
// A view, never written: the document holds the lamp (its lens and its aim); this
// draws the steel around it.

const KINDS = {
    beam380: { url: beam380Url, geo: beam380 },
    beeEye: { url: beeEyeUrl, geo: beeEye },
    bsw250: { url: bsw250Url, geo: bsw250 },
    co2: { url: co2Url, geo: co2 },
    laser: { url: laserUrl, geo: laser },
    par: { url: parUrl, geo: par },
    smoke: { url: smokeUrl, geo: smoke },
    spark: { url: sparkUrl, geo: spark },
    strobe: { url: strobeUrl, geo: strobe },
    blinder: { url: blinderUrl, geo: blinder },
    hazer: { url: hazerUrl, geo: hazer },
    cob200: { url: cob200Url, geo: cob200 }
}

/** The body kind of a type: the basename of its model3d.glb ("…/bsw250.glb" → "bsw250"). */
export const bodyKindOf = (type) => {
    const file = String(type?.model3d?.glb || '').split('/').pop().replace(/\.glb$/i, '')
    return KINDS[file] ? file : null
}

/**
 * Per kind, per lamp: the part matrices. Pure but for three's Matrix4 (fixture-lib).
 * @param {{id, type: string, mount: number[], hung: boolean, beam: number[], colour?: string}[]} lamps
 */
export const bodyPoses = (lamps, library) => {
    const out = new Map()
    for (const l of lamps) {
        const kind = bodyKindOf(typeById(library, l.type))
        if (!kind) continue
        const { geo } = KINDS[kind]
        const posed = aimFixture(geo, { pos: l.mount, orient: l.hung ? 'hung' : 'floor' }, { dir: l.beam })
        if (!out.has(kind)) out.set(kind, [])
        out.get(kind).push({ id: l.id, parts: posed.parts, colour: l.colour || '#ffffff' })
    }
    return out
}

const partOf = (mesh, parts) => (parts.includes(mesh.name) ? mesh.name : parts.includes(mesh.parent?.name) ? mesh.parent.name : null)

function KindBodies({ kind, poses }) {
    const { url, geo } = KINDS[kind]
    const { scene } = useGLTF(url)
    // Every mesh of the model, with the part it belongs to. Geometry and materials
    // stay useGLTF's (shared, cached); only a lens gets its own unlit material.
    const meshes = useMemo(() => {
        const list = []
        scene.updateMatrixWorld(true)
        scene.traverse((o) => {
            if (!o.isMesh) return
            const part = partOf(o, geo.parts)
            if (!part) return
            // A multi-primitive node arrives as a group of meshes: their own
            // (identity) matrix under the part node is kept, in case it is not.
            const local = o.name === part ? new THREE.Matrix4() : o.matrix.clone()
            const lens = part === 'Lens'
            list.push({
                key: `${part}:${o.uuid}`,
                part,
                geometry: o.geometry,
                material: lens ? new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }) : o.material,
                local,
                lens
            })
        })
        return list
    }, [scene, geo.parts])
    return meshes.map((m) => <PartInstances key={m.key} mesh={m} poses={poses} />)
}

const tmp = new THREE.Matrix4()
const tint = new THREE.Color()

function PartInstances({ mesh, poses }) {
    const ref = useRef(null)
    const count = poses.length
    useLayoutEffect(() => {
        const im = ref.current
        if (!im) return
        poses.forEach((p, i) => {
            const m = p.parts[mesh.part]
            if (!m) return
            tmp.copy(m).multiply(mesh.local)
            im.setMatrixAt(i, tmp)
            if (mesh.lens) im.setColorAt(i, tint.set(p.colour))
        })
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        im.computeBoundingSphere()
    }, [poses, mesh])
    if (!count) return null
    // A new count needs a new InstancedMesh (its buffers are sized at creation).
    return <instancedMesh key={count} ref={ref} args={[mesh.geometry, mesh.material, count]} frustumCulled={false} userData={{ noShadow: true, rigBody: true }} />
}

export default function FixtureBodies({ lamps, library }) {
    const byKind = useMemo(() => bodyPoses(lamps, library), [lamps, library])
    return [...byKind.entries()].map(([kind, poses]) => <KindBodies key={kind} kind={kind} poses={poses} />)
}

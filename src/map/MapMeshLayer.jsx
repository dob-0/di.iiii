import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { tessellate } from './sliceGeometry.js'
import { rackKeyFor } from './mediaRack.js'
import { MESH_STEPS, getMeshRenderer } from './meshRenderer.js'

// One slice's picture, drawn through its mesh by the page's one WebGL
// renderer (meshRenderer.js) from the stage's one copy of each source
// (mediaRack.js), onto a plain canvas covering only the slice's bounding box.
//
// The same component draws a slice whether it is bent or not: an unbent slice
// is just a mesh that happens to be flat. That is the point — moving a warp
// point changes geometry and never swaps what draws the picture, so nothing
// restarts or blinks (2026-10-25).
//
// Kinds it can draw: anything whose pixels a page may read — video, image,
// camera, test card, colour — and an uploaded HTML visual, through the frame
// relay. A web link or a project stays a corner-pinned iframe (MapStage.jsx).
export const MESH_KINDS = new Set(['video', 'image', 'camera', 'test', 'colour'])

export const RackContext = createContext(null)
export const useRack = () => useContext(RackContext)

/**
 * corners      the slice's corners in STAGE pixels
 * warp         surface.warp (absent = flat)
 * source       { kind, ref } of what plays
 * frame        { width, height } of the picture the input is taken from
 * input        [x, y, w, h] normalised to that picture
 * rotation     input rotation, degrees
 * flip         'none' | 'h' | 'v' | 'hv'
 */
export default function MapMeshLayer({
    corners, warp, source, frame, input = [0, 0, 1, 1], rotation = 0, flip = 'none',
    blackBg = true, softEdge = null, stageWidth, stageHeight, onReady = null
}) {
    const rack = useRack()
    const canvasRef = useRef(null)
    const key = rackKeyFor(source, frame)
    const readyRef = useRef(onReady)
    useEffect(() => { readyRef.current = onReady })

    // Hold this slice's source in the rack for as long as the slice shows it.
    useEffect(() => {
        if (source?.kind === 'colour') { readyRef.current?.(); return undefined }
        if (!rack || !key) return undefined
        const entry = rack.acquire(key, source, frame)
        let unsubscribe = null
        if (entry?.ready) readyRef.current?.()
        else if (entry) {
            unsubscribe = rack.subscribe(key, () => {
                if (!entry.ready) return
                unsubscribe?.()
                unsubscribe = null
                readyRef.current?.()
            })
        }
        return () => { unsubscribe?.(); rack.release(key) }
        // The rack key already names the source and its size.
    }, [rack, key]) // eslint-disable-line react-hooks/exhaustive-deps

    const mesh = useMemo(() => tessellate(corners, warp, MESH_STEPS), [corners, warp])

    const box = useMemo(() => {
        if (!mesh) return null
        const xs = mesh.lattice.map(({ point }) => point[0])
        const ys = mesh.lattice.map(({ point }) => point[1])
        const left = Math.max(0, Math.floor(Math.min(...xs)))
        const top = Math.max(0, Math.floor(Math.min(...ys)))
        const right = Math.min(stageWidth, Math.ceil(Math.max(...xs)))
        const bottom = Math.min(stageHeight, Math.ceil(Math.max(...ys)))
        return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
    }, [mesh, stageWidth, stageHeight])

    // Vertex data in the box's clip space, rebuilt only when the shape moves.
    const geometry = useMemo(() => {
        if (!mesh || !box) return null
        const positions = new Float32Array(mesh.lattice.length * 2)
        const locals = new Float32Array(mesh.lattice.length * 2)
        mesh.lattice.forEach(({ u, v, point }, index) => {
            positions[index * 2] = (((point[0] - box.left) / box.width) * 2) - 1
            positions[(index * 2) + 1] = 1 - (((point[1] - box.top) / box.height) * 2)
            locals[index * 2] = u
            locals[(index * 2) + 1] = v
        })
        return { positions, locals }
    }, [mesh, box])

    // Everything the renderer needs, read fresh on each of its frames; any
    // render of this slice marks it for one redraw.
    const specRef = useRef(null)
    const dirtyRef = useRef(true)
    useEffect(() => {
        specRef.current = { key, source, frame, input, rotation, flip, blackBg, softEdge, box, geometry }
        dirtyRef.current = true
    })

    useEffect(() => {
        const renderer = getMeshRenderer()
        const canvas = canvasRef.current
        if (!renderer || !canvas) return undefined
        const context = canvas.getContext('2d')
        let lastVersion = -1
        let lastTick = -1
        const layer = {
            invalidate: () => { dirtyRef.current = true },
            frame: () => {
                const spec = specRef.current
                if (!spec?.box || !spec.geometry) return
                const colour = spec.source?.kind === 'colour' ? (spec.source.ref || '#ffffff') : null
                const entry = colour ? null : rack?.entry(spec.key)
                const live = entry && (entry.kind === 'video' || entry.kind === 'camera')
                const moved = entry && (live ? renderer.tick !== lastTick : entry.version !== lastVersion)
                if (!dirtyRef.current && !moved) return
                const dpr = Math.min(2, window.devicePixelRatio || 1)
                const width = Math.max(1, Math.round(spec.box.width * dpr))
                const height = Math.max(1, Math.round(spec.box.height * dpr))
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
                const drawn = renderer.draw({
                    target: context, width, height,
                    positions: spec.geometry.positions, locals: spec.geometry.locals,
                    entry, colour, mapping: textureMapping(spec, entry), blackBg: spec.blackBg, softEdge: spec.softEdge
                })
                if (drawn) {
                    dirtyRef.current = false
                    lastTick = renderer.tick
                    lastVersion = entry?.version ?? -1
                }
            }
        }
        return renderer.add(layer)
    }, [rack])

    if (!box) return null
    return (
        <canvas
            ref={canvasRef}
            className="map-mesh-canvas"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
    )
}

// Local square -> source uv: through the input rectangle, its rotation, the
// flip, and a cover-fit of the source's own shape. A relayed page and a test
// card are laid out at the frame's size, so they already have its shape.
const textureMapping = (spec, entry) => {
    const W = spec.frame.width
    const H = spec.frame.height
    const element = entry?.element
    const own = entry && (entry.kind === 'video' || entry.kind === 'camera' || entry.kind === 'image')
    const sw = own ? (element?.videoWidth || element?.naturalWidth || W) : W
    const sh = own ? (element?.videoHeight || element?.naturalHeight || H) : H
    const scale = Math.max(W / sw, H / sh)
    const shownW = sw * scale
    const shownH = sh * scale
    const offX = (W - shownW) / 2
    const offY = (H - shownH) / 2
    const [ix, iy, iw0, ih0] = spec.input
    const cx = (ix + (iw0 / 2)) * W
    const cy = (iy + (ih0 / 2)) * H
    const iw = iw0 * W
    const ih = ih0 * H
    const radians = ((spec.rotation || 0) * Math.PI) / 180
    const fx = spec.flip === 'h' || spec.flip === 'hv' ? -1 : 1
    const fy = spec.flip === 'v' || spec.flip === 'hv' ? -1 : 1
    const ax = [Math.cos(radians) * iw * fx, Math.sin(radians) * iw * fx]
    const ay = [-Math.sin(radians) * ih * fy, Math.cos(radians) * ih * fy]
    const origin = [cx - (ax[0] / 2) - (ay[0] / 2), cy - (ax[1] / 2) - (ay[1] / 2)]
    return {
        origin: [(origin[0] - offX) / shownW, (origin[1] - offY) / shownH],
        axisX: [ax[0] / shownW, ax[1] / shownH],
        axisY: [ay[0] / shownW, ay[1] / shownH]
    }
}

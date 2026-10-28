// THE AR SCAN — the camera view painted with what has been seen, a map of the
// place from above, the next spot on the floor and the warnings before a bad shot.
//
// One screen, two sources of ticks: a live immersive-ar session (xrSource.js) or
// a recorded walk (recordedSession.js) — the agent screen has no WebXR, so the
// second is how this screen is seen and tested without a phone. Everything that
// decides is in scanBrain.js and is pure; this file only draws and uploads.
//
// The animations are calm and physical: the square on the floor breathes at
// 1.6 s, the arrow turns with a 300 ms ease, a warning slides up 8 px and stays
// 700 ms after it clears. Square corners everywhere — the di.iiii signature.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createScanBrain } from './scanBrain.js'
import { STATE_GOOD, STATE_MISSED, STATE_THIN, coverageCells } from './coverage.js'
import { drawFloorMap, floorMapModel } from './floorMap.js'
import { arrowFor, spotWords } from './nextSpot.js'
import { WARNING_WORDS } from './warnings.js'
import { addFrame, createSidecar, sidecarFilename } from './poseSidecar.js'
import { createSessionRecorder, playSession, syntheticWalk } from './recordedSession.js'
import { createXrSource } from './xrSource.js'
import { createUploadQueue } from '../uploadQueue.js'
import { hangCapture, keepWalkFile } from '../scanSources.js'
import './arScan.css'

const PAINT = { [STATE_GOOD]: '#3ecf6e', [STATE_THIN]: '#f2c230', [STATE_MISSED]: '#ef4b3f' }
const MAP_COLOURS = { ground: 'rgba(0,0,0,0.55)', path: 'rgba(255,255,255,0.7)', shot: '#ffffff', spot: '#5fd7ff', me: '#5fd7ff', ...PAINT }
const UI_EVERY_MS = 200
const MAP_PX = 168

const walkName = (date = new Date()) => `walk-${date.toISOString().slice(0, 19).replace(/[-:T]/g, '')}`

const buildPaint = (points, cells) => {
    const positions = new Float32Array(cells.length * 3)
    const colours = new Float32Array(cells.length * 3)
    const colour = new THREE.Color()
    cells.forEach((c, i) => {
        positions.set(c.centre, i * 3)
        colour.set(PAINT[c.state])
        colours.set([colour.r, colour.g, colour.b], i * 3)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    points.geometry.dispose()
    points.geometry = geometry
}

export default function ArScan({ mode, xrSession = null, recorded = null, speed = 1, spaceId, spaceLabel, sourcesProject, onLeave }) {
    const canvasRef = useRef(null)
    const mapRef = useRef(null)
    const brainRef = useRef(null)
    const sourceRef = useRef(null)
    const sidecarRef = useRef(null)
    const recorderRef = useRef(null)
    const lastTickRef = useRef(null)
    const [ui, setUi] = useState({ shown: [], summary: { good: 0, thin: 0, missed: 0, total: 0, kept: 0 }, spot: null, arrow: null })
    const [info, setInfo] = useState({ depth: '', camera: null, features: [] })
    const [problem, setProblem] = useState('')
    const [ending, setEnding] = useState(false)
    const [flash, setFlash] = useState(0)
    const walk = useMemo(() => walkName(), [])
    const saving = mode === 'xr' && Boolean(sourcesProject)

    const queue = useMemo(() => createUploadQueue(async (item) => {
        const file = new File([item.blob], item.filename, { type: item.blob.type || 'image/jpeg' })
        return hangCapture(item.projectId, file, { name: item.label, kind: 'still' })
    }), [])

    useEffect(() => {
        const canvas = canvasRef.current
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: mode === 'play' })
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
        renderer.setSize(window.innerWidth, window.innerHeight, false)
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100)
        camera.matrixAutoUpdate = false
        const paint = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
            size: 0.14, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false
        }))
        scene.add(paint)
        // What the camera sees, in play mode only (live, the camera picture is behind).
        const seen = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.04, color: 0x8a8f98, transparent: true, opacity: 0.6 }))
        seen.visible = mode === 'play'
        scene.add(seen)
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.34, 0.42, 4, 1, Math.PI / 4),
            new THREE.MeshBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
        )
        ring.rotation.x = -Math.PI / 2
        ring.visible = false
        scene.add(ring)

        const brain = createScanBrain()
        brainRef.current = brain
        sidecarRef.current = createSidecar({ spaceId, walk, route: mode === 'xr' ? 'webxr' : 'recorded', device: navigator.userAgent })
        recorderRef.current = createSessionRecorder()
        let lastUi = -Infinity
        let lastPaint = -Infinity
        let alive = true

        const keepShot = async () => {
            const grab = await sourceRef.current?.requestGrab()
            if (!alive || !grab?.tick) return
            const sidecar = sidecarRef.current
            const index = sidecar.frames.length + 1
            const file = grab.blob ? `${walk}-${String(index).padStart(4, '0')}.jpg` : null
            addFrame(sidecar, {
                file,
                time: grab.tick.time,
                pose: grab.tick.pose,
                projection: grab.tick.projection,
                width: grab.width || grab.tick.viewport.width,
                height: grab.height || grab.tick.viewport.height,
                sharpness: lastTickRef.current?.sharpness ?? null,
                anchor: lastTickRef.current?.anchor ?? null
            })
            if (grab.blob && saving) {
                queue.add({ projectId: sourcesProject, blob: grab.blob, filename: file, label: `shot ${index}`, kind: 'still' })
            }
            setFlash((n) => n + 1)
        }

        const onTick = (tick) => {
            lastTickRef.current = tick
            recorderRef.current.add(tick)
            const out = brain.step(tick)
            if (out.keep) void keepShot()
            if (mode === 'play') {
                const g = new THREE.BufferGeometry()
                g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tick.samples.flat()), 3))
                seen.geometry.dispose()
                seen.geometry = g
                camera.matrix.compose(new THREE.Vector3(...tick.pose.position), new THREE.Quaternion(...tick.pose.orientation), new THREE.Vector3(1, 1, 1))
                camera.matrixWorld.copy(camera.matrix)
                camera.matrixWorldInverse.copy(camera.matrix).invert()
            }
            if (tick.time - lastPaint >= 500) {
                lastPaint = tick.time
                buildPaint(paint, coverageCells(brain.coverage))
            }
            if (brain.spot) {
                ring.visible = true
                ring.position.set(brain.spot.spot[0], brain.spot.spot[1] + 0.01, brain.spot.spot[2])
            } else ring.visible = false
            if (tick.time - lastUi >= UI_EVERY_MS) {
                lastUi = tick.time
                const spot = brain.spot
                setUi({ shown: out.shown, summary: brain.summary(), spot, arrow: spot ? arrowFor(tick.pose, spot.target) : null })
                const ctx = mapRef.current?.getContext('2d')
                if (ctx) {
                    const model = floorMapModel({ coverage: brain.coverage, path: brain.path, shots: brain.shots, pose: tick.pose, spot, width: MAP_PX, height: MAP_PX })
                    drawFloorMap(ctx, model, { width: MAP_PX, height: MAP_PX, colours: MAP_COLOURS, pulse: Math.sin(tick.time / 255) })
                }
            }
        }

        const breathe = (now) => {
            const s = 1 + 0.08 * Math.sin((now / 1600) * 2 * Math.PI)
            ring.scale.set(s, s, s)
            ring.material.opacity = 0.65 + 0.25 * Math.sin((now / 1600) * 2 * Math.PI)
        }

        if (mode === 'xr' && xrSession) {
            createXrSource({
                session: xrSession,
                renderer,
                draw: () => { breathe(performance.now()); renderer.render(scene, renderer.xr.getCamera()) }
            }).then((source) => {
                if (!alive) { source.stop(); return }
                sourceRef.current = source
                setInfo({ depth: source.depth, camera: null, features: source.features })
                source.start(onTick)
                xrSession.addEventListener('end', () => onLeave?.())
            }).catch((error) => setProblem(`The AR scan could not start: ${error?.message || 'unknown'}`))
        } else {
            const session = recorded || syntheticWalk()
            let projectionSet = false
            const player = playSession(session, (tick) => {
                if (!projectionSet && tick.projection) {
                    camera.projectionMatrix.fromArray(tick.projection)
                    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
                    projectionSet = true
                }
                onTick(tick)
            }, { speed })
            sourceRef.current = {
                kind: 'play',
                requestGrab: async () => ({ blob: null, width: 0, height: 0, tick: lastTickRef.current }),
                stop: () => player.stop()
            }
            setInfo({ depth: 'recorded', camera: session.ticks?.[0]?.viewport || null, features: [] })
            let raf = 0
            const loop = (now) => {
                if (!alive) return
                breathe(now)
                renderer.render(scene, camera)
                raf = requestAnimationFrame(loop)
            }
            raf = requestAnimationFrame(loop)
            const stopRaf = () => cancelAnimationFrame(raf)
            sourceRef.current.stopRaf = stopRaf
        }

        return () => {
            alive = false
            sourceRef.current?.stopRaf?.()
            sourceRef.current?.stop?.()
            renderer.setAnimationLoop(null)
            renderer.dispose()
        }
        // The session is chosen once per mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const t = window.setInterval(() => {
            const size = sourceRef.current?.cameraSize
            if (size) setInfo((i) => (i.camera?.width === size.width ? i : { ...i, camera: size }))
        }, 1000)
        return () => window.clearInterval(t)
    }, [])

    const finish = useCallback(async () => {
        setEnding(true)
        try {
            if (saving) {
                const sidecar = sidecarRef.current
                const json = (value, name) => new File([JSON.stringify(value)], name, { type: 'application/json' })
                await keepWalkFile(sourcesProject, json(sidecar, sidecarFilename(walk)))
                await keepWalkFile(sourcesProject, json(recorderRef.current.session({ walk, space: spaceId }), `${walk}.session.json`))
            }
        } catch (error) {
            setProblem(`The walk’s pose file did not save: ${error?.message || 'unknown'}. The shots are safe.`)
            setEnding(false)
            return
        }
        await sourceRef.current?.stop?.()
        onLeave?.()
    }, [saving, sourcesProject, walk, spaceId, onLeave])

    const { summary, spot, arrow, shown } = ui
    const pct = (n) => (summary.total ? Math.round((100 * n) / summary.total) : 0)
    const words = spotWords(spot, arrow)

    return (
        <div className={`scan-ar${mode === 'play' ? ' is-play' : ''}`}>
            <canvas ref={canvasRef} className="scan-ar-gl" />
            <header className="scan-top">
                <span className="scan-where">
                    <span className="scan-eyebrow">{mode === 'play' ? 'recorded walk' : 'AR scan'}</span>
                    <span className="scan-place">{spaceLabel || spaceId}</span>
                </span>
                <button className="scan-out" type="button" onClick={finish} disabled={ending} aria-label="Finish the AR scan">✕</button>
            </header>

            {mode === 'play' && <p className="scan-ar-band">A recorded walk is playing. Nothing is saved.</p>}
            {problem && <p className="scan-note scan-note-bad scan-ar-problem">{problem}</p>}

            <ul className="scan-ar-warnings" aria-live="assertive">
                {shown.map((id) => <li key={id} className={`scan-ar-warning is-${id}`}>{WARNING_WORDS[id]}</li>)}
            </ul>

            {arrow && (
                <div className="scan-ar-arrow" aria-hidden="true" style={{ '--turn': `${Math.max(-90, Math.min(90, arrow.turn))}deg` }}>
                    <span className={`scan-ar-chevron${Math.abs(arrow.turn) < 20 ? ' is-on' : ''}`} />
                </div>
            )}

            <div className="scan-ar-foot">
                <canvas ref={mapRef} className="scan-ar-map" width={MAP_PX} height={MAP_PX} aria-label="The place from above" role="img" />
                <div className="scan-ar-side">
                    <p className="scan-coach">{words}</p>
                    <dl className="scan-ar-figures">
                        <div><dt><i className="is-good" />seen well</dt><dd>{pct(summary.good)} %</dd></div>
                        <div><dt><i className="is-thin" />thin</dt><dd>{pct(summary.thin)} %</dd></div>
                        <div><dt><i className="is-missed" />missed</dt><dd>{pct(summary.missed)} %</dd></div>
                        <div key={flash} className="scan-ar-kept"><dt>shots kept</dt><dd>{summary.kept}</dd></div>
                    </dl>
                    <p className="scan-small">
                        {info.depth === 'depth' ? 'depth' : info.depth === 'hit-test' ? 'no depth — reading the place by hit points' : info.depth}
                        {info.camera ? ` · camera ${info.camera.width}×${info.camera.height}` : mode === 'xr' ? ' · no camera picture' : ''}
                        {' · real size, in metres'}
                    </p>
                    <button className="scan-btn" type="button" onClick={finish} disabled={ending}>
                        {ending ? 'Saving…' : 'Finish the walk'}
                    </button>
                </div>
            </div>
        </div>
    )
}

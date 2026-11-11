import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createTopEngine } from './topEngine.js'
import { TOP_OPERATORS, resolveTopParams, runsHere, sendsOut } from './topOperators.js'
import { topThumbnailGroups, topThumbnailsFor } from './topThumbnails.js'
import { createThumbnailScheduler } from './thumbnailPlan.js'
import { openSharedCamera } from './cameraPool.js'
import { applySourcesOff, cameraNodeSourceKey, getSourcesOff, subscribeSourcesOff } from './sourceSwitch.js'
import { DECK_INPUTS, VJ_DECK_TYPE, expandDecks, isPictureType } from './vjDeck.js'
import { useClipVideos } from './useClipVideos.js'
import { acquireMachineLink, machinesIn, runnerOn } from './machineLink.js'
import { createPicturePeers } from './picturePeers.js'
import { createPictureOut } from './pictureOut.js'
import { readTopReport, reportTop, useInspectedTop } from './topReports.js'
import { compileTopScript } from './topScripts.js'
import { CameraNotFoundError, cameraRetryDelay, cameraRetryable, resolveCamera } from './cameraResolve.js'

// A camera's capabilities hold functions and odd objects on some browsers;
// what crosses the network is plain numbers, strings and ranges.
const plainCapabilities = (track) => {
    try { return JSON.parse(JSON.stringify(track?.getCapabilities?.() || {})) } catch { return {} }
}
const plainSettings = (track) => {
    try { return JSON.parse(JSON.stringify(track?.getSettings?.() || {})) } catch { return {} }
}

// The picture operators of a project document, as the engine reads them.
// Only wires from a Picture output into a picture input count; a number wired
// into an operator is the rest of the graph's business.
//
// A VJ deck (vj.deck) is a macro: it is expanded here into the Clip In, Blend
// and Level operators that make its picture (tops/vjDeck.js), and every wire
// out of it is rewritten to read its master. `alias` says which engine
// operator has a deck's picture (deck id → its master's id).
// A camera with no new frame for this long has stopped (it never started: the longer one).
export const CAMERA_STALL_MS = 4000
export const CAMERA_START_MS = 12000

export const toTopNetwork = (document) => {
    const nodes = (document?.nodes || [])
        .filter((node) => isPictureType(node.typeId))
        .map((node) => ({ id: node.id, type: node.typeId, values: node.values || {} }))
    const ids = new Set(nodes.map((node) => node.id))
    const decks = new Set(nodes.filter((node) => node.type === VJ_DECK_TYPE).map((node) => node.id))
    const wires = (document?.edges || [])
        .filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId) && edge.fromPort === 'out'
            && (decks.has(edge.toNodeId) ? DECK_INPUTS : ['a', 'b']).includes(edge.toPort))
        .map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, port: edge.toPort }))
    // Every deck expands first, then the wires alias — deck into deck works.
    return expandDecks({ nodes, wires })
}

/**
 * Split a network by machine, as seen from `machineId`.
 *   local     operators this page computes
 *   remote    operators computed elsewhere whose picture a local one reads
 *   previews  operators computed elsewhere, shown only as a card picture
 *   byMachine machineId → the remote operators it owns
 */
export const splitNetwork = (network, machineId) => {
    const local = network.nodes.filter((node) => runsHere(node.values, machineId))
    const localIds = new Set(local.map((node) => node.id))
    const elsewhere = network.nodes.filter((node) => !localIds.has(node.id))
    const remote = new Set(network.wires.filter((wire) => localIds.has(wire.to) && !localIds.has(wire.from)).map((wire) => wire.from))
    const byMachine = new Map()
    for (const node of elsewhere) {
        const list = byMachine.get(node.values.machine) || []
        list.push(node.id)
        byMachine.set(node.values.machine, list)
    }
    return {
        local,
        remote: [...remote],
        previews: elsewhere.map((node) => node.id).filter((id) => !remote.has(id)),
        byMachine
    }
}

// The machines this page can see, for the Runs on menu. One module-level
// answer because the editor draws the menu and the runner owns the link.
const machineListeners = new Set()
let knownMachines = []
const publishMachines = (list) => {
    knownMachines = list
    for (const listener of machineListeners) listener(list)
}
export function useKnownMachines() {
    const [list, setList] = useState(knownMachines)
    useEffect(() => {
        machineListeners.add(setList)
        return () => machineListeners.delete(setList)
    }, [])
    return list
}

/**
 * Why a Camera In on this page shows no picture, in words for the card — or
 * null when the camera opened. Every failure used to land in the hook's
 * `error`, which no editor shows, so the card simply stayed black. Seen
 * 2026-10-02: Raw opened from ANOTHER machine's address over plain http is not
 * a secure page, so the browser hides the camera API entirely.
 */
export const cameraRefusal = ({ secure = true, hasApi = true, errorName = '' } = {}) => {
    if (!secure) {
        return 'This page cannot open a camera: it is plain http from another machine. ' +
            "Open Raw from this machine's own di (localhost), or set Runs on to the machine that has the camera."
    }
    if (!hasApi) return 'This browser gives this page no camera access.'
    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') return 'The camera was not allowed — allow it in the browser, then reload.'
    if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') return 'No camera found on this machine.'
    if (errorName === 'NotReadableError' || errorName === 'AbortError') return 'The camera is busy in another program.'
    if (errorName) return `The camera did not open (${errorName}).`
    return null
}

const EMPTY = { nodes: [], wires: [] }

/**
 * Run a picture network on this page — the part of it that belongs here.
 *
 * @param {object} options
 * @param {{nodes, wires}} options.network   from toTopNetwork
 * @param {string} [options.spaceId]          link to the other machines in this space
 * @param {HTMLCanvasElement|null} [options.canvas]  draw the `show` operator here; omitted, the engine draws offscreen
 * @param {string|null} [options.show]        node id whose picture the canvas shows (a Picture Out)
 * @param {boolean} [options.thumbnails]      feed the cards' pictures
 * @param {(nodeId, numbers) => void} [options.onMeasure]  Analyze readings, local and remote
 * @param {Array|Map} [options.assets]        the project's files, so a Clip In's asset id finds its video
 * @param {string} [options.projectId]        the project those files belong to
 */
export function useTopNetwork({
    network: networkIn = EMPTY, spaceId = '', canvas = null, show = null, thumbnails = false, onMeasure = null,
    assets = null, projectId = null, width = 640, height = 360
}) {
    // Sources the person switched off on this computer (sourceSwitch.js): nothing off, the same network object.
    const sourcesOff = useSyncExternalStore(subscribeSourcesOff, getSourcesOff)
    const network = useMemo(() => applySourcesOff(networkIn, sourcesOff), [networkIn, sourcesOff])
    const [error, setError] = useState('')
    // A camera that cannot open is NOT a fault of the picture: the output stays up and the camera's
    // clip is transparent (topEngine.js blankRule). The reason is reported per node (reportTop) and
    // returned here for a screen that wants to say it, never as `error`, which replaces the picture.
    const [cameraError, setCameraError] = useState('')
    const [link, setLink] = useState(null)
    const [linkView, setLinkView] = useState({ machine: null, peers: [] })
    const engineRef = useRef(null)
    const peersRef = useRef(null)
    const outRef = useRef(null)
    const tracksRef = useRef(new Map())
    // Cameras that are open right now: id -> { key, stream, engine }. The camera effect re-runs when
    // the SET of cameras changes; only a camera whose own spec changed is closed and reopened.
    const liveCamerasRef = useRef(new Map())
    const numbersRef = useRef({})
    const failedScripts = useRef(new Set())
    const inspected = useInspectedTop()
    const onMeasureRef = useRef(onMeasure)
    const showRef = useRef(show)
    useEffect(() => {
        onMeasureRef.current = onMeasure
        showRef.current = show
    })

    const hasNodes = network.nodes.length > 0
    // A page whose browser is on another computer runs only what runs
    // anywhere; the machine's own operators reach it as pictures.
    const machineId = (linkView.machine && !linkView.machine.away && linkView.machine.id) || null
    const scriptsAllowed = linkView.machine?.scripts === true
    const scriptsAllowedRef = useRef(scriptsAllowed)
    useEffect(() => { scriptsAllowedRef.current = scriptsAllowed }, [scriptsAllowed])
    const split = useMemo(() => splitNetwork(network, machineId), [network, machineId])

    // --- the link to the other machines, while there is a network to share
    useEffect(() => {
        if (!spaceId || !hasNodes) return undefined
        const { link: shared, release } = acquireMachineLink(spaceId)
        // Tell the other machines this page runs THIS project, so a viewer
        // there asks this page for its pictures (runnerOn).
        const stopRunning = shared.runProject?.(projectId) || (() => {})
        const off = shared.onPeers((peers, machine) => {
            setLinkView({ machine, peers })
            publishMachines(machinesIn(peers, machine))
        })
        setLink(shared)
        return () => {
            off()
            stopRunning()
            release()
            setLink(null)
        }
    }, [spaceId, hasNodes, projectId])

    // --- the engine lives as long as there is anything to run
    useEffect(() => {
        if (!hasNodes) return undefined
        const target = canvas || globalThis.document?.createElement('canvas')
        if (!target) return undefined
        if (!canvas) { target.width = width; target.height = height }
        let engine
        try {
            engine = createTopEngine({
                canvas: target,
                width,
                height,
                onMeasure: (id, numbers) => {
                    numbersRef.current[id] = numbers
                    onMeasureRef.current?.(id, numbers)
                    peersRef.current?.sendNumbers(id, numbers)
                },
                // A script inside an operator, every frame, on this machine only.
                resolveParams: (node, params, now) => {
                    const source = node.values?.__script
                    if (!source) return null
                    if (!scriptsAllowedRef.current) {
                        reportTop(node.id, { script: 'this machine does not run desk scripts — DI_DESK_SCRIPTS=1 in its di.env turns them on' })
                        return null
                    }
                    const compiled = compileTopScript(source)
                    if (compiled.error) { reportTop(node.id, { script: compiled.error }); return null }
                    if (!compiled.frame || failedScripts.current.has(source)) return null
                    try {
                        const out = compiled.frame({ time: now, params, numbers: numbersRef.current })
                        reportTop(node.id, { script: null })
                        return out && typeof out === 'object' ? out : null
                    } catch (error) {
                        // One throw stops it until the code changes: a script that
                        // throws sixty times a second would bury the page.
                        failedScripts.current.add(source)
                        reportTop(node.id, { script: String(error?.message || error) })
                        return null
                    }
                }
            })
        } catch (caught) {
            setError(String(caught?.message || caught))
            return undefined
        }
        setError('')
        engineRef.current = engine
        let raf = 0
        let count = 0
        const tiles = createThumbnailScheduler()
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            engine.frame(now)
            count += 1
            if (thumbnails) {
                // One map per layer of registrations: a deck's master is on
                // its card AND in its window at once. The scheduler says which
                // tiles are due on this frame (small cards 4 a second, a few
                // per frame; big windows as before).
                for (const mine of tiles.due(topThumbnailGroups(), (nodeId) => engine.has(nodeId), now)) engine.thumbnails(mine)
            }
            peersRef.current?.pump()
            // Same task as the thumbnails, before the browser composites: the
            // sender reads its copy out of the engine canvas's corner too.
            outRef.current?.pump()
            if (showRef.current) engine.show(showRef.current)
            // Shader compile results, for whoever is looking inside.
            if (count % 30 === 0) {
                for (const node of engine.network.nodes) {
                    if (node.values?.__shader !== undefined) reportTop(node.id, { shader: engine.errorFor(node.id) })
                }
            }
        }
        raf = requestAnimationFrame(loop)
        return () => {
            cancelAnimationFrame(raf)
            engine.dispose()
            engineRef.current = null
        }
    }, [hasNodes, canvas, width, height, thumbnails])

    // --- pictures between machines, once linked
    useEffect(() => {
        if (!link || typeof RTCPeerConnection === 'undefined') return undefined
        const peers = createPicturePeers({
            link,
            drawNode: (nodeId, context) => {
                const engine = engineRef.current
                if (!engine?.has(nodeId)) return false
                engine.thumbnails(new Map([[nodeId, context]]))
                return true
            },
            onVideo: (nodeId, video) => engineRef.current?.setRemoteVideo(nodeId, video),
            onPreview: (nodeId, blob) => {
                const contexts = topThumbnailsFor(nodeId)
                if (!contexts.length || !globalThis.createImageBitmap) return
                createImageBitmap(blob).then((bitmap) => {
                    for (const context of contexts) context.drawImage(bitmap, 0, 0, context.canvas.width, context.canvas.height)
                    bitmap.close?.()
                }).catch(() => {})
            },
            onNumbers: (nodeId, numbers) => onMeasureRef.current?.(nodeId, numbers),
            onReport: (nodeId, report) => reportTop(nodeId, report)
        })
        peersRef.current = peers
        return () => {
            peers.stop()
            peersRef.current = null
        }
    }, [link])

    // --- the pictures this page sends off the machine (Send Out)
    // Alive as long as the engine is: stop() takes every output off the
    // network the moment the page stops feeding it. What the sender has to
    // say goes out as a report, the same channel a camera's or a shader's
    // state already travels on, so a page looking inside hears it too.
    useEffect(() => {
        if (!hasNodes) return undefined
        const out = createPictureOut({
            drawNode: (nodeId, context) => {
                const engine = engineRef.current
                if (!engine?.has(nodeId)) return false
                engine.thumbnails(new Map([[nodeId, context]]))
                return true
            },
            size: () => {
                const engine = engineRef.current
                if (!engine) return null
                const target = engine.gl?.canvas
                return { width: target?.width || engine.width, height: target?.height || engine.height }
            },
            onState: (nodeId, state) => reportTop(nodeId, { send: state })
        })
        outRef.current = out
        return () => {
            out.stop()
            outRef.current = null
        }
    }, [hasNodes])
    // The names, as the server will see them. Only a Send Out that runs HERE
    // sends from here; its twin on another machine sends from there.
    const sendKey = useMemo(
        () => JSON.stringify(split.local
            .filter((node) => sendsOut(node.type))
            .map((node) => [node.id, resolveTopParams(node.type, node.values).name])),
        [split]
    )
    useEffect(() => {
        outRef.current?.setOutputs(new Map(JSON.parse(sendKey)))
    }, [sendKey, hasNodes])

    // --- what this page needs from each machine's runner
    useEffect(() => {
        const peers = peersRef.current
        if (!peers || !link) return
        const wants = new Map()
        const remote = new Set(split.remote)
        const types = new Map(network.nodes.map((node) => [node.id, node.type]))
        for (const [owner, nodeIds] of split.byMachine) {
            const needsCapture = nodeIds.some((nodeId) => TOP_OPERATORS[types.get(nodeId)]?.source === 'camera')
            const runner = runnerOn(linkView.peers, owner, link.peerId, { projectId, needsCapture })
            if (!runner) continue
            const want = wants.get(runner.peerId) || { video: [], preview: [] }
            for (const nodeId of nodeIds) {
                if (remote.has(nodeId) || nodeId === inspected) want.video.push(nodeId)
                else if (thumbnails) want.preview.push(nodeId)
            }
            wants.set(runner.peerId, want)
        }
        peers.setWants(wants)
    }, [split, linkView, link, thumbnails, inspected, network, projectId])

    // What this machine knows about its own operators goes to the pages looking
    // at them, every couple of seconds — a page that connects late still hears.
    useEffect(() => {
        if (!hasNodes) return undefined
        const timer = setInterval(() => {
            const peers = peersRef.current
            if (!peers) return
            for (const node of split.local) {
                const report = readTopReport(node.id)
                if (Object.keys(report).length) peers.sendReport(node.id, report)
            }
        }, 2000)
        return () => clearInterval(timer)
    }, [split, hasNodes])

    // --- every Clip In that runs here (a deck's too) gets its footage playing.
    // After the engine effect, so the ref is filled when these effects run.
    useClipVideos(split.local, { spaceId, engine: engineRef, assets, projectId })

    // --- a parameter drag or a new wire changes the network, not the engine
    // An operator someone is looking inside, running elsewhere, arrives as video
    // too — it needs a slot to land in even though nothing here is wired to it.
    const remoteIds = useMemo(() => {
        const ids = new Set(split.remote)
        if (inspected && split.byMachine && [...split.byMachine.values()].some((list) => list.includes(inspected))) ids.add(inspected)
        return [...ids]
    }, [split, inspected])
    useEffect(() => {
        engineRef.current?.setNetwork({ nodes: split.local, wires: network.wires, remote: remoteIds })
    }, [split, network, hasNodes, canvas, remoteIds])

    // --- one camera stream per Camera In that runs HERE
    const cameraKey = useMemo(
        () => JSON.stringify(split.local
            .filter((node) => TOP_OPERATORS[node.type].source === 'camera')
            // A fifth entry only for a camera that is switched off: the key of a deck with nothing off is unchanged.
            .map((node) => [node.id, node.values.device || '', node.values.deviceLabel || '', scriptsAllowed ? (node.values.__script || '') : '',
                ...(sourcesOff.has(cameraNodeSourceKey(node)) ? [true] : [])])),
        [split, scriptsAllowed, sourcesOff]
    )
    // Constraints change a running camera in place — no re-open, no black frame.
    const constraintsKey = useMemo(
        () => JSON.stringify(split.local
            .filter((node) => TOP_OPERATORS[node.type].source === 'camera')
            .map((node) => [node.id, node.values.__constraints || null])),
        [split]
    )
    const constraintsFor = (nodeId) => {
        const node = split.local.find((n) => n.id === nodeId)
        const value = node?.values?.__constraints
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    }
    const constraintsForRef = useRef(constraintsFor)
    const lostCameraRef = useRef(() => {})
    useEffect(() => { constraintsForRef.current = constraintsFor })
    useEffect(() => {
        for (const [nodeId, constraints] of JSON.parse(constraintsKey)) {
            const track = tracksRef.current.get(nodeId)
            if (!track || !constraints) continue
            track.applyConstraints(constraints)
                .then(() => reportTop(nodeId, { camera: { label: track.label, capabilities: plainCapabilities(track), settings: plainSettings(track), error: null } }))
                .catch((error) => reportTop(nodeId, { camera: { ...(readTopReport(nodeId).camera || {}), error: String(error?.message || error?.name || error) } }))
        }
    }, [constraintsKey])
    useEffect(() => {
        const cameras = JSON.parse(cameraKey)
        // A camera that is off is closed by the loop below (its key changed) and never opened: it is a
        // choice, so no error is reported for it and nothing is retried.
        const ids = cameras.filter((camera) => camera[4] !== true).map(([id]) => id)
        const offIds = cameras.filter((camera) => camera[4] === true).map(([id]) => id)
        // Per camera: close what is gone or changed (or whose engine was replaced and so knows
        // no video); an unchanged camera stays open and is not touched.
        const live = liveCamerasRef.current
        const wantedKeys = new Map(cameras.map((camera) => [camera[0], JSON.stringify(camera)]))
        for (const [id, entry] of [...live]) {
            if (wantedKeys.get(id) === entry.key && entry.engine === engineRef.current) continue
            entry.engine?.setVideo(id, null)
            entry.stream.getTracks().forEach((track) => track.stop())
            tracksRef.current.delete(id)
            live.delete(id)
        }
        for (const id of offIds) reportTop(id, { camera: { error: null, errorName: null, blocked: false } })
        if (offIds.length && !ids.length) setCameraError('')
        if (!ids.length) return undefined
        const media = globalThis.navigator?.mediaDevices
        if (!media?.getUserMedia) {
            const refusal = cameraRefusal({ secure: globalThis.isSecureContext !== false, hasApi: false })
            for (const id of ids) reportTop(id, { camera: { error: refusal, blocked: true } })
            setCameraError(refusal)
            return undefined
        }
        let cancelled = false
        // A camera's id is per page: the Desk on another page of this machine
        // may have recorded a different one. The label is the fallback; a NAMED
        // camera never falls to the default one (cameraResolve.js). A camera that
        // cannot open is reported with its error name and tried again on a slow
        // back-off, and at once when a device appears.
        const timers = new Map()
        const attempts = new Map()
        const running = new Set()
        const again = new Set()
        const permission = { asked: false }
        const failed = (id, caught) => {
            if (caught?.name === 'SourceOff') return // switched off (cameraPool.js): a choice, not a fault
            const errorName = caught?.name || 'Error'
            const camera = caught instanceof CameraNotFoundError ? caught.camera : null
            const refusal = camera ? `Camera "${camera}" not found.` : cameraRefusal({ errorName })
            reportTop(id, { camera: { error: refusal, errorName, blocked: true } })
            setCameraError(refusal)
            if (!cameraRetryable(errorName)) return
            const attempt = attempts.get(id) || 0
            attempts.set(id, attempt + 1)
            clearTimeout(timers.get(id))
            timers.set(id, setTimeout(() => open(id), cameraRetryDelay(attempt)))
        }
        const spec = new Map(cameras.map(([id, deviceId, label, script]) => [id, { deviceId, label, script }]))
        const open = async (id) => {
            if (cancelled) return
            if (running.has(id)) { again.add(id); return }
            if (live.has(id)) return // already open and unchanged
            running.add(id)
            clearTimeout(timers.get(id))
            try {
                const { deviceId, label, script } = spec.get(id)
                const video = await resolveCamera(media, deviceId, label, permission)
                const constraints = { ...(video === true ? {} : video), ...constraintsForRef.current(id) }
                const compiled = script ? compileTopScript(script) : {}
                let stream = null
                if (compiled.open) {
                    try {
                        stream = await compiled.open({ constraints, deviceId: video?.deviceId?.exact || null, mediaDevices: media })
                        reportTop(id, { script: null })
                    } catch (error) {
                        reportTop(id, { script: String(error?.message || error) })
                    }
                }
                if (!stream) stream = await openSharedCamera(media, { video: Object.keys(constraints).length ? constraints : true, audio: false })
                if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
                live.set(id, { key: wantedKeys.get(id), stream, engine: engineRef.current })
                attempts.delete(id)
                const track = stream.getVideoTracks()[0]
                if (track) {
                    tracksRef.current.set(id, track)
                    reportTop(id, { camera: { label: track.label, capabilities: plainCapabilities(track), settings: plainSettings(track), error: null, errorName: null, blocked: false } })
                }
                const element = globalThis.document.createElement('video')
                element.muted = true
                element.playsInline = true
                element.srcObject = stream
                element.play?.()?.catch?.(() => {})
                engineRef.current?.setVideo(id, element)
                watchCamera(id, stream, element, track)
            } catch (caught) {
                if (!cancelled) failed(id, caught)
            } finally {
                running.delete(id)
                // A device changed while this try ran: look again, unless it opened.
                if (again.delete(id) && !cancelled && !tracksRef.current.has(id)) open(id)
            }
        }
        // A camera that was open can stop: its feed restarts (a phone over wifi), the
        // cable is pulled, the device ends the track. The picture then stays on its
        // last frame for ever unless somebody looks. Each open camera is watched: an
        // ended track, or no new frame for CAMERA_STALL_MS, closes it and opens it
        // again on the same back-off as a camera that never opened.
        lostCameraRef.current = (id) => {
            if (cancelled || !spec.has(id)) return
            failed(id, { name: 'CameraStopped' })
        }
        const watchCamera = (id, stream, element, track) => {
            let last = null
            let since = Date.now()
            let flowed = false
            const lose = () => {
                clearInterval(timer)
                track?.removeEventListener?.('ended', lose)
                if (live.get(id)?.stream !== stream) return
                live.get(id).engine?.setVideo(id, null)
                stream.getTracks().forEach((each) => each.stop())
                tracksRef.current.delete(id)
                live.delete(id)
                lostCameraRef.current(id)
            }
            const timer = setInterval(() => {
                if (live.get(id)?.stream !== stream) { clearInterval(timer); return }
                const now = element.currentTime
                if (now !== last && element.readyState >= 2) {
                    last = now
                    since = Date.now()
                    flowed = true
                    return
                }
                // Never a frame yet: only a track the browser itself calls muted (no
                // frames arriving) is given up on; a slow first frame is waited for.
                if (!flowed && track?.muted !== true) return
                if (Date.now() - since > (flowed ? CAMERA_STALL_MS : CAMERA_START_MS)) lose()
            }, 1000)
            track?.addEventListener?.('ended', lose)
        }
        const onDeviceChange = () => { for (const id of ids) if (!live.has(id)) open(id) }
        media.addEventListener?.('devicechange', onDeviceChange)
        for (const id of ids) open(id)
        return () => {
            // Only this run's own work ends here; the open cameras outlive it (the next run keeps
            // or closes each one, and the unmount effect below closes what is left).
            cancelled = true
            media.removeEventListener?.('devicechange', onDeviceChange)
            for (const timer of timers.values()) clearTimeout(timer)
        }
    }, [cameraKey, hasNodes, canvas])
    useEffect(() => () => {
        const live = liveCamerasRef.current
        for (const [id, entry] of live) {
            entry.engine?.setVideo(id, null)
            entry.stream.getTracks().forEach((track) => track.stop())
            tracksRef.current.delete(id)
        }
        live.clear()
    }, [])

    return { error, cameraError, machine: linkView.machine, peers: linkView.peers }
}

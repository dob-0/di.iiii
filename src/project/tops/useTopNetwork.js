import { useEffect, useMemo, useRef, useState } from 'react'
import { createTopEngine } from './topEngine.js'
import { TOP_OPERATORS, isTopType, runsHere } from './topOperators.js'
import { topThumbnailTargets } from './topThumbnails.js'
import { acquireMachineLink, machinesIn, runnerOn } from './machineLink.js'
import { createPicturePeers } from './picturePeers.js'
import { readTopReport, reportTop, useInspectedTop } from './topReports.js'
import { compileTopScript } from './topScripts.js'

// A camera's capabilities hold functions and odd objects on some browsers;
// what crosses the network is plain numbers, strings and ranges.
const plainCapabilities = (track) => {
    try { return JSON.parse(JSON.stringify(track?.getCapabilities?.() || {})) } catch { return {} }
}
const plainSettings = (track) => {
    try { return JSON.parse(JSON.stringify(track?.getSettings?.() || {})) } catch { return {} }
}

// The picture operators of a project document, as the engine reads them.
// Only wires into a picture input count; a number wired into an operator's
// setting is the rest of the graph's business.
//
// Pictures cross the wall both ways:
//   feeds    a picture from the REST of the graph (a Webcam's or a Video's
//            Frame) wired into an operator's A/B. The engine reads it like a
//            remote operator's video — see useTopNetwork's feedMedia.
//   exports  operators whose Picture is wired OUT to the rest of the graph
//            (a Monitor, a Plane's texture, an Image). Only these pay for a
//            copy the room can use — see useTopNetwork's onPicture.
export const toTopNetwork = (document) => {
    const nodes = (document?.nodes || [])
        .filter((node) => isTopType(node.typeId))
        .map((node) => ({ id: node.id, type: node.typeId, values: node.values || {} }))
    const ids = new Set(nodes.map((node) => node.id))
    const known = new Set((document?.nodes || []).map((node) => node.id))
    const wires = []
    const feeds = []
    const exports = new Set()
    for (const edge of document?.edges || []) {
        if (!edge) continue
        const intoPicture = ids.has(edge.toNodeId) && ['a', 'b'].includes(edge.toPort)
        if (intoPicture && ids.has(edge.fromNodeId) && edge.fromPort === 'out') {
            wires.push({ from: edge.fromNodeId, to: edge.toNodeId, port: edge.toPort })
        } else if (intoPicture && known.has(edge.fromNodeId) && !ids.has(edge.fromNodeId)) {
            wires.push({ from: edge.fromNodeId, to: edge.toNodeId, port: edge.toPort })
            if (!feeds.some((feed) => feed.id === edge.fromNodeId && feed.port === edge.fromPort)) {
                feeds.push({ id: edge.fromNodeId, port: edge.fromPort })
            }
        } else if (ids.has(edge.fromNodeId) && edge.fromPort === 'out' && known.has(edge.toNodeId) && !ids.has(edge.toNodeId)) {
            exports.add(edge.fromNodeId)
        }
    }
    return { nodes, wires, feeds, exports: [...exports] }
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
    const feedIds = new Set((network.feeds || []).map((feed) => feed.id))
    const remote = new Set(network.wires.filter((wire) => localIds.has(wire.to) && !localIds.has(wire.from) && !feedIds.has(wire.from)).map((wire) => wire.from))
    // A picture the rest of THIS page's graph shows, computed elsewhere, has to
    // arrive as video too — a Monitor here cannot watch a thumbnail.
    const elsewhereIds = new Set(elsewhere.map((node) => node.id))
    for (const id of network.exports || []) if (elsewhereIds.has(id)) remote.add(id)
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

const THUMBNAIL_EVERY = 3
// An exported picture: enough for a Monitor or a Plane in the room, cheap to
// copy out of the GPU on a 2012 laptop (every THUMBNAIL_EVERY frames).
const PICTURE_W = 320
const PICTURE_H = 180
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
 * @param {(nodeId, port) => (HTMLVideoElement|HTMLCanvasElement|null)} [options.feedMedia]
 *        the picture a non-operator node hands an operator (network.feeds)
 * @param {(nodeId, canvas|null) => void} [options.onPicture]  an exported operator's
 *        picture canvas (network.exports), once when it appears and null when it goes
 * @param {(nodeIds: string[]) => void} [options.onPicturesDrawn]  those canvases were redrawn
 * @param {boolean} [options.cameras]  may this page open cameras (false on a public page)
 */
export function useTopNetwork({
    network = EMPTY, spaceId = '', canvas = null, show = null, thumbnails = false, onMeasure = null,
    feedMedia = null, onPicture = null, onPicturesDrawn = null, cameras = true,
    width = 640, height = 360
}) {
    const [error, setError] = useState('')
    const [link, setLink] = useState(null)
    const [linkView, setLinkView] = useState({ machine: null, peers: [] })
    const engineRef = useRef(null)
    const peersRef = useRef(null)
    const tracksRef = useRef(new Map())
    const numbersRef = useRef({})
    const failedScripts = useRef(new Set())
    const inspected = useInspectedTop()
    const onMeasureRef = useRef(onMeasure)
    const showRef = useRef(show)
    const feedMediaRef = useRef(feedMedia)
    const onPictureRef = useRef(onPicture)
    const onPicturesDrawnRef = useRef(onPicturesDrawn)
    const networkRef = useRef(network)
    useEffect(() => {
        onMeasureRef.current = onMeasure
        showRef.current = show
        feedMediaRef.current = feedMedia
        onPictureRef.current = onPicture
        onPicturesDrawnRef.current = onPicturesDrawn
        networkRef.current = network
    })
    // One small canvas per exported operator: what a Monitor, a Plane or an
    // Image downstream actually draws. Created when the wire appears.
    const picturesRef = useRef(new Map())

    const hasNodes = network.nodes.length > 0
    const machineId = linkView.machine?.id || null
    const scriptsAllowed = linkView.machine?.scripts === true
    const scriptsAllowedRef = useRef(scriptsAllowed)
    useEffect(() => { scriptsAllowedRef.current = scriptsAllowed }, [scriptsAllowed])
    const split = useMemo(() => splitNetwork(network, machineId), [network, machineId])

    // --- the link to the other machines, while there is a network to share
    useEffect(() => {
        if (!spaceId || !hasNodes) return undefined
        const { link: shared, release } = acquireMachineLink(spaceId)
        const off = shared.onPeers((peers, machine) => {
            setLinkView({ machine, peers })
            publishMachines(machinesIn(peers, machine))
        })
        setLink(shared)
        return () => {
            off()
            release()
            setLink(null)
        }
    }, [spaceId, hasNodes])

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
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            // Pictures from the rest of the graph, into the slots operators read.
            const current = networkRef.current
            if (current.feeds?.length && feedMediaRef.current) {
                for (const feed of current.feeds) engine.setRemoteVideo(feed.id, feedMediaRef.current(feed.id, feed.port) || null)
            }
            engine.frame(now)
            count += 1
            if (count % THUMBNAIL_EVERY === 0) {
                if (thumbnails) {
                    const targets = topThumbnailTargets()
                    if (targets.size) {
                        const mine = new Map([...targets].filter(([nodeId]) => engine.has(nodeId)))
                        if (mine.size) engine.thumbnails(mine)
                    }
                }
                // Exported pictures: one GPU copy each into its own canvas.
                if (picturesRef.current.size) {
                    const exported = new Map()
                    for (const [nodeId, picture] of picturesRef.current) if (engine.has(nodeId)) exported.set(nodeId, picture.context)
                    if (exported.size) {
                        engine.thumbnails(exported)
                        onPicturesDrawnRef.current?.([...exported.keys()])
                    }
                }
            }
            peersRef.current?.pump()
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
                const context = topThumbnailTargets().get(nodeId)
                if (!context || !globalThis.createImageBitmap) return
                createImageBitmap(blob).then((bitmap) => {
                    context.drawImage(bitmap, 0, 0, context.canvas.width, context.canvas.height)
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

    // --- what this page needs from each machine's runner
    useEffect(() => {
        const peers = peersRef.current
        if (!peers || !link) return
        const wants = new Map()
        const remote = new Set(split.remote)
        for (const [owner, nodeIds] of split.byMachine) {
            const runner = runnerOn(linkView.peers, owner, link.peerId)
            if (!runner) continue
            const want = wants.get(runner.peerId) || { video: [], preview: [] }
            for (const nodeId of nodeIds) {
                if (remote.has(nodeId) || nodeId === inspected) want.video.push(nodeId)
                else if (thumbnails) want.preview.push(nodeId)
            }
            wants.set(runner.peerId, want)
        }
        peers.setWants(wants)
    }, [split, linkView, link, thumbnails, inspected])

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

    // --- a parameter drag or a new wire changes the network, not the engine
    // An operator someone is looking inside, running elsewhere, arrives as video
    // too — it needs a slot to land in even though nothing here is wired to it.
    const remoteIds = useMemo(() => {
        const ids = new Set(split.remote)
        // A picture fed in from the rest of the graph lands in a slot like a
        // remote operator's video does.
        for (const feed of network.feeds || []) ids.add(feed.id)
        if (inspected && split.byMachine && [...split.byMachine.values()].some((list) => list.includes(inspected))) ids.add(inspected)
        return [...ids]
    }, [split, inspected, network])
    useEffect(() => {
        engineRef.current?.setNetwork({ nodes: split.local, wires: network.wires, remote: remoteIds })
    }, [split, network, hasNodes, canvas, remoteIds])

    // --- an exported operator's picture canvas appears with its wire and goes with it
    const exportsKey = (network.exports || []).join('|')
    useEffect(() => {
        const wanted = new Set(exportsKey ? exportsKey.split('|') : [])
        const pictures = picturesRef.current
        for (const [nodeId] of pictures) {
            if (wanted.has(nodeId)) continue
            pictures.delete(nodeId)
            onPictureRef.current?.(nodeId, null)
        }
        for (const nodeId of wanted) {
            if (pictures.has(nodeId)) continue
            const pictureCanvas = globalThis.document?.createElement('canvas')
            const context = pictureCanvas?.getContext?.('2d')
            if (!context) continue
            pictureCanvas.width = PICTURE_W
            pictureCanvas.height = PICTURE_H
            pictures.set(nodeId, { canvas: pictureCanvas, context })
            onPictureRef.current?.(nodeId, pictureCanvas)
        }
    }, [exportsKey])
    useEffect(() => () => {
        for (const [nodeId] of picturesRef.current) onPictureRef.current?.(nodeId, null)
        picturesRef.current.clear()
    }, [])

    // --- one camera stream per Camera In that runs HERE (never on a page that may not ask)
    const cameraKey = useMemo(
        () => JSON.stringify(split.local
            .filter(() => cameras)
            .filter((node) => TOP_OPERATORS[node.type].source === 'camera')
            .map((node) => [node.id, node.values.device || '', node.values.deviceLabel || '', scriptsAllowed ? (node.values.__script || '') : ''])),
        [split, scriptsAllowed, cameras]
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
        const ids = cameras.map(([id]) => id)
        if (!ids.length) return undefined
        const media = globalThis.navigator?.mediaDevices
        if (!media?.getUserMedia) { setError('no camera access in this browser'); return undefined }
        const streams = []
        const tracks = tracksRef.current
        let cancelled = false
        // A camera's id is per page: the Desk on another page of this machine
        // may have recorded a different one. The label is the fallback, and the
        // machine's default camera the last word.
        const resolveCamera = async (deviceId, label) => {
            if (!deviceId && !label) return true
            try {
                const list = (await media.enumerateDevices()).filter((device) => device.kind === 'videoinput')
                const found = list.find((device) => device.deviceId === deviceId) || list.find((device) => label && device.label === label)
                return found ? { deviceId: { exact: found.deviceId } } : true
            } catch {
                return true
            }
        }
        for (const [id, deviceId, label, script] of cameras) {
            resolveCamera(deviceId, label)
                .then(async (video) => {
                    const constraints = { ...(video === true ? {} : video), ...constraintsForRef.current(id) }
                    const compiled = script ? compileTopScript(script) : {}
                    if (compiled.open) {
                        try {
                            const stream = await compiled.open({ constraints, deviceId: video?.deviceId?.exact || null, mediaDevices: media })
                            reportTop(id, { script: null })
                            return stream
                        } catch (error) {
                            reportTop(id, { script: String(error?.message || error) })
                        }
                    }
                    return media.getUserMedia({ video: Object.keys(constraints).length ? constraints : true, audio: false })
                })
                .then((stream) => {
                    if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
                    streams.push(stream)
                    const track = stream.getVideoTracks()[0]
                    if (track) {
                        tracksRef.current.set(id, track)
                        reportTop(id, { camera: { label: track.label, capabilities: plainCapabilities(track), settings: plainSettings(track), error: null } })
                    }
                    const video = globalThis.document.createElement('video')
                    video.muted = true
                    video.playsInline = true
                    video.srcObject = stream
                    video.play().catch(() => {})
                    engineRef.current?.setVideo(id, video)
                })
                .catch((caught) => {
                    if (!cancelled) setError(caught?.name === 'NotAllowedError' ? 'camera not permitted' : 'camera unavailable')
                })
        }
        return () => {
            cancelled = true
            for (const id of ids) { engineRef.current?.setVideo(id, null); tracks.delete(id) }
            streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
        }
    }, [cameraKey, hasNodes, canvas])

    return { error, machine: linkView.machine, peers: linkView.peers }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createTopEngine } from './topEngine.js'
import { TOP_OPERATORS, isTopType, resolveTopParams, runsHere, sendsOut } from './topOperators.js'
import { topThumbnailTargets } from './topThumbnails.js'
import { acquireMachineLink, machinesIn, runnerOn } from './machineLink.js'
import { createPicturePeers } from './picturePeers.js'
import { createPictureOut } from './pictureOut.js'
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
// Only wires from a Picture output into a picture input count; a number wired
// into an operator is the rest of the graph's business.
export const toTopNetwork = (document) => {
    const nodes = (document?.nodes || [])
        .filter((node) => isTopType(node.typeId))
        .map((node) => ({ id: node.id, type: node.typeId, values: node.values || {} }))
    const ids = new Set(nodes.map((node) => node.id))
    const wires = (document?.edges || [])
        .filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId) && edge.fromPort === 'out' && ['a', 'b'].includes(edge.toPort))
        .map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, port: edge.toPort }))
    return { nodes, wires }
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

const THUMBNAIL_EVERY = 3
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
 */
export function useTopNetwork({ network = EMPTY, spaceId = '', canvas = null, show = null, thumbnails = false, onMeasure = null, width = 640, height = 360 }) {
    const [error, setError] = useState('')
    const [link, setLink] = useState(null)
    const [linkView, setLinkView] = useState({ machine: null, peers: [] })
    const engineRef = useRef(null)
    const peersRef = useRef(null)
    const outRef = useRef(null)
    const tracksRef = useRef(new Map())
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
            engine.frame(now)
            count += 1
            if (thumbnails && count % THUMBNAIL_EVERY === 0) {
                const targets = topThumbnailTargets()
                if (targets.size) {
                    const mine = new Map([...targets].filter(([nodeId]) => engine.has(nodeId)))
                    if (mine.size) engine.thumbnails(mine)
                }
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
            .map((node) => [node.id, node.values.device || '', node.values.deviceLabel || '', scriptsAllowed ? (node.values.__script || '') : ''])),
        [split, scriptsAllowed]
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

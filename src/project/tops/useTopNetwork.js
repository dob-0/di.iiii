import { useEffect, useMemo, useRef, useState } from 'react'
import { createTopEngine } from './topEngine.js'
import { TOP_OPERATORS, isTopType, runsHere } from './topOperators.js'
import { topThumbnailTargets } from './topThumbnails.js'
import { createMachineLink, machinesIn, runnerOn } from './machineLink.js'
import { createPicturePeers } from './picturePeers.js'

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
    const onMeasureRef = useRef(onMeasure)
    const showRef = useRef(show)
    useEffect(() => {
        onMeasureRef.current = onMeasure
        showRef.current = show
    })

    const hasNodes = network.nodes.length > 0
    const machineId = linkView.machine?.id || null
    const split = useMemo(() => splitNetwork(network, machineId), [network, machineId])

    // --- the link to the other machines, while there is a network to share
    useEffect(() => {
        if (!spaceId || !hasNodes) return undefined
        const created = createMachineLink({ spaceId, role: 'runner' })
        const off = created.onPeers((peers, machine) => {
            setLinkView({ machine, peers })
            publishMachines(machinesIn(peers, machine))
        })
        setLink(created)
        return () => {
            off()
            created.stop()
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
                    onMeasureRef.current?.(id, numbers)
                    peersRef.current?.sendNumbers(id, numbers)
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
            if (showRef.current) engine.show(showRef.current)
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
            onNumbers: (nodeId, numbers) => onMeasureRef.current?.(nodeId, numbers)
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
                if (remote.has(nodeId)) want.video.push(nodeId)
                else if (thumbnails) want.preview.push(nodeId)
            }
            wants.set(runner.peerId, want)
        }
        peers.setWants(wants)
    }, [split, linkView, link, thumbnails])

    // --- a parameter drag or a new wire changes the network, not the engine
    useEffect(() => {
        engineRef.current?.setNetwork({ nodes: split.local, wires: network.wires, remote: split.remote })
    }, [split, network, hasNodes, canvas])

    // --- one camera stream per Camera In that runs HERE
    const cameraIds = useMemo(
        () => split.local.filter((node) => TOP_OPERATORS[node.type].source === 'camera').map((node) => node.id).join(','),
        [split]
    )
    useEffect(() => {
        const ids = cameraIds ? cameraIds.split(',') : []
        if (!ids.length) return undefined
        const media = globalThis.navigator?.mediaDevices
        if (!media?.getUserMedia) { setError('no camera access in this browser'); return undefined }
        const streams = []
        let cancelled = false
        for (const id of ids) {
            media.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                    if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
                    streams.push(stream)
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
            for (const id of ids) engineRef.current?.setVideo(id, null)
            streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
        }
    }, [cameraIds, hasNodes, canvas])

    return { error, machine: linkView.machine, peers: linkView.peers }
}

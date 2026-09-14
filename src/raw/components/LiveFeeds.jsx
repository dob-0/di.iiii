import { useCallback, useMemo } from 'react'
import { evaluateNodeInput, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'
import { isPictureType } from '../../project/tops/vjDeck.js'
import TopNetworkFeed from './TopNetworkFeed.jsx'
import VideoFrameFeed from './VideoFrameFeed.jsx'
import SoundAnalysisFeed from './SoundAnalysisFeed.jsx'
import KeyboardFeed from './KeyboardFeed.jsx'
import MidiOutFeed from './MidiOutFeed.jsx'
import { WebcamFeed } from './WebcamSourcePanel.jsx'
import { MicFeed } from './MicSourcePanel.jsx'
import { MidiInputFeed } from './MidiInputPanel.jsx'
import { DmxOutFeed } from './DmxOutPanelWindow.jsx'
import { KeeperFeed } from './KeeperPanelWindow.jsx'

// Every live feed a document needs, for as long as its node exists — never
// for as long as a window is open. A window is a view: it can close, go
// fullscreen or sit in another scope, and the Webcam still feeds the Plane,
// the Mic still moves the Sphere, MIDI still fires the Counter, DMX still
// follows the graph. Invisible; mounted once per surface that runs a graph
// (the editor, /out, a published page).
//
// `allow` says which feeds this surface may run. A device that asks the
// browser for permission (camera, microphone, MIDI) or reaches out to the
// LAN (DMX, a keeper) is the editor's and /out's business; a public visitor
// gets only what needs no prompt (video frames, sound levels, the keyboard,
// picture operators that open no camera).
export const EDITOR_FEEDS = Object.freeze({
    pictures: true, cameras: true, video: true, sound: true, keyboard: true,
    webcam: true, mic: true, midiIn: true, midiOut: true, dmx: true, keeper: true
})
// /out: everything that LISTENS, nothing that sends — the editor already
// drives the rig, and two pages sending would double every cue.
export const OUTPUT_FEEDS = Object.freeze({
    ...EDITOR_FEEDS, midiOut: false, dmx: false, keeper: false
})
export const PUBLIC_FEEDS = Object.freeze({
    pictures: true, cameras: false, video: true, sound: true, keyboard: true,
    webcam: false, mic: false, midiIn: false, midiOut: false, dmx: false, keeper: false
})

const byType = (nodes, typeId) => nodes.filter((node) => node.typeId === typeId)

export default function LiveFeeds({
    document,
    graphContext,
    liveOutputs = null,
    assetMap = null,
    spaceId = '',
    projectId = null,
    onLiveOutputChange,
    allow = EDITOR_FEEDS
}) {
    const nodes = useMemo(() => document?.nodes || [], [document?.nodes])
    const assets = useMemo(
        () => assetMap || new Map((document?.assets || []).map((asset) => [asset.id, asset])),
        [assetMap, document?.assets]
    )

    // Stable per-port wrappers. These MUST NOT be inline lambdas: the feeds'
    // effects depend on the callback identity, and a fresh lambda per render
    // makes cleanup fire every render — with a live capture that is
    // set→delete→set on liveOutputs, an infinite update loop (hit with an
    // active webcam, 2026-08-08).
    const publish = onLiveOutputChange
    const onFrame = useCallback((nodeId, texture) => publish(nodeId, 'frame', texture), [publish])
    const onKey = useCallback((nodeId, pressed, count) => {
        publish(nodeId, 'pressed', pressed)
        publish(nodeId, 'count', count)
    }, [publish])
    const onStatus = useCallback((nodeId, status) => publish(nodeId, 'status', status), [publish])
    const onSound = useCallback((nodeId, levels) => {
        publish(nodeId, 'volume', levels?.volume ?? null)
        publish(nodeId, 'low', levels?.low ?? null)
        publish(nodeId, 'mid', levels?.mid ?? null)
        publish(nodeId, 'high', levels?.high ?? null)
    }, [publish])
    const onMic = useCallback((nodeId, volume, frequency) => {
        publish(nodeId, 'volume', volume)
        publish(nodeId, 'frequency', frequency)
    }, [publish])
    const onMidi = useCallback((nodeId, ports) => {
        // null clears every port at once (the node went). Otherwise only the
        // ports this message carries are written, so a CC does not wipe the
        // last note and vice versa.
        for (const portId of ['note', 'velocity', 'cc', 'value', 'trigger']) {
            if (ports === null) publish(nodeId, portId, null)
            else if (ports[portId] !== undefined) publish(nodeId, portId, ports[portId])
        }
    }, [publish])
    const onReply = useCallback((nodeId, reply, busy) => {
        publish(nodeId, 'reply', reply)
        publish(nodeId, 'busy', busy)
    }, [publish])

    const inputsOf = (node) => (graphContext ? evaluateNodeInputs(node, graphContext) : (node.values || {}))
    const playable = (typeId) => byType(nodes, typeId).filter((node) => node.values?.src && assets.has(node.values.src))

    return (
        <>
            {/* The picture operators run while any exist — see TopNetworkFeed. */}
            {allow.pictures && nodes.some((node) => isPictureType(node.typeId)) ? (
                <TopNetworkFeed
                    document={document}
                    spaceId={spaceId}
                    projectId={projectId}
                    liveOutputs={liveOutputs}
                    cameras={allow.cameras}
                    onLiveOutputChange={publish}
                />
            ) : null}

            {allow.video && playable('media.video').map((node) => (
                <VideoFrameFeed key={node.id} node={node} values={inputsOf(node)} asset={assets.get(node.values.src)} onFrameChange={onFrame} />
            ))}
            {allow.sound && playable('media.audio').map((node) => (
                <SoundAnalysisFeed key={node.id} node={node} asset={assets.get(node.values.src)} onLevelsChange={onSound} />
            ))}
            {allow.keyboard && byType(nodes, 'device.keyboard').map((node) => (
                <KeyboardFeed
                    key={node.id}
                    node={node}
                    keyValue={graphContext ? evaluateNodeInput(node, 'key', graphContext) : undefined}
                    onKeyState={onKey}
                />
            ))}
            {allow.midiOut && byType(nodes, 'device.midi.out').map((node) => (
                <MidiOutFeed key={node.id} node={node} inputs={inputsOf(node)} onStatus={onStatus} />
            ))}
            {allow.webcam && byType(nodes, 'source.webcam').map((node) => (
                <WebcamFeed key={node.id} node={node} onFrameChange={onFrame} />
            ))}
            {allow.mic && byType(nodes, 'source.mic').map((node) => (
                <MicFeed key={node.id} node={node} onLevelsChange={onMic} />
            ))}
            {allow.midiIn && byType(nodes, 'device.midi.in').map((node) => (
                <MidiInputFeed key={node.id} node={node} values={inputsOf(node)} onSignalChange={onMidi} />
            ))}
            {allow.dmx && byType(nodes, 'device.dmx.out').map((node) => (
                <DmxOutFeed key={node.id} node={node} values={inputsOf(node)} onStatus={onStatus} />
            ))}
            {allow.keeper && byType(nodes, 'agent.keeper').map((node) => (
                <KeeperFeed key={node.id} node={node} values={inputsOf(node)} onReplyChange={onReply} />
            ))}
        </>
    )
}

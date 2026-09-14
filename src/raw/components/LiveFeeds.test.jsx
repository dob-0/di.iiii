import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Each feed is replaced by a recorder: what is tested is WHICH feeds a surface
// runs, for which nodes, and with what — never a real device.
const { mounted, recorder } = vi.hoisted(() => {
    const list = []
    return { mounted: list, recorder: (name) => (props) => { list.push({ name, props }); return null } }
})
vi.mock('./TopNetworkFeed.jsx', () => ({ default: recorder('pictures') }))
vi.mock('./VideoFrameFeed.jsx', () => ({ default: recorder('video') }))
vi.mock('./SoundAnalysisFeed.jsx', () => ({ default: recorder('sound') }))
vi.mock('./KeyboardFeed.jsx', () => ({ default: recorder('keyboard') }))
vi.mock('./MidiOutFeed.jsx', () => ({ default: recorder('midiOut') }))
vi.mock('./WebcamSourcePanel.jsx', () => ({ WebcamFeed: recorder('webcam') }))
vi.mock('./MicSourcePanel.jsx', () => ({ MicFeed: recorder('mic') }))
vi.mock('./MidiInputPanel.jsx', () => ({ MidiInputFeed: recorder('midiIn') }))
vi.mock('./DmxOutPanelWindow.jsx', () => ({ DmxOutFeed: recorder('dmx') }))
vi.mock('./KeeperPanelWindow.jsx', () => ({ KeeperFeed: recorder('keeper') }))

import LiveFeeds, { EDITOR_FEEDS, OUTPUT_FEEDS, PUBLIC_FEEDS } from './LiveFeeds.jsx'
import { createEdge, createNode } from '../../project/nodeRegistry.js'
import { createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'

const document = {
    nodes: [
        createNode('source.webcam', { id: 'cam' }),
        createNode('source.mic', { id: 'mic' }),
        createNode('device.midi.in', { id: 'midiIn' }),
        createNode('device.midi.out', { id: 'midiOut' }),
        createNode('device.dmx.out', { id: 'dmx' }),
        createNode('agent.keeper', { id: 'keeper' }),
        createNode('device.keyboard', { id: 'keys', values: { key: 'Space' } }),
        createNode('value.string', { id: 'letter', values: { value: 'g' } }),
        createNode('top.blur', { id: 'blur' }),
        createNode('media.video', { id: 'clip', values: { src: 'a1' } })
    ],
    edges: [createEdge('letter', 'out', 'keys', 'key')],
    assets: [{ id: 'a1', mimeType: 'video/mp4', url: '/clip.mp4' }]
}

const names = () => new Set(mounted.map((entry) => entry.name))

afterEach(() => { mounted.length = 0 })

describe('LiveFeeds', () => {
    it('the editor runs a feed for every live node, whatever its window is doing', () => {
        render(<LiveFeeds document={document} graphContext={createNodeGraphContext(document)} onLiveOutputChange={() => {}} allow={EDITOR_FEEDS} />)
        expect([...names()].sort()).toEqual(['dmx', 'keeper', 'keyboard', 'mic', 'midiIn', 'midiOut', 'pictures', 'video', 'webcam'])
        // A String wired into the Keyboard's Key is what the feed listens for.
        expect(mounted.find((entry) => entry.name === 'keyboard').props.keyValue).toBe('g')
    })

    it('/out listens but never sends — the editor already drives the rig', () => {
        render(<LiveFeeds document={document} graphContext={createNodeGraphContext(document)} onLiveOutputChange={() => {}} allow={OUTPUT_FEEDS} />)
        expect(names().has('webcam')).toBe(true)
        expect(names().has('midiIn')).toBe(true)
        expect(names().has('dmx')).toBe(false)
        expect(names().has('midiOut')).toBe(false)
        expect(names().has('keeper')).toBe(false)
    })

    it('a public visitor is never asked for a camera, microphone or MIDI', () => {
        render(<LiveFeeds document={document} graphContext={createNodeGraphContext(document)} onLiveOutputChange={() => {}} allow={PUBLIC_FEEDS} />)
        for (const device of ['webcam', 'mic', 'midiIn', 'midiOut', 'dmx', 'keeper']) expect(names().has(device)).toBe(false)
        expect(names().has('video')).toBe(true)
        expect(mounted.find((entry) => entry.name === 'pictures').props.cameras).toBe(false)
    })
})

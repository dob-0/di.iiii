import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { viewportProps, feedProps } = vi.hoisted(() => ({ viewportProps: [], feedProps: [] }))
vi.mock('./components/RawViewport.jsx', () => ({
    default: (props) => { viewportProps.push(props); return null }
}))
vi.mock('./components/LiveFeeds.jsx', async (importOriginal) => ({
    ...(await importOriginal()),
    default: (props) => { feedProps.push(props); return null }
}))

import PublicGraphSurface from './PublicGraphSurface.jsx'
import { PUBLIC_FEEDS } from './components/LiveFeeds.jsx'

const document = { nodes: [{ id: 'clip', typeId: 'media.video', values: {} }], edges: [], workspaceState: {} }

afterEach(() => {
    viewportProps.length = 0
    feedProps.length = 0
})

// Raw fix wave 2026-09-14 (graph #6): the published room got liveOutputs={null}.
describe('PublicGraphSurface', () => {
    it('runs only the feeds that ask a visitor nothing, and hands the room their outputs', () => {
        render(<PublicGraphSurface document={document} />)
        expect(feedProps.at(-1).allow).toBe(PUBLIC_FEEDS)
        expect(PUBLIC_FEEDS.webcam || PUBLIC_FEEDS.mic || PUBLIC_FEEDS.midiIn || PUBLIC_FEEDS.cameras).toBe(false)
        expect(viewportProps.at(-1).liveOutputs).toBeInstanceOf(Map)
    })

    it('a card thumbnail (live false) runs no feeds at all', () => {
        render(<PublicGraphSurface document={document} live={false} />)
        expect(feedProps).toHaveLength(0)
        expect(viewportProps.at(-1).liveOutputs).toBeNull()
    })
})

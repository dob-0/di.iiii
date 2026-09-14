import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

let hookOptions = null
vi.mock('../../project/tops/useTopNetwork.js', async (importOriginal) => ({
    ...(await importOriginal()),
    useTopNetwork: (options) => { hookOptions = options; return {} }
}))

import TopNetworkFeed from './TopNetworkFeed.jsx'

describe('TopNetworkFeed — pictures to and from the rest of the graph', () => {
    it('publishes an exported operator as a texture, re-uploads it when redrawn, clears it when unwired', () => {
        const onLiveOutputChange = vi.fn()
        render(<TopNetworkFeed document={{ nodes: [], edges: [] }} onLiveOutputChange={onLiveOutputChange} />)

        const canvas = document.createElement('canvas')
        hookOptions.onPicture('blur', canvas)
        const [nodeId, portId, texture] = onLiveOutputChange.mock.lastCall
        expect([nodeId, portId]).toEqual(['blur', 'out'])
        expect(texture.isTexture).toBe(true)
        expect(texture.image).toBe(canvas)

        const version = texture.version
        hookOptions.onPicturesDrawn(['blur'])
        expect(texture.version).toBeGreaterThan(version)

        hookOptions.onPicture('blur', null)
        expect(onLiveOutputChange).toHaveBeenLastCalledWith('blur', 'out', null)
    })

    it('hands an operator the element behind a Webcam frame, and asks no camera on a public page', () => {
        const video = { tagName: 'VIDEO' }
        const liveOutputs = new Map([['cam:frame', { isTexture: true, image: video }]])
        render(<TopNetworkFeed document={{ nodes: [], edges: [] }} liveOutputs={liveOutputs} cameras={false} onLiveOutputChange={() => {}} />)
        expect(hookOptions.feedMedia('cam', 'frame')).toBe(video)
        expect(hookOptions.feedMedia('nothing', 'frame')).toBeNull()
        expect(hookOptions.cameras).toBe(false)
    })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapSourceView from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

const surfaceOf = (source, patch = {}) => normalizeMappingSurface({
    id: 's1', name: 'ԳՈՌ', resolution: [640, 360], source, ...patch
})

beforeEach(() => {
    vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: { getUserMedia: vi.fn(() => Promise.reject(new Error('no device'))) }
    })
})

describe('what a surface draws', () => {
    it('draws a test pattern for a test source', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'test', ref: 'rings' })} label="ԳՈՌ" />)
        expect(container.querySelector('.map-source-svg')).toBeTruthy()
        expect(screen.getByText('ԳՈՌ')).toBeTruthy()
    })

    it('draws a flat fill for a colour source', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'colour', ref: '#ff0000' })} />)
        expect(container.querySelector('.map-source-fill')).toBeTruthy()
    })

    it('takes a camera surface with no device as THE DEFAULT CAMERA, not an unfinished one', () => {
        // This is the regression: an earlier `!ref` fallback caught every kind
        // and quietly rendered a test pattern instead, making the camera
        // branch unreachable. An empty ref for a camera means "whichever
        // camera this machine has".
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'camera', ref: '' })} label="ԳՈՌ" />)
        expect(container.querySelector('.map-source-svg')).toBeNull()
    })

    it('says why rather than going black when a camera cannot be opened', async () => {
        // A black rectangle on a wall is indistinguishable from a mapping
        // mistake, so a refused camera has to speak. It shows a <video> first
        // and only learns there is no device when getUserMedia rejects, so
        // this waits rather than asserting on the first frame.
        render(<MapSourceView surface={surfaceOf({ kind: 'camera', ref: '' })} label="ԳՈՌ" />)
        expect(await screen.findByText('camera unavailable')).toBeTruthy()
        expect(screen.getByText('ԳՈՌ')).toBeTruthy()
    })

    it('falls back to a pattern only for the kinds that are meaningless without an address', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'url', ref: '' })} />)
        expect(container.querySelector('.map-source-svg')).toBeTruthy()
    })

    it('holds a page surface as a card until it is asked to run', () => {
        render(<MapSourceView surface={surfaceOf({ kind: 'url', ref: 'https://example.test' })} live={false} label="ԳՈՌ" />)
        expect(screen.getByText('https://example.test')).toBeTruthy()
    })
})

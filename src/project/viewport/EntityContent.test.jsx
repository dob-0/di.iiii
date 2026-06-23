import { Fragment } from 'react'
import { describe, expect, it } from 'vitest'
import EntityContent from './EntityContent.jsx'
import BoxObject from '../../objectComponents/BoxObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import Text2DObject from '../../objectComponents/Text2DObject.jsx'
import Text3DObject from '../../objectComponents/Text3DObject.jsx'
import ImageObject from '../../objectComponents/ImageObject.jsx'

// EntityContent is a pure mapping (no hooks), so we can call it directly and
// inspect the React element it returns instead of rendering a WebGL canvas.
const render = (entity, assetMap = new Map()) => EntityContent({ entity, assetMap })

describe('EntityContent mapping', () => {
    it('maps box with appearance + primitive props', () => {
        const el = render({
            type: 'box',
            components: { appearance: { color: '#abc', wireframe: true, opacity: 0.5 }, primitive: { size: [2, 2, 2] } }
        })
        expect(el.type).toBe(BoxObject)
        expect(el.props.color).toBe('#abc')
        expect(el.props.boxSize).toEqual([2, 2, 2])
        expect(el.props.wireframe).toBe(true)
        expect(el.props.opacity).toBe(0.5)
    })

    it('maps sphere', () => {
        const el = render({ type: 'sphere', components: { primitive: { radius: 1.5 } } })
        expect(el.type).toBe(SphereObject)
        expect(el.props.sphereRadius).toBe(1.5)
    })

    it('picks Text3D vs Text2D by variant', () => {
        const threeD = render({ type: 'text', components: { text: { variant: '3d', value: 'hi' } } })
        expect(threeD.type).toBe(Text3DObject)
        const twoD = render({ type: 'text', components: { text: { variant: '2d', value: 'hi' } } })
        expect(twoD.type).toBe(Text2DObject)
    })

    it('resolves media assets through the asset map', () => {
        const assetMap = new Map([['a1', { id: 'a1', url: 'https://cdn/x.png' }]])
        const el = render({ type: 'image', components: { media: { assetId: 'a1' } } }, assetMap)
        expect(el.type).toBe(ImageObject)
        expect(el.props.data).toBe('https://cdn/x.png')
    })

    it('renders light entities as a fragment with a light host element', () => {
        const el = render({ type: 'pointLight', components: { light: { color: '#fff', intensity: 2 } } })
        expect(el.type).toBe(Fragment)
        const children = el.props.children
        expect(children[0].type).toBe('pointLight')
        expect(children[0].props.intensity).toBe(2)
    })

    it('falls back to a unit box for unknown types', () => {
        const el = render({ type: 'totally-unknown', components: {} })
        expect(el.type).toBe(BoxObject)
        expect(el.props.boxSize).toEqual([1, 1, 1])
    })
})

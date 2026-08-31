import { Fragment } from 'react'
import { describe, expect, it } from 'vitest'
import EntityContent from './EntityContent.jsx'
import BoxObject from '../../objectComponents/BoxObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import Text2DObject from '../../objectComponents/Text2DObject.jsx'
import Text3DObject from '../../objectComponents/Text3DObject.jsx'
import ImageObject from '../../objectComponents/ImageObject.jsx'
import PortalObject from './PortalObject.jsx'

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

    // Text was the one entity type never handed appearance.opacity, so fading it
    // -- by hand or from a timeline, which can animate `opacity` -- did nothing.
    it('passes opacity to 2D text like every other entity type', () => {
        const el = render({
            type: 'text',
            components: { appearance: { opacity: 0.25 }, text: { variant: '2d', value: 'hi' } }
        })
        expect(el.type).toBe(Text2DObject)
        expect(el.props.opacity).toBe(0.25)
    })

    // Spatial sound has to be opted into per video: switching it on for every
    // video would change how every existing space sounds.
    it('leaves video sound flat unless the media asks for spatial', () => {
        const el = render(
            { type: 'video', components: { media: { assetId: 'a' } } },
            new Map([['a', { id: 'a', url: '/x.mp4' }]])
        )
        expect(el.props.spatial).toBe(false)
    })

    it('passes spatial sound settings through when the media asks for them', () => {
        const el = render(
            { type: 'video', components: { media: { assetId: 'a', spatial: true, distance: 3, maxDistance: 25 } } },
            new Map([['a', { id: 'a', url: '/x.mp4' }]])
        )
        expect(el.props.spatial).toBe(true)
        expect(el.props.distance).toBe(3)
        expect(el.props.maxDistance).toBe(25)
    })

    it('passes the text reveal config through so a typewriter can run', () => {
        const reveal = { mode: 'typewriter', speed: 40 }
        const el = render({ type: 'text', components: { text: { variant: '2d', value: 'hi', reveal } } })
        expect(el.props.reveal).toEqual(reveal)
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

    it('maps a portal entity to PortalObject, passing the entity through', () => {
        const entity = { type: 'portal', components: { reference: { spaceId: 'wcc', projectId: 'arthur', mode: 'embed' } } }
        const el = render(entity)
        expect(el.type).toBe(PortalObject)
        expect(el.props.entity).toBe(entity)
    })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { context as fiberContext } from '@react-three/fiber'
import { describe, expect, it } from 'vitest'
import SpotLightObject from './SpotLightObject.jsx'
import { spotLightCone } from './spotBeam.js'

// MOXIR render audit A (2026-10-01): a RIG lamp's real light is fitted to its beam angle
// (spotBeam.js spotLightCone); an authored spot keeps the angle it was given, as its cutoff.
const draw = (props) => renderToStaticMarkup(createElement(fiberContext.Provider, { value: { getState: () => ({ gl: {} }) } }, createElement(SpotLightObject, props)))
const lightAngle = (html) => Number((html.match(/<spotlight[^>]*\bangle="([^"]+)"/i) || [])[1])
const lightPenumbra = (html) => Number((html.match(/<spotlight[^>]*\bpenumbra="([^"]+)"/i) || [])[1])
const par = { color: '#ffffff', intensity: 609, distance: 12, angle: 0.1309, penumbra: 0.5, beam: { visible: true, haze: 0.3 } }

describe('a rig lamp\'s real light, fitted; an authored spot, untouched', () => {
    it('fits the cone of a lamp that is a rig fixture', () => {
        const html = draw({ ...par, fitted: true })
        const want = spotLightCone({ angle: 0.1309, penumbra: 0.5 })
        expect(lightAngle(html)).toBeCloseTo(want.angle, 6)
        expect(lightPenumbra(html)).toBeCloseTo(want.penumbra, 6)
    })
    it('keeps an authored spot\'s angle as its cutoff', () => {
        const html = draw(par)
        expect(lightAngle(html)).toBeCloseTo(0.1309, 6)
        expect(lightPenumbra(html)).toBeCloseTo(0.5, 6)
    })
})

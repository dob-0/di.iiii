import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { context as fiberContext } from '@react-three/fiber'
import { describe, expect, it } from 'vitest'
import SpotLightObject from './SpotLightObject.jsx'
import { getAtmosphere, setAtmosphere } from './atmosphereStore.js'

// RIG_BUILD.md §20: a room with an atmosphere draws its beams physically; a room
// without one keeps the old flat cone, byte for byte. Rendered to markup (three's
// elements come out as tags) inside a stand-in for the Canvas's store.
const lamp = { color: '#ff1408', intensity: 1004000, distance: 7, angle: 0.0157, penumbra: 0.1, beam: { visible: true, haze: 1, only: true, aperture: 0.08 } }
const inCanvas = (gl, props) => renderToStaticMarkup(createElement(
    fiberContext.Provider,
    { value: { getState: () => ({ gl }) } },
    createElement(SpotLightObject, props)
))

describe('the beam in haze — physical with an atmosphere, the old cone without', () => {
    it('no atmosphere: the old additive basic-material cone', () => {
        const gl = {}
        const html = inCanvas(gl, lamp)
        expect(html).toMatch(/<meshbasicmaterial/i)
    })
    it('with an atmosphere: one mesh with the scattering material, no basic cone', () => {
        const gl = {}
        setAtmosphere(gl, { scattering: 0.02, anisotropy: 0.7 })
        const html = inCanvas(gl, lamp)
        expect(html).toMatch(/<mesh/)
        expect(html).not.toMatch(/<meshbasicmaterial/i)
    })
    it('a lamp at haze 0 (a strobe\'s flash) draws no beam either way', () => {
        const gl = {}
        setAtmosphere(gl, { scattering: 0.02, anisotropy: 0.7 })
        expect(inCanvas(gl, { ...lamp, beam: { visible: true, haze: 0, only: true } })).not.toMatch(/<mesh/)
    })
    it('the air is per renderer: two canvases never share it', () => {
        const a = {}
        const b = {}
        setAtmosphere(a, { scattering: 0.05, anisotropy: 0.7 })
        expect(getAtmosphere(a)).toEqual({ scattering: 0.05, anisotropy: 0.7 })
        expect(getAtmosphere(b)).toBeNull()
        setAtmosphere(a, null)
        expect(getAtmosphere(a)).toBeNull()
    })
})

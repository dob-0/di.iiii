import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cameraDistanceForHeight, liftPageIntoSpace } from './pageInSpace.js'

// A 1440x900 laptop. The numbers below are the whole contract: an element
// measured at a screen rect has to land back on exactly that rect, whatever
// depth it was given.
const WIDTH = 1440
const HEIGHT = 900

const makeElement = (rect) => {
    const el = window.document.createElement('div')
    el.className = 'probe'
    el.textContent = 'probe'
    el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height })
    window.document.body.appendChild(el)
    return el
}

describe('cameraDistanceForHeight', () => {
    // The one equation the whole effect rests on. At this distance a scene
    // measured in CSS pixels projects 1:1, so the flight's first frame is the
    // page's last frame and nobody can see the handover.
    it('puts one world unit on one CSS pixel', () => {
        const distance = cameraDistanceForHeight(HEIGHT, 50)
        const halfHeightAtDistance = distance * Math.tan((50 / 2) * (Math.PI / 180))
        expect(halfHeightAtDistance).toBeCloseTo(HEIGHT / 2, 6)
    })
})

describe('liftPageIntoSpace', () => {
    let container

    beforeEach(() => {
        window.innerWidth = WIDTH
        window.innerHeight = HEIGHT
        container = window.document.createElement('div')
        window.document.body.appendChild(container)
    })

    afterEach(() => {
        window.document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('places an element where it already was, in the scene\'s own coordinates', () => {
        const el = makeElement({ left: 620, top: 400, width: 200, height: 60 })
        const stage = liftPageIntoSpace({ container, layers: [{ el, depth: 0 }] })
        const { object } = stage.placed[0]

        expect(object.position.x).toBeCloseTo(620 + 100 - WIDTH / 2, 6)
        expect(object.position.y).toBeCloseTo(-(400 + 30 - HEIGHT / 2), 6)
        expect(object.position.z).toBe(0)
        expect(object.scale.x).toBeCloseTo(1, 6)
        stage.destroy()
    })

    // Depth is only allowed to be free. An element pushed toward the eye is
    // scaled by exactly the perspective it just gained, so the resting frame
    // is unchanged and the depth shows only once the camera moves.
    it('cancels the perspective of any depth it hands out', () => {
        const el = makeElement({ left: 300, top: 200, width: 400, height: 100 })
        const depth = 190
        const stage = liftPageIntoSpace({ container, layers: [{ el, depth }] })
        const { object } = stage.placed[0]
        const distance = cameraDistanceForHeight(HEIGHT, 50)

        expect(object.position.z).toBe(depth)
        expect(object.scale.x).toBeCloseTo((distance - depth) / distance, 6)
        // Apparent size = real size x scale x (D / (D - z)) — which is 1.
        const apparent = object.scale.x * (distance / (distance - object.position.z))
        expect(apparent).toBeCloseTo(1, 6)
        stage.destroy()
    })

    it('clones the element rather than moving it, and leaves the original in the page', () => {
        const el = makeElement({ left: 0, top: 0, width: 100, height: 40 })
        const parent = el.parentNode
        const stage = liftPageIntoSpace({ container, layers: [{ el, depth: 0 }] })

        expect(el.parentNode).toBe(parent)
        const clone = container.querySelector('.lp-in-space .probe')
        expect(clone).not.toBeNull()
        expect(clone).not.toBe(el)
        expect(clone.textContent).toBe('probe')
        stage.destroy()
    })

    it('starts at full opacity and only moves once progress does', () => {
        const el = makeElement({ left: 100, top: 100, width: 100, height: 100 })
        const stage = liftPageIntoSpace({ container, layers: [{ el, depth: 120 }] })
        const { object, holder } = stage.placed[0]
        const restZ = object.position.z
        const restX = object.position.x

        stage.setProgress(0)
        expect(object.position.z).toBeCloseTo(restZ, 6)
        expect(object.position.x).toBeCloseTo(restX, 6)
        expect(holder.style.opacity).toBe('1')

        stage.setProgress(1)
        expect(object.position.z).toBeGreaterThan(restZ)
        expect(Number(holder.style.opacity)).toBeLessThan(0.01)
        stage.destroy()
    })

    it('takes everything it added back out again', () => {
        const el = makeElement({ left: 10, top: 10, width: 10, height: 10 })
        const stage = liftPageIntoSpace({ container, layers: [{ el, depth: 0 }] })
        expect(container.children.length).toBeGreaterThan(0)

        stage.destroy()
        expect(container.querySelector('.lp-in-space')).toBeNull()
        expect(container.children.length).toBe(0)
        // Idempotent: a cancelled flight and a finished one both call it.
        expect(() => stage.destroy()).not.toThrow()
    })
})

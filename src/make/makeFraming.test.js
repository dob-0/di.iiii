import { describe, expect, it } from 'vitest'
import { contentBounds, fitToContent, fovForAspect, placedItems } from './makeFraming.js'

const DEG = Math.PI / 180
// The room box on a 390x844 phone, once the four words have taken their bar.
const PHONE = 390 / 674
const LAPTOP = 1280 / 700

// Gor's actual room, as the camp scaffold leaves it: a name at the back, a
// picture standing under it, a cube in the middle and two blocks in front.
const room = () => ({
    projectMeta: { id: 'team-3', spaceId: 'dilijan', title: 'ԳՈՌ · Gor' },
    nodes: [
        { id: 'n-cube', type: 'geo.box', values: { size: [0.8, 0.8, 0.8], position: [0, 0.4, 0.35] } },
        { id: 'n-pic', type: 'geo.plane', values: { width: 2.2, height: 1.4, position: [0, 1, -2] } }
    ],
    entities: [
        {
            id: 'e-title',
            type: 'text',
            components: { transform: { position: [0, 2.25, -2.6], scale: [0.3, 0.3, 0.3] }, text: { value: 'ԳՈՌ' } }
        },
        {
            id: 'e-block-l',
            type: 'box',
            components: { transform: { position: [-1.15, 0.35, 1.7], scale: [0.7, 0.7, 0.7] } }
        },
        {
            id: 'e-block-r',
            type: 'box',
            components: { transform: { position: [1.15, 0.35, 1.7], scale: [0.7, 0.7, 0.7] } }
        }
    ],
    worldState: { savedView: { position: [0, 2.4, 6.5], target: [0, 0.75, 0] } }
})

// Where every corner of everything in the room lands on the screen, in
// normalised device coordinates: -1 is the bottom edge of the frame, +1 the top,
// and the same for left and right.
const onScreen = (document, aspect) => {
    const fit = fitToContent(document, aspect)
    const tanV = Math.tan((fovForAspect(aspect) / 2) * DEG)
    const tanH = tanV * aspect
    const cosE = Math.cos(fit.elevation)
    const forward = [-Math.sin(fit.bearing) * cosE, -Math.sin(fit.elevation), -Math.cos(fit.bearing) * cosE]
    const right = [Math.cos(fit.bearing), 0, -Math.sin(fit.bearing)]
    const up = [
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0]
    ]
    const dot = (v, a) => v[0] * a[0] + v[1] * a[1] + v[2] * a[2]
    const box = { left: 1, right: -1, bottom: 1, top: -1 }
    for (const item of placedItems(document)) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const point = [
                item.position[0] + sx * item.half[0] - fit.position[0],
                item.position[1] + sy * item.half[1] - fit.position[1],
                item.position[2] + sz * item.half[2] - fit.position[2]
            ]
            const depth = dot(point, forward)
            if (depth <= 0.01) continue
            const x = dot(point, right) / (depth * tanH)
            const y = dot(point, up) / (depth * tanV)
            box.left = Math.min(box.left, x)
            box.right = Math.max(box.right, x)
            box.bottom = Math.min(box.bottom, y)
            box.top = Math.max(box.top, y)
        }
    }
    return box
}

describe('makeFraming — what a phone actually sees', () => {
    it('keeps every object inside the frame on a portrait phone', () => {
        const box = onScreen(room(), PHONE)
        expect(box.left).toBeGreaterThan(-1)
        expect(box.right).toBeLessThan(1)
        expect(box.bottom).toBeGreaterThan(-1)
        expect(box.top).toBeLessThan(1)
    })

    it('stands the room on the lower part of the screen, not in the middle', () => {
        const box = onScreen(room(), PHONE)
        const middle = (box.top + box.bottom) / 2
        // The numbers are tight on purpose, because the thing they guard is a
        // difference of about six per cent of the screen. With the seat at zero
        // this same room measures middle -0.163, bottom -0.778, top 0.452 — a
        // third of blank near-floor under a child's objects, which is the
        // picture this replaces. All three thresholds fail at that.
        expect(middle).toBeLessThan(-0.2)
        expect(box.bottom).toBeLessThan(-0.82)
        // But standing ON the bottom edge is the other failure: at a bias of
        // 0.5 the nearest block touched the four words.
        expect(box.bottom).toBeGreaterThan(-0.98)
    })

    it('leaves the room room to breathe above, so the horizon is in shot', () => {
        const box = onScreen(room(), PHONE)
        expect(box.top).toBeLessThan(0.42)
    })

    it('fills the width — the axis that binds on a portrait phone', () => {
        const box = onScreen(room(), PHONE)
        expect(box.right - box.left).toBeGreaterThan(1.6)
    })

    it('does not fall off a laptop either', () => {
        const box = onScreen(room(), LAPTOP)
        expect(box.left).toBeGreaterThan(-1)
        expect(box.right).toBeLessThan(1)
        expect(box.bottom).toBeGreaterThan(-1)
        expect(box.top).toBeLessThan(1)
    })

    it('frames an empty room without dividing by nothing', () => {
        const empty = { ...room(), nodes: [], entities: [] }
        const fit = fitToContent(empty, PHONE)
        expect(contentBounds(empty).isEmpty).toBe(true)
        expect(Number.isFinite(fit.distance)).toBe(true)
        expect(fit.position.every(Number.isFinite)).toBe(true)
        expect(fit.target.every(Number.isFinite)).toBe(true)
    })
})

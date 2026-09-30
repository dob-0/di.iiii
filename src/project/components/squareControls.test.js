// "Controls are rectangles" (docs/ai/golden_rules.md): the visitor's viewer chrome
// (Walk / Fly, Sound, the SHOW chip, the live-scene buttons, the sign-in notice) has a
// corner radius of 0-2 px. A pill (999px, --di-radius-pill) or a circle (50%) on a
// control is the regression. Non-control marks (the SHOW chip's red dot, the loading
// ring, the joystick pad) are named exceptions below.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overlayButtonStyle } from './publicViewerStyles.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// A round corner on a control: the pill token, 999px or 50% as a border-radius (not `left: 50%`).
const round = /border-radius:\s*(var\(--di-radius-pill|999px|50%)/

const px = (value) => Number.parseFloat(String(value))

describe('the visitor viewer draws rectangles', () => {
    it('gives the overlay buttons (Walk / Fly, Sound) a 0-2 px corner', () => {
        expect(px(overlayButtonStyle.borderRadius)).toBeLessThanOrEqual(2)
    })

    it('gives the SHOW chip a 0-2 px corner; only its red dot is round', () => {
        const source = read('../../rigbuild/RoomLookFollower.jsx')
        const radii = [...source.matchAll(/borderRadius:\s*'([^']+)'/g)].map((m) => m[1])
        const round = radii.filter((r) => px(r) > 2)
        expect(round).toEqual(['50%'])
        expect(source).toMatch(/width: 8, height: 8, borderRadius: '50%'/)
    })

    it('keeps the live scene\'s buttons and the sign-in notice off the pill token', () => {
        const scene = read('../../components/liveProjectScene.css')
        const buttons = ['.live-scene-exit', '.live-scene-sound', '.live-scene-fly-btn', '.live-scene-vert-btn']
        for (const selector of buttons) {
            const rule = scene.split('}').find((block) => block.includes(`${selector} {`) || block.includes(`${selector}{`))
            expect(rule, selector).toBeTruthy()
            expect(rule, selector).not.toMatch(round)
        }
        expect(read('../../components/authReturnNotice.css')).not.toMatch(round)
    })
})

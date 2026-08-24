import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Two things are guarded here, and they are two different kinds of thing.
//
// The first is that CLICKING a portal still works. Walking through one is an
// addition, not a replacement — orbit mode has no walker, and a mouse is still
// the fastest way in from a desk. That is a real render + a real click.
//
// The second is where the new proximity check is wired, which is a question
// about the shape of LiveProjectScene.jsx rather than about behaviour: the
// component is a full R3F tree that costs a WebGL context jsdom will not give
// it, so this file reads it the way livePlayerRef.test.js and
// liveProjectSceneSeams.test.js next door read it, and for the same reason.

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(HERE, rel), 'utf8')
const SCENE = read('LiveProjectScene.jsx')
const PORTAL = read('../project/viewport/PortalObject.jsx')

const navigate = vi.fn()
vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: (...args) => navigate(...args),
    setAppNavigate: () => {}
}))
// The label furniture only: troika text and a billboard both want a canvas.
vi.mock('@react-three/drei', () => ({
    Billboard: ({ children }) => <group>{children}</group>,
    Text: ({ children }) => <span>{children}</span>
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => {} }))

const PortalObject = (await import('../project/viewport/PortalObject.jsx')).default

const gateway = (reference) => ({
    id: 'door',
    name: 'door',
    type: 'portal',
    components: {
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        reference: { mode: 'portal', label: 'Room 3', ...reference }
    }
})

describe('clicking a portal still enters it', () => {
    let warn

    beforeEach(() => {
        navigate.mockReset()
        window.history.replaceState(null, '', '/dilijan')
        // <mesh>/<torusGeometry> are three.js host elements, unknown to the DOM
        // renderer. They render, they carry the handler, and they complain.
        warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        warn.mockRestore()
        window.history.replaceState(null, '', '/')
    })

    it('routes to the project the reference names', () => {
        const { container } = render(<PortalObject entity={gateway({ spaceId: 'dilijan', projectId: 'room-3' })} />)
        container.querySelector('mesh').click()
        expect(navigate).toHaveBeenCalledWith('/dilijan/room-3')
    })

    it('routes to the space when no project is named', () => {
        const { container } = render(<PortalObject entity={gateway({ spaceId: 'dilijan', projectId: '' })} />)
        container.querySelector('mesh').click()
        expect(navigate).toHaveBeenCalledWith('/dilijan')
    })

    it('does nothing when the portal names nowhere', () => {
        const { container } = render(<PortalObject entity={gateway({ spaceId: '', projectId: '' })} />)
        container.querySelector('mesh').click()
        expect(navigate).not.toHaveBeenCalled()
    })

    // The editor's own selection handling owns the click there, so a portal
    // stays selectable and movable instead of teleporting its author away.
    it('is inert inside the Studio editor', () => {
        window.history.replaceState(null, '', '/studio/dilijan')
        const { container } = render(<PortalObject entity={gateway({ spaceId: 'dilijan', projectId: 'room-3' })} />)
        container.querySelector('mesh').click()
        expect(navigate).not.toHaveBeenCalled()
    })
})

describe('where walking through is wired', () => {
    it('only the Walker gets it, and the Walker only exists when interactive', () => {
        // The one call site. Anything else — the idle orbit, a non-interactive
        // background, a ?preview=1 thumbnail — reaches no walker at all, so
        // there is nothing to gate a second time.
        const callSites = SCENE.match(/onPortalReached=/g) || []
        expect(callSites).toHaveLength(1)
        const walkerBlock = SCENE.slice(SCENE.indexOf('{interactive ? ('), SCENE.indexOf('<IdleOrbit'))
        expect(walkerBlock).toContain('<Walker')
        expect(walkerBlock).toContain('onPortalReached={handlePortalReached}')
    })

    it('goes where the click goes, through the router and not a page load', () => {
        // window.location.assign here forced a full app reload per jump; the
        // click path was moved off it deliberately and this must not drift back.
        expect(SCENE).toMatch(/const href = portalHref\(reference\.spaceId, reference\.projectId\)/)
        expect(SCENE).toMatch(/if \(href\) appNavigate\(href\)/)
        expect(SCENE.slice(SCENE.indexOf('handlePortalReached'))).not.toMatch(/window\.location\.assign/)
    })

    it('leaves the atmosphere tint radius alone', () => {
        // 900 is squared: 30 metres, generous on purpose. Entering has its own,
        // much tighter number in portalWalkThrough.js.
        expect(SCENE).toMatch(/onNearestZone\(nearestDist < \(portals\.length \? 900 : 64\) \? label : null\)/)
    })

    it('reads the pose above the XR guard, so a headset walks through too', () => {
        const frame = SCENE.slice(SCENE.indexOf('useFrame((_, delta) => {'))
        const check = frame.indexOf('portalWalk.step')
        const xrGuard = frame.indexOf('if (isPresenting) return')
        expect(check).toBeGreaterThan(-1)
        expect(check).toBeLessThan(xrGuard)
    })

    it('keeps one latch for the life of the walker, not one per frame', () => {
        expect(SCENE).toMatch(/const \[portalWalk\] = useState\(createPortalWalkThrough\)/)
    })

    it('leaves the ring click handler exactly as it was', () => {
        expect(PORTAL).toMatch(/onClick=\{inEditor \? undefined : enter\}/)
    })
})

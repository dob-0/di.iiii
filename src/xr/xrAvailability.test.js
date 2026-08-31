import { describe, expect, it } from 'vitest'
import {
    XR_AR_ONLY,
    XR_INSECURE,
    XR_NO_DEVICE,
    XR_NO_WEBXR,
    XR_READY,
    formatXrAvailability,
    xrAvailability
} from './xrAvailability.js'

const SECURE = { secureContext: true, hasNavigatorXr: true, hasIsSessionSupported: true }
const INSECURE = { secureContext: false, hasNavigatorXr: false, hasIsSessionSupported: false }

describe('xrAvailability', () => {
    it('is ready when VR is supported', () => {
        expect(xrAvailability(SECURE, { vr: true, ar: false }).state).toBe(XR_READY)
        expect(xrAvailability(SECURE, { vr: true, ar: true }).state).toBe(XR_READY)
    })

    it('is NOT ready when only AR is supported', () => {
        // The regression this file is named for, in disguise. Judging on
        // "either mode" let an AR-capable phone report ready, which silenced
        // the chrome — while the Enter VR button stayed hidden because it keys
        // off `vr` alone. No button, no message, and a working Enter AR button
        // beside it. This is a VR installation; AR support is not readiness.
        const result = xrAvailability(SECURE, { vr: false, ar: true })
        expect(result.state).toBe(XR_AR_ONLY)
        expect(result.state).not.toBe(XR_READY)
    })

    it('tells an AR-only device it is the wrong device, not a broken one', () => {
        const result = xrAvailability(SECURE, { vr: false, ar: true })
        // Recheck cannot help here — no headset is going to appear on a phone —
        // so the fix has to point at a different device rather than a retry.
        expect(result.reason).toMatch(/AR but not VR/i)
        expect(result.fix).toMatch(/headset/i)
    })

    it('does not confuse AR-only with a missing headset', () => {
        // Different causes, different fixes: XR_NO_DEVICE is "plug something
        // in and press Recheck", XR_AR_ONLY is "this hardware cannot do VR".
        expect(xrAvailability(SECURE, { vr: false, ar: true }).state)
            .not.toBe(xrAvailability(SECURE, { vr: false, ar: false }).state)
    })

    it('blames the insecure context BEFORE the missing navigator.xr', () => {
        // This ordering is the whole point. A LAN-IP page over plain http has
        // no navigator.xr *because* it is insecure — reporting "no WebXR" sends
        // you off debugging the browser when the URL is the problem, and this
        // is the most common way the piece fails to offer VR.
        expect(xrAvailability(INSECURE, { vr: false, ar: false }).state).toBe(XR_INSECURE)
    })

    it('says so when the browser genuinely lacks WebXR', () => {
        const noXr = { secureContext: true, hasNavigatorXr: false, hasIsSessionSupported: false }
        expect(xrAvailability(noXr, { vr: false, ar: false }).state).toBe(XR_NO_WEBXR)
    })

    it('treats navigator.xr without isSessionSupported as no WebXR', () => {
        const partial = { secureContext: true, hasNavigatorXr: true, hasIsSessionSupported: false }
        expect(xrAvailability(partial, { vr: false, ar: false }).state).toBe(XR_NO_WEBXR)
    })

    it('reports a missing headset when everything else is fine', () => {
        const result = xrAvailability(SECURE, { vr: false, ar: false })
        expect(result.state).toBe(XR_NO_DEVICE)
        // Starting Link after the page loaded is the normal case, so the fix
        // has to say that a reload is not needed — otherwise the obvious move
        // is to reload, which loses the playhead.
        expect(result.fix).toContain('Recheck')
    })

    it('always offers a fix, never just a diagnosis', () => {
        const cases = [
            [INSECURE, { vr: false, ar: false }],
            [{ secureContext: true, hasNavigatorXr: false }, { vr: false, ar: false }],
            [SECURE, { vr: false, ar: false }],
            [SECURE, { vr: false, ar: true }]
        ]
        cases.forEach(([environment, modes]) => {
            const result = xrAvailability(environment, modes)
            expect(result.reason.length).toBeGreaterThan(0)
            expect(result.fix.length).toBeGreaterThan(0)
        })
    })

    it('survives being called with nothing', () => {
        // Called during the first render, before the async support check has
        // returned anything at all.
        expect(() => xrAvailability()).not.toThrow()
        expect(xrAvailability().state).not.toBe(XR_READY)
    })
})

describe('formatXrAvailability', () => {
    it('is empty when ready, so the chrome renders nothing', () => {
        expect(formatXrAvailability(xrAvailability(SECURE, { vr: true }))).toBe('')
    })

    it('joins the reason and the fix into one line', () => {
        const line = formatXrAvailability(xrAvailability(INSECURE, {}))
        expect(line).toContain('secure context')
        expect(line).toContain('localhost')
    })
})

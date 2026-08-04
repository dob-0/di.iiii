// Why there is no Enter VR button.
//
// The button is conditional on navigator.xr reporting immersive-vr support, so
// when anything upstream is wrong it simply does not render — and an absent
// button looks identical whether the cause is a missing headset, plain HTTP, or
// a browser without WebXR at all. That is the least useful failure a piece like
// this can have: it reads as "the VR is broken" when usually nothing is.
//
// This turns the silence into a sentence. Author-facing only — an audience at
// an exhibition gets the clean chrome, because for them the answer is always
// "the headset is already on".

export const XR_READY = 'ready'
export const XR_INSECURE = 'insecure-context'
export const XR_NO_WEBXR = 'no-webxr'
export const XR_NO_DEVICE = 'no-device'
export const XR_AR_ONLY = 'ar-only'

/**
 * @param environment  shape from useXrAr's diagnostics: { secureContext,
 *                     hasNavigatorXr, hasIsSessionSupported }
 * @param supportedXrModes  { vr, ar }
 */
export const xrAvailability = (environment = {}, supportedXrModes = {}) => {
    if (supportedXrModes.vr) {
        return { state: XR_READY, reason: '', fix: '' }
    }

    // AR yes, VR no. Judged against VR ALONE rather than "either mode", which
    // is what this used to do — and that `||` was a hole exactly the shape of
    // the bug this file exists to prevent. An AR-capable phone answered "ready",
    // so the chrome fell silent, while the Enter VR button stayed hidden because
    // it keys off `vr` on its own. The result was the original failure mode
    // wearing a disguise: no button, no error, no reason, and a working Enter AR
    // button next to it implying the whole thing was fine.
    //
    // Phones and tablets are the usual case — ARCore/ARKit do handheld AR and
    // no headset is attached, so `immersive-vr` is genuinely unsupported and no
    // amount of Recheck will change it. Naming that is the difference between
    // "the piece is broken" and "this is the wrong device".
    if (supportedXrModes.ar) {
        return {
            state: XR_AR_ONLY,
            reason: 'this device offers AR but not VR — usually a phone or tablet',
            fix: 'open it in a headset\'s own browser, or start Link / SteamVR on a PC and press Recheck'
        }
    }

    // Checked BEFORE navigator.xr, because an insecure context is why
    // navigator.xr is missing — reporting "no WebXR" here would send you off
    // debugging the browser when the real problem is the URL. This is the
    // common case: the headset browser opened the dev server by LAN IP.
    if (environment.secureContext === false) {
        return {
            state: XR_INSECURE,
            reason: 'this page is not a secure context, so WebXR is switched off',
            fix: 'open it over localhost or https — a LAN IP on plain http can never enter VR'
        }
    }

    if (!environment.hasNavigatorXr || !environment.hasIsSessionSupported) {
        return {
            state: XR_NO_WEBXR,
            reason: 'this browser does not expose WebXR',
            fix: 'use Chrome, Edge, or the headset\'s own browser'
        }
    }

    return {
        state: XR_NO_DEVICE,
        reason: 'WebXR is available but no headset is connected',
        fix: 'start Link / SteamVR, then press Recheck — no reload needed'
    }
}

/** One line for the chrome. */
export const formatXrAvailability = (availability) =>
    availability.state === XR_READY ? '' : `${availability.reason} · ${availability.fix}`

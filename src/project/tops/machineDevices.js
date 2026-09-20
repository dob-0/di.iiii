// What THIS machine has, as far as a web page may know without asking.
//
// Nothing here prompts. Cameras and microphones are listed by enumerateDevices,
// which gives names only once the page has been allowed a camera before — so a
// machine that never has shows "Camera 1". Screens come from the Window
// Management API when that permission is ALREADY granted, and otherwise from
// window.screen: the one this page is on, which on a kiosk is the projector.
//
// NDI® sources are the odd one out: they are not this machine's hardware, they
// are what this machine's own serverXR can SEE on the network. They belong
// here anyway, because the question the desk asks is the same one — "can the
// machine that draws the wall show the thing this surface names?" — and the
// answer travels on the same presence message.

import { fetchNdiSources } from '../../map/ndiLink.js'

const KIND = { videoinput: 'camera', audioinput: 'mic', audiooutput: 'speaker' }

// A machine with no NDI runtime must report NOTHING and take no time doing it.
// The probe is the last thing a page does before saying hello, it runs on every
// devicechange, and a hosted tier answers 404 to all of it — so it gets a short
// leash and every failure is swallowed. Silence here is the ordinary case.
const NDI_TIMEOUT_MS = 1500

const readNdiSources = async () => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => controller?.abort(), NDI_TIMEOUT_MS)
    try {
        const sources = await fetchNdiSources({ signal: controller?.signal })
        return sources
            .map((source) => String(source?.name || '').trim())
            .filter(Boolean)
            .map((name) => ({ kind: 'ndi', id: name, label: name }))
    } catch {
        return []
    } finally {
        clearTimeout(timer)
    }
}

export const readMachineDevices = async () => {
    const devices = []
    const media = globalThis.navigator?.mediaDevices
    if (media?.enumerateDevices) {
        try {
            const counts = {}
            for (const device of await media.enumerateDevices()) {
                const kind = KIND[device.kind]
                if (!kind || device.deviceId === 'default' || device.deviceId === 'communications') continue
                counts[kind] = (counts[kind] || 0) + 1
                devices.push({
                    kind,
                    id: device.deviceId || `${kind}-${counts[kind]}`,
                    label: device.label || `${kind === 'camera' ? 'Camera' : kind === 'mic' ? 'Microphone' : 'Speaker'} ${counts[kind]}`
                })
            }
        } catch { /* no media devices here */ }
    }

    let screens = null
    try {
        const status = await globalThis.navigator?.permissions?.query?.({ name: 'window-management' })
        if (status?.state === 'granted' && globalThis.getScreenDetails) {
            const details = await globalThis.getScreenDetails()
            screens = details.screens.map((screen, index) => ({
                kind: 'screen',
                id: `screen-${index}`,
                label: screen.label || (screen.isInternal ? 'Built-in screen' : `Screen ${index + 1}`),
                // Real pixels, not CSS pixels: a 1920×1080 panel at 150% scaling reports
                // 1280×720 here, and the desk would size a wall for a screen that does not exist.
                width: Math.round(screen.width * (screen.devicePixelRatio || 1)),
                height: Math.round(screen.height * (screen.devicePixelRatio || 1))
            }))
        }
    } catch { /* not a Chromium, or not allowed: fall back to this one */ }
    if (!screens && globalThis.screen) {
        const ratio = globalThis.devicePixelRatio || 1
        screens = [{ kind: 'screen', id: 'screen-0', label: 'Screen', width: Math.round(globalThis.screen.width * ratio), height: Math.round(globalThis.screen.height * ratio) }]
    }
    return [...tidyDevices(devices), ...(screens || []), ...(await readNdiSources())]
}

/**
 * One line per real device. Linux lists every ALSA route of one sound chip as
 * its own input — "HDA Intel PCH, ALC269VB Analog-Direct hardware device…",
 * "…-Default Audio Device", five times over on asuz. The part before the dash is
 * the device; the rest is plumbing a person does not choose between.
 */
export const tidyDevices = (devices) => {
    const seen = new Set()
    const out = []
    for (const device of devices) {
        const plain = device.kind === 'camera' ? device.label : device.label.replace(/^(.+?, .+?)-.*$/, '$1')
        const key = `${device.kind}:${plain}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ ...device, label: plain })
    }
    return out
}

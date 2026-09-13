// What THIS machine has, as far as a web page may know without asking.
//
// Nothing here prompts. Cameras and microphones are listed by enumerateDevices,
// which gives names only once the page has been allowed a camera before — so a
// machine that never has shows "Camera 1". Screens come from the Window
// Management API when that permission is ALREADY granted, and otherwise from
// window.screen: the one this page is on, which on a kiosk is the projector.

const KIND = { videoinput: 'camera', audioinput: 'mic', audiooutput: 'speaker' }

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
                width: screen.width,
                height: screen.height
            }))
        }
    } catch { /* not a Chromium, or not allowed: fall back to this one */ }
    if (!screens && globalThis.screen) {
        screens = [{ kind: 'screen', id: 'screen-0', label: 'Screen', width: globalThis.screen.width, height: globalThis.screen.height }]
    }
    return [...devices, ...(screens || [])]
}

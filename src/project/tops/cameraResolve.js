// Which camera a Camera In / deck camera clip opens, and when to try again.
//
// The rule (2026-11-10, owner test on aylmo): a camera that is NAMED — by label
// or by id — never falls to the machine's default camera. A device id belongs to
// one browser profile and a label is an empty string until this page has been
// allowed a camera, so "not in the list" first means "labels are hidden", not
// "absent". Only a source with neither label nor id uses the default.

// 2 s, 4 s, 8 s, then every 8 s: the picture arrives by itself when a busy
// camera is freed or a missing one is plugged in.
export const CAMERA_RETRY_MS = [2000, 4000, 8000]
export const cameraRetryDelay = (attempt) => CAMERA_RETRY_MS[Math.min(Math.max(attempt, 0), CAMERA_RETRY_MS.length - 1)]

// A refusal by the person is not waited out: retrying would only ask again.
export const cameraRetryable = (errorName) => errorName !== 'NotAllowedError' && errorName !== 'SecurityError'

export class CameraNotFoundError extends Error {
    constructor(name) {
        super(`Camera "${name}" not found`)
        this.name = 'CameraNotFound'
        this.camera = name
    }
}

const videoInputs = async (media) => (await media.enumerateDevices()).filter((device) => device.kind === 'videoinput')
const pick = (list, deviceId, label) =>
    (deviceId && list.find((device) => device.deviceId === deviceId)) || (label && list.find((device) => device.label === label)) || null

/**
 * Resolve to `true` (the default camera: nothing was named) or
 * `{ deviceId: { exact } }`. Throws `CameraNotFoundError` when the named camera
 * is not on this machine, or whatever the permission probe throws.
 * `permission` is `{ asked }`, kept by the caller so the probe runs once.
 */
export async function resolveCamera(media, deviceId, label, permission = { asked: false }) {
    if (!deviceId && !label) return true
    let list = await videoInputs(media)
    let found = pick(list, deviceId, label)
    if (!found && list.length > 0 && list.every((device) => !device.label) && !permission.asked) {
        // Labels are hidden until this page holds a camera permission: ask once
        // the existing way, then read the list again.
        permission.asked = true
        const probe = await media.getUserMedia({ video: true, audio: false })
        probe.getTracks().forEach((track) => track.stop())
        list = await videoInputs(media)
        found = pick(list, deviceId, label)
    }
    if (!found) throw new CameraNotFoundError(label || deviceId)
    return { deviceId: { exact: found.deviceId } }
}

import * as THREE from 'three'

// Spatial sound for a video plane: the clip's own audio track is routed through
// a Web Audio panner positioned at the video in the scene, so it gets louder as
// a visitor walks toward it and falls away behind them.
//
// Two things make this different from the AudioObject path, which loads a sound
// file into a buffer: the source here is a live <video> element (so picture and
// sound cannot drift apart), and a media element can be routed into Web Audio
// only ONCE -- calling createMediaElementSource on the same element twice
// throws, and from then on the element is silent. Hence the WeakMap.
const routedElements = new WeakMap()

export const DEFAULT_REF_DISTANCE = 6
export const DEFAULT_MAX_DISTANCE = 40
export const DEFAULT_ROLLOFF = 1.4
// 'inverse' is the Web Audio default and the old behaviour, but its gain only
// ASYMPTOTES toward zero — past maxDistance it floors around 10%% and never
// reaches silence, so ten works in one corridor accumulate into a murmur you
// cannot walk out of. 'linear' hits exactly 0 at maxDistance, which is what
// lets a room go properly quiet when you step out of it.
export const DEFAULT_DISTANCE_MODEL = 'inverse'
const DISTANCE_MODELS = new Set(['linear', 'inverse', 'exponential'])

// One listener per camera, shared by every sound in the scene. Three.js updates
// a listener's world matrix through the camera, so it tracks the visitor with
// no work of ours.
export const getOrCreateAudioListener = (camera) => {
    if (!camera) return null
    const existing = camera.children?.find((child) => child.isAudioListener)
    if (existing) return existing
    const listener = new THREE.AudioListener()
    camera.add(listener)
    return listener
}

// A browser starts its AudioContext suspended and only lets a gesture resume it.
// Video already waits for user activation before unmuting (see
// utils/videoPlayback.js); this is the same wait for the Web Audio side.
export const resumeContextOnGesture = (listener) => {
    const context = listener?.context
    if (!context || context.state !== 'suspended') return () => {}
    const resume = () => { context.resume?.().catch(() => {}) }
    const events = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((name) => window.addEventListener(name, resume, { once: true, passive: true }))
    return () => events.forEach((name) => window.removeEventListener(name, resume))
}

/**
 * Route `video`'s audio through a PositionalAudio parented to `target`.
 *
 * Returns a detach function. Returns null (and does nothing) when the element
 * has already been routed, when there is no listener, or when the browser
 * refuses the connection — callers keep the flat sound path in that case rather
 * than losing audio entirely.
 */
export const attachPositionalVideoSound = (target, video, listener, options = {}) => {
    if (!target || !video || !listener) return null
    if (routedElements.has(video)) return null

    const refDistance = Number.isFinite(options.refDistance) ? options.refDistance : DEFAULT_REF_DISTANCE
    const maxDistance = Number.isFinite(options.maxDistance) ? options.maxDistance : DEFAULT_MAX_DISTANCE
    const volume = Math.min(1, Math.max(0, Number.isFinite(options.volume) ? options.volume : 1))

    let sound = null
    try {
        sound = new THREE.PositionalAudio(listener)
        sound.setMediaElementSource(video)
        sound.setRefDistance(refDistance)
        sound.setMaxDistance(maxDistance)
        const model = DISTANCE_MODELS.has(options.distanceModel) ? options.distanceModel : DEFAULT_DISTANCE_MODEL
        sound.setDistanceModel(model)
        // Under 'linear', gain is 1 - rolloff * (d - ref) / (max - ref), so a
        // rolloff of 1 is what makes maxDistance mean exactly "silent past here".
        // DEFAULT_ROLLOFF (1.4) was tuned for 'inverse' and would land silence
        // well short of maxDistance, making the authored number meaningless.
        const fallbackRolloff = model === 'linear' ? 1 : DEFAULT_ROLLOFF
        sound.setRolloffFactor(Number.isFinite(options.rolloff) ? options.rolloff : fallbackRolloff)
        sound.setVolume(volume)
        target.add(sound)
        routedElements.set(video, sound)
        // Sound is invisible: nothing on screen says whether a panner exists or
        // what it is doing. Same DEV-only hook idea as window.__diiWalkerRef.
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            window.__diiSpatialSounds = window.__diiSpatialSounds || new Set()
            window.__diiSpatialSounds.add(sound)
        }
    } catch {
        // An already-routed element, a cross-origin track the context refuses,
        // or a browser without the API. The video keeps its own flat audio.
        if (sound?.parent) sound.parent.remove(sound)
        return null
    }

    return () => {
        try {
            sound.disconnect?.()
        } catch {
            // disconnect throws if the graph is already torn down; nothing to do.
        }
        if (sound.parent) sound.parent.remove(sound)
        routedElements.delete(video)
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            window.__diiSpatialSounds?.delete(sound)
        }
    }
}

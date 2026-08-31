import * as THREE from 'three'
import { keepAudioAwake } from './audioWake.js'

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
//
// It is `keepAudioAwake` rather than a one-shot gesture listener of its own,
// and that difference is a bug this codebase has already paid for once. A
// context can be suspended long AFTER the gesture that first resumed it — a
// standalone headset switches audio device as an immersive session starts, and
// tab backgrounding and headset sleep do the same — and a listener registered
// `once` is long gone by then. algovrithm went silent that way for a whole
// session with no way back (see utils/audioWake.js); a video plane in a
// published space is the same context on the same devices.
export const keepListenerAwake = (listener) => keepAudioAwake(listener?.context)

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
        sound.setRolloffFactor(Number.isFinite(options.rolloff) ? options.rolloff : DEFAULT_ROLLOFF)
        sound.setDistanceModel('inverse')
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

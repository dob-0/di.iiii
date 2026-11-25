// A tiny live monitor of what the controller sends: which button is held, the last value of
// each knob / fader, and when each control was last touched. It is a plain subscribe/snapshot
// store (useSyncExternalStore shape), so the deck never re-renders because of it; only the
// K2 panel subscribes. Value updates are published at most every PUBLISH_GAP_MS (about 30 a
// second); a button press or release is published at once.
import { controlOf } from './deckBinding.js'

export const TOUCH_MS = 600
export const PUBLISH_GAP_MS = 33

/** The key of a control on the device: "cc:16", "note:36" (channel is ignored on purpose). */
export const controlKey = (kind, number) => `${kind}:${number}`
/** The same control on ONE channel: "cc:7@3". The APC40 repeats numbers across channels (five faders are all CC 7). */
export const channelKey = (kind, number, channel) => `${kind}:${number}@${channel}`

export function createK2Monitor({ now = () => Date.now() } = {}) {
    const listeners = new Set()
    let draft = { held: {}, values: {}, touched: {}, last: '', at: 0 }
    let snapshot = draft
    let timer = null
    let publishedAt = -Infinity

    const publish = () => {
        if (timer !== null) { clearTimeout(timer); timer = null }
        publishedAt = now()
        snapshot = { held: { ...draft.held }, values: { ...draft.values }, touched: { ...draft.touched }, last: draft.last, at: publishedAt }
        for (const listener of Array.from(listeners)) listener()
    }

    return {
        subscribe(listener) {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
        getSnapshot: () => snapshot,
        /** One parsed MIDI message (kind cc / noteOn / noteOff). Anything else is ignored. */
        push(message) {
            const control = controlOf(message)
            if (!control) return
            const key = controlKey(control.kind, control.number)
            const onChannel = channelKey(control.kind, control.number, control.channel)
            draft.values[key] = control.value
            draft.touched[key] = now()
            draft.values[onChannel] = control.value
            draft.touched[onChannel] = draft.touched[key]
            draft.last = key
            if (control.kind === 'note') {
                draft.held[key] = control.press
                draft.held[onChannel] = control.press
                publish()
                return
            }
            if (timer !== null) return
            const wait = Math.max(0, publishedAt + PUBLISH_GAP_MS - now())
            if (wait === 0) publish()
            else timer = setTimeout(publish, wait)
        },
        dispose() {
            if (timer !== null) { clearTimeout(timer); timer = null }
        }
    }
}

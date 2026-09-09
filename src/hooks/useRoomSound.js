import { useEffect, useState } from 'react'
import {
    armVisitorSound, isSoundAllowed, isSoundLocked, isSoundOn, setSoundOn, subscribeSound, toggleSound
} from '../utils/roomSound.js'

// React's view of the visitor's sound switch (src/utils/roomSound.js).
// Every caller sees the same value, including components inside different
// Canvases, because the switch lives in the module and this only subscribes.
export function useRoomSound() {
    const [, bump] = useState(0)
    useEffect(() => subscribeSound(() => bump((n) => n + 1)), [])
    return {
        soundOn: isSoundOn(),
        // What an object that makes noise asks: true on an ungated page.
        soundAllowed: isSoundAllowed(),
        locked: isSoundLocked(),
        setSoundOn,
        toggleSound,
    }
}

// Arm the gate for as long as this component is mounted. Called by the public
// viewer; never by the editor, where an author has to hear what they place.
export function useVisitorSoundGate(active = true) {
    useEffect(() => {
        if (!active) return undefined
        return armVisitorSound()
    }, [active])
}

export default useRoomSound

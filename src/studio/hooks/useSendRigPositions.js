import { useCallback, useEffect, useRef, useState } from 'react'
import { getSharedLightingMirror } from '../../rigMirror/useLightingMirror.js'
import { sendPositionsToDesk } from '../../rigMirror/sendPositions.js'

// The button's state: one click sends, one sentence comes back and stays for a
// moment. The fixtures are read from the store AT THE CLICK — nothing here subscribes,
// so the shell does not re-render at the rig's 10 Hz.
export const NOTE_MS = 6000

export function useSendRigPositions({ entities = [], mirror, noteMs = NOTE_MS } = {}) {
    const [note, setNote] = useState('')
    const timer = useRef(null)
    const alive = useRef(true)
    useEffect(() => () => {
        alive.current = false
        if (timer.current) clearTimeout(timer.current)
    }, [])

    const send = useCallback(async () => {
        const store = mirror || getSharedLightingMirror()
        const { present, fixtures } = store.getSnapshot()
        const result = await sendPositionsToDesk({ entities, fixtures, present })
        if (!alive.current) return result
        setNote(result.message)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { if (alive.current) setNote('') }, noteMs)
        return result
    }, [entities, mirror, noteMs])

    return { send, note }
}

export default useSendRigPositions

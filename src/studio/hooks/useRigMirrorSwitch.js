import { useCallback, useState } from 'react'
import { useLightingDeskPresent } from '../../rigMirror/useLightingMirror.js'

// The Rig switch: is there a lighting desk on this machine, and does this browser want
// the rig drawn in the room? Off by default, remembered per browser. Its own storage
// key, outside the workspace blob, so "Reset" on the panel layout does not flip it and
// neighbouring work on that blob never collides with this.
const STORAGE_KEY = 'dii.studio.rigMirror.v1'

const load = () => {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

const save = (on) => {
    try { window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0') } catch { /* it just will not be remembered */ }
}

export function useRigMirrorSwitch() {
    const available = useLightingDeskPresent()
    const [wanted, setWanted] = useState(load)
    const toggle = useCallback(() => {
        setWanted((current) => {
            save(!current)
            return !current
        })
    }, [])
    // `on` needs both: a remembered "on" with no desk here draws nothing and asks nothing.
    return { available, on: available && wanted, toggle }
}

export default useRigMirrorSwitch

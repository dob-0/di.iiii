import { useCallback, useEffect, useRef, useState } from 'react'
import { parseViewHash, presetForKey, viewHash } from './smartViewGeometry.js'

// The DOM side of the smart view: which preset is on, x-ray, the keys, the link.
//
//   keys      1–6 the presets, Alt+Z x-ray (Blender's own binding for X-Ray). A key a
//             cue already claims (Studio's cue keys, src/studio/hooks/useStudioCues.js)
//             is left to the cue: `reservedKeys`.
//   the link  `#view-top` opens on that view once the room is measured (deepLink), and
//             choosing a view writes it back with replaceState — never a navigation, so
//             Back still leaves the room. Taking the camera clears it.
//   keysLive  false while this viewport should not listen (a Studio pane the pointer is
//             not over — the Blender rule: shortcuts act on the area under the cursor).
export default function useSmartViewState({ enabled = true, deepLink = false, keysLive = true, reservedKeys = null } = {}) {
    const [presets, setPresets] = useState([])
    const [activeId, setActiveId] = useState(null)
    const [command, setCommand] = useState({ presetId: null, nonce: 0 })
    const [xray, setXray] = useState(false)
    const hashApplied = useRef(false)

    const choose = useCallback((id) => {
        setActiveId(id)
        setCommand((c) => ({ presetId: id, nonce: c.nonce + 1 }))
        if (deepLink && typeof window !== 'undefined' && window.history?.replaceState) {
            const url = `${window.location.pathname}${window.location.search}${viewHash(id)}`
            window.history.replaceState(window.history.state, '', url)
        }
    }, [deepLink])

    const release = useCallback(() => {
        setActiveId((current) => {
            if (current === null) return current
            if (deepLink && typeof window !== 'undefined' && parseViewHash(window.location.hash) && window.history?.replaceState) {
                window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
            }
            return null
        })
    }, [deepLink])

    // The link, once the views exist.
    useEffect(() => {
        if (!enabled || !deepLink || hashApplied.current || !presets.length || typeof window === 'undefined') return
        hashApplied.current = true
        const id = parseViewHash(window.location.hash)
        if (id) choose(id)
    }, [enabled, deepLink, presets, choose])

    useEffect(() => {
        if (!enabled || !keysLive || !presets.length || typeof window === 'undefined') return undefined
        const onKey = (event) => {
            const t = event.target
            if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
            if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyZ' || event.key === 'z' || event.key === 'Z')) {
                event.preventDefault()
                setXray((on) => !on)
                return
            }
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            if (reservedKeys?.has?.(event.key)) return
            const id = presetForKey(event.key)
            if (!id || !presets.some((p) => p.id === id)) return
            event.preventDefault()
            choose(id)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enabled, keysLive, presets, reservedKeys, choose])

    return { presets, setPresets, activeId, command, xray, setXray, choose, release }
}

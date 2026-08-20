import { useEffect } from 'react'

const normaliseKey = (value) => {
    const raw = (value || 'Space').trim()
    if (!raw) return 'Space'
    if (raw === ' ') return 'Space'
    return raw.length === 1 ? raw.toUpperCase() : raw
}

const eventMatches = (event, wanted) => {
    if (event.code === wanted) return true
    const key = event.key === ' ' ? 'Space' : event.key
    return key.toUpperCase() === wanted.toUpperCase()
}

// The graph's ear on the keyboard — no window, no mesh, one per Keyboard
// node (the VideoFrameFeed shape). Ignores keys typed into fields: the
// spacebar that fires the show must not fire while naming a node. Repeat
// events don't recount — a held key is one event, the Counter convention.
export default function KeyboardFeed({ node, onKeyState }) {
    const wanted = normaliseKey(node.values?.key)

    useEffect(() => {
        let count = 0
        const typingIn = (target) => {
            const tag = target?.tagName
            return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
        }
        const down = (event) => {
            if (event.repeat || typingIn(event.target) || !eventMatches(event, wanted)) return
            count += 1
            onKeyState?.(node.id, true, count)
        }
        const up = (event) => {
            if (typingIn(event.target) || !eventMatches(event, wanted)) return
            onKeyState?.(node.id, false, count)
        }
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        return () => {
            window.removeEventListener('keydown', down)
            window.removeEventListener('keyup', up)
            onKeyState?.(node.id, null, null)
        }
    }, [node.id, wanted, onKeyState])

    return null
}

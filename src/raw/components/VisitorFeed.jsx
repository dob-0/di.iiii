import { useEffect } from 'react'
import { loadVisitorMemory, readVisitorFacts, rememberVisitorName } from '../utils/visitorFacts.js'

// The graph's eye on the person's screen — no window, no mesh, one per
// Visitor node (the KeyboardFeed shape). It reads the facts once on mount and
// again whenever the screen turns, resizes, or the person changes their
// reduced-motion setting; Name, Hue and Id come from this browser's memory
// (visitorFacts.js), which survives storage that throws by lasting the visit.
export default function VisitorFeed({ node, newName = '', onVisitor }) {
    useEffect(() => {
        const publish = () => {
            const memory = loadVisitorMemory(window)
            onVisitor?.(node.id, {
                ...readVisitorFacts(window),
                name: memory.name,
                hue: memory.hue,
                visitorId: memory.id,
            })
        }
        publish()
        window.addEventListener('resize', publish)
        window.addEventListener('orientationchange', publish)
        const queries = ['(prefers-reduced-motion: reduce)', '(pointer: coarse)'].map((query) => {
            try {
                return window.matchMedia?.(query) || null
            } catch {
                return null
            }
        }).filter(Boolean)
        for (const query of queries) query.addEventListener?.('change', publish)
        return () => {
            window.removeEventListener('resize', publish)
            window.removeEventListener('orientationchange', publish)
            for (const query of queries) query.removeEventListener?.('change', publish)
            onVisitor?.(node.id, null)
        }
    }, [node.id, onVisitor])

    useEffect(() => {
        const before = loadVisitorMemory(window).name
        const memory = rememberVisitorName(newName, window)
        if (memory.name === before) return
        onVisitor?.(node.id, {
            ...readVisitorFacts(window),
            name: memory.name,
            hue: memory.hue,
            visitorId: memory.id,
        })
    }, [node.id, newName, onVisitor])

    return null
}

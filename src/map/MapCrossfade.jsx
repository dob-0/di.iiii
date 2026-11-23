import { useEffect, useRef, useState } from 'react'

// One visual giving way to the next.
//
// The new picture is mounted UNDER the old one's opacity — at 0 — and only
// starts to fade in once it says it has something to show. A page needs a
// second to load, a video its first frame; the wall keeps the old visual all
// that time instead of dipping to black or showing a loading card to the room.
// A source that never says so is shown anyway after READY_WAIT_MS, so a broken
// file can never freeze the wall on the visual before it.
//
// New over old: the incoming layer fades in on top while the outgoing one stays
// fully up, then the outgoing one is unmounted. For an opaque picture that is
// exactly a mix, with no dip in the middle. Fading to nothing (`item` null)
// fades the last layer out instead.
const READY_WAIT_MS = 4000

export default function MapCrossfade({ item, fade = 0, renderItem }) {
    const serial = useRef(0)
    const [layers, setLayers] = useState(() => (item ? [{ id: 0, item, phase: 'loading' }] : []))
    const key = item?.key || ''

    // A different key is a different picture. The same key with fresh data
    // (a renamed visual) just updates the layer it already has.
    useEffect(() => {
        setLayers((current) => {
            const top = current[current.length - 1]
            if (top && top.phase !== 'leaving' && (top.item?.key || '') === key) {
                return top.item === item ? current : [...current.slice(0, -1), { ...top, item }]
            }
            // Anything still loading is abandoned: only the newest ask counts.
            const settled = current.filter((layer) => layer.phase !== 'loading')
            if (!item) return settled.map((layer) => ({ ...layer, phase: 'leaving' }))
            serial.current += 1
            return [...settled, { id: serial.current, item, phase: 'loading' }]
        })
    }, [key, item])

    const reveal = (id) => setLayers((current) => {
        const index = current.findIndex((layer) => layer.id === id)
        if (index === -1 || current[index].phase !== 'loading') return current
        return current.map((layer, at) => (at === index ? { ...layer, phase: 'shown' } : layer))
    })

    // Give up waiting on a source that never reports in.
    const loadingId = layers.find((layer) => layer.phase === 'loading')?.id
    useEffect(() => {
        if (loadingId === undefined) return undefined
        const timer = setTimeout(() => reveal(loadingId), READY_WAIT_MS)
        return () => clearTimeout(timer)
    }, [loadingId])

    // Once the newest shown layer has finished fading in — or the last one has
    // finished fading out — everything under it goes.
    const shownIds = layers.filter((layer) => layer.phase === 'shown').map((layer) => layer.id)
    const newestShown = shownIds[shownIds.length - 1]
    const leavingCount = layers.filter((layer) => layer.phase === 'leaving').length
    useEffect(() => {
        const hasOlder = layers.some((layer) => layer.phase !== 'loading' && layer.id !== newestShown)
        if (!hasOlder) return undefined
        const timer = setTimeout(() => {
            setLayers((current) => current.filter((layer) => layer.phase === 'loading' || (newestShown !== undefined && layer.id === newestShown)))
        }, (Math.max(0, fade) * 1000) + 60)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newestShown, leavingCount, fade])

    return layers.map((layer) => (
        <div
            key={layer.id}
            className="map-crossfade-layer"
            data-phase={layer.phase}
            style={{
                // Loading waits unseen; leaving only ever happens on a fade to
                // nothing, so it goes down to 0 rather than staying up.
                opacity: layer.phase === 'shown' ? 1 : 0,
                transitionDuration: `${Math.max(0, fade)}s`
            }}
        >
            {renderItem(layer.item, () => reveal(layer.id))}
        </div>
    ))
}

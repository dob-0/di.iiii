import { useLayoutEffect, useState } from 'react'

// Map mode, as Ableton draws it: while Learn is on, every control that can take a
// MIDI binding (data-midi-target) is tinted, the mapped ones carry a small tag with
// their number, and the picked one is outlined. One layer over the deck root, one box
// per control, measured from the control itself, so no control's own markup changes.
// The layer ignores the pointer: clicks still reach the controls (Learn picks them).
// rootRef    ref of the deck root element (position: relative, it scrolls)
// midi       useDeckMidi's result (learning, target, bindingOf)
// layoutKey  anything that moves controls (the deck) so the boxes are measured again

const same = (a, b) => a.length === b.length && a.every((box, i) => box.key === b[i].key && box.left === b[i].left && box.top === b[i].top && box.width === b[i].width && box.height === b[i].height && box.tag === b[i].tag)

export default function MidiMapOverlay({ rootRef, midi, layoutKey }) {
    const { learning, target, bindingOf } = midi
    const [boxes, setBoxes] = useState([])
    const pickedKey = target?.key || ''

    useLayoutEffect(() => {
        const root = rootRef.current
        if (!learning || !root) { setBoxes((old) => (old.length ? [] : old)); return undefined }
        const measure = () => {
            const base = root.getBoundingClientRect()
            const next = Array.from(root.querySelectorAll('[data-midi-target]'))
                .filter((el) => !el.closest('[hidden]'))
                .map((el) => {
                    const key = el.getAttribute('data-midi-target')
                    const r = el.getBoundingClientRect()
                    const bound = bindingOf(key)
                    return { key, left: Math.round(r.left - base.left + root.scrollLeft), top: Math.round(r.top - base.top + root.scrollTop), width: Math.round(r.width), height: Math.round(r.height), tag: bound ? bound.short : '', learned: Boolean(bound?.learned) }
                })
            setBoxes((old) => (same(old, next) ? old : next))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [learning, rootRef, bindingOf, layoutKey])

    if (!learning) return null
    return (
        <div className="vj-deck-mapmode" aria-hidden="true" data-testid="midi-map-overlay">
            {boxes.map((box) => (
                <span
                    key={box.key}
                    className={`vj-deck-mapbox${box.tag ? ' is-mapped' : ''}${box.key === pickedKey ? ' is-picked' : ''}`}
                    data-map-key={box.key}
                    style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                >
                    {box.tag ? <span className="vj-deck-maptag">{box.tag}</span> : null}
                </span>
            ))}
        </div>
    )
}

import { useEffect, useMemo, useState } from 'react'
import { isProjectLoaded, LAYER_KEYS, readProjectLayers } from './layers.js'

// The layers of the project an editor has open, for the editor's own screen.
//
// readProjectLayers is the rule; this adds the one thing a live screen needs on
// top of it: while a person works, nothing they have already been given is
// taken back. Place the first box and Nodes appears on the bar; undo that box
// and Nodes stays — a bar that shrinks under the cursor after an undo is a
// screen that fights the person. The memory is this page's only (component
// state, per project): nothing is written anywhere, and the next load of the
// project reads the rule afresh — the same on every device.
//
// Returns the rule's answer with two fields widened by the session:
//   open  — each layer open now OR open earlier on this page (null before load)
//   held  — the project has held something at some point on this page
const sameOpen = (a, b) => Boolean(a && b) && LAYER_KEYS.every((key) => Boolean(a[key]) === Boolean(b[key]))

// `hasLoaded` is the store's own flag (state.hasLoaded); see isProjectLoaded.
export function useProjectLayers(document, projectId, hasLoaded) {
    const loaded = isProjectLoaded(document, projectId, hasLoaded)
    const layers = useMemo(() => readProjectLayers(document, { loaded }), [document, loaded])
    const [seen, setSeen] = useState({ projectId: null, open: null, held: false })
    const earlier = seen.projectId === projectId ? seen : null

    const open = useMemo(() => {
        if (!layers.open) return null
        if (!earlier?.open) return layers.open
        return Object.fromEntries(LAYER_KEYS.map((key) => [key, Boolean(layers.open[key] || earlier.open[key])]))
    }, [layers.open, earlier])
    const held = layers.loaded ? Boolean(earlier?.held || !layers.empty) : false

    useEffect(() => {
        if (!layers.loaded) return
        if (earlier && earlier.held === held && sameOpen(earlier.open, open)) return
        setSeen({ projectId, open, held })
    }, [layers.loaded, earlier, held, open, projectId])

    return useMemo(() => ({ ...layers, open, held }), [layers, open, held])
}

export default useProjectLayers

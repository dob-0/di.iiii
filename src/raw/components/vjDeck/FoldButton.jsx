import { createContext, useContext } from 'react'

// The fold control of one bottom panel (Sources, Clip, Effects), in the panel's own head.
//
// A real button: Enter and Space click it natively. aria-expanded says whether the panel is open.
// Folded, the panel is a narrow rail (vjDeck.css) and this button is all it shows: the panel's name
// and a plus. The state is the viewer's (useDeckLayout.js, the 'di.vjDeck.layout' key), never the
// project's. Without a provider (a panel shown on its own) nothing is drawn.
export const DeckFoldContext = createContext(null)

const NAMES = { sources: 'Sources', clip: 'Clip', effects: 'Effects' }

export default function FoldButton({ panel }) {
    const fold = useContext(DeckFoldContext)
    if (!fold) return null
    const name = NAMES[panel]
    const folded = fold.folded.includes(panel)
    const lastOpen = !folded && fold.folded.length >= Object.keys(NAMES).length - 1
    let title
    if (fold.locked) title = 'The layout is locked. Unlock it to fold or unfold panels.'
    else if (folded) title = `Unfold the ${name} panel`
    else if (lastOpen) title = 'At least one panel stays open. Unfold another panel to fold this one.'
    else title = `Fold the ${name} panel to a narrow strip`
    return (
        <button
            type="button"
            className="vj-deck-button vj-deck-button--quiet vj-deck-fold"
            aria-expanded={!folded}
            aria-disabled={fold.locked || lastOpen ? 'true' : undefined}
            aria-label={`${name} panel`}
            title={title}
            onClick={() => { if (!fold.locked && !lastOpen) fold.toggle(panel) }}
        >
            <span className="vj-deck-fold-mark" aria-hidden="true">{folded ? '+' : '-'}</span>
            <span className="vj-deck-fold-name" aria-hidden="true">{name}</span>
        </button>
    )
}

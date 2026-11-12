import { normalizeDeck } from './vjDeck.js'

// Which light cue a deck column fires. The deck stores only a cue id per column
// (deck.columnCues); the cues themselves live in the project's mappingState.cues.
// No matching by name: an id that no cue has reads as no cue.

/** The cue whose id is stored for this column, or null. */
export const cueForColumn = (deck, column, cues) => {
    if (!Number.isInteger(column) || column < 0) return null
    const id = normalizeDeck(deck).columnCues[column]
    if (!id || !Array.isArray(cues)) return null
    return cues.find((cue) => cue && cue.id === id) || null
}

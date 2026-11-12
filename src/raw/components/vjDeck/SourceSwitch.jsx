import { useSyncExternalStore } from 'react'
import { getSourcesOff, setSourceOff, subscribeSourcesOff } from '../../../project/tops/sourceSwitch.js'
import './sourceSwitch.css'

// The on/off switch at the end of a Sources row (the eye next to a source in OBS).
// Off = this computer stops using the source; the state is kept per computer and browser
// profile in localStorage (project/tops/sourceSwitch.js), never in the project.

export const TURN_OFF_TITLE = 'Turn off: the deck stops using this source on this computer'
export const TURN_ON_TITLE = 'Turn on: the deck uses this source again'

/** True while the source is switched off; follows every page of this browser. */
export function useSourceOff(sourceKey) {
    return useSyncExternalStore(subscribeSourcesOff, () => Boolean(sourceKey) && getSourcesOff().has(sourceKey), () => false)
}

export default function SourceSwitch({ sourceKey, name, off }) {
    const on = !off
    return (
        <button
            type="button"
            className="vj-deck-button vj-deck-source-switch"
            aria-pressed={on}
            aria-label={`Use ${name}`}
            title={on ? TURN_OFF_TITLE : TURN_ON_TITLE}
            onClick={() => setSourceOff(sourceKey, on)}
        >
            {on ? 'On' : 'Off'}
        </button>
    )
}

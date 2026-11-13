// The one MIDI control in the deck's top row: device and state, Learn, Reset.
// Existing deck classes only (vj-deck-button, vj-deck-label, vj-deck-dim).
const STATE_TEXT = { absent: 'no controller', listening: 'listening', k2: 'K2', apc40: 'APC40', learn: 'learn' }

export default function DeckMidiControl({ midi, editable = true }) {
    const { state, k2Console, deviceName, learning, target, bindings, toggleLearn, reset, note, bank = 0, bankCount = 1 } = midi
    const hint = learning
        ? (target ? 'Now move or press the control on the controller.' : 'Click a control on the deck, then move or press the control on the controller.')
        : (deviceName ? `MIDI input: ${deviceName}` : 'No MIDI input found')
    return (
        <div className="vj-deck-midi" title={hint}>
            <button
                type="button"
                className={`vj-deck-button${learning ? ' is-on' : ''}`}
                aria-pressed={learning}
                onClick={toggleLearn}
                disabled={!editable}
            >MIDI</button>
            <span className="vj-deck-dim vj-deck-midi-state" role="status">{(state === 'k2' || state === 'apc40') && k2Console ? k2Console.name : (STATE_TEXT[state] || state)}{bankCount > 1 ? ` · BANK ${bank + 1}/${bankCount}` : ''}{learning && target ? ` · ${target.key}` : ''}{note ? ` · ${note}` : ''}</span>
            {learning ? (
                <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={reset} disabled={!editable} aria-label="Reset MIDI to the default map">Reset</button>
            ) : null}
        </div>
    )
}

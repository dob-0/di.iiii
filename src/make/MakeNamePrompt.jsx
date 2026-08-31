import { useState } from 'react'
import { WORDS } from './makeVocabulary.js'
import { normalizeDisplayName } from './makeIdentity.js'

// THE FIRST SCREEN, ONCE.
//
// This is politeness and it is also the only fix for a real defect: nothing in
// Raw has ever written `dii.raw.displayName`, so every child at the camp shows
// in chat as `Guest-C1B3` and every object they make is stamped `createdBy`
// with that same string. See makeIdentity.js.
//
// Deliberately skippable. A child who does not want to type their name on a
// borrowed phone gets into the room anyway — the surface is for making things,
// not for collecting names, and a modal a ten-year-old cannot get past is a
// modal that ends the afternoon.
export default function MakeNamePrompt({ onDone }) {
    const [value, setValue] = useState('')
    const ready = Boolean(normalizeDisplayName(value))

    const submit = (event) => {
        event.preventDefault()
        onDone(normalizeDisplayName(value))
    }

    return (
        <div className="make-name" role="dialog" aria-modal="true" aria-label={WORDS.nameQuestion.en}>
            <form className="make-name-card" onSubmit={submit}>
                <h1 className="make-name-hy">{WORDS.nameQuestion.hy}</h1>
                <p className="make-name-en">{WORDS.nameQuestion.en}</p>
                <input
                    className="make-name-input"
                    type="text"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={WORDS.namePlaceholder.hy}
                    aria-label={WORDS.namePlaceholder.en}
                    maxLength={24}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck="false"
                    enterKeyHint="done"
                />
                <button className="make-name-go" type="submit" disabled={!ready}>
                    <span className="make-word-hy">{WORDS.nameDone.hy}</span>
                    <span className="make-word-en">{WORDS.nameDone.en}</span>
                </button>
                <button className="make-name-skip" type="button" onClick={() => onDone('')}>
                    <span className="make-word-hy">{WORDS.nameSkip.hy}</span>
                    <span className="make-word-en">{WORDS.nameSkip.en}</span>
                </button>
            </form>
        </div>
    )
}

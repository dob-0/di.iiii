import { useRef, useState } from 'react'

import { NEXT_STEP_WORDS } from './nextStep.js'
import './nextStep.css'

/**
 * An empty rig page's next step (F038): one plain line and the buttons that do it.
 * `actions`: { label, href } opens another rig page; { label, make } sends make()'s ops;
 * { label, file } asks for a .json file and sends file(json, fileName)'s ops. A make or a
 * file that cannot do it throws or returns null, and the line under the buttons says why.
 * Read only: the links stay, the buttons that write are not shown.
 */
export default function NextStep({ line, actions = [], applyOps, readOnly = false, className = '' }) {
    const [note, setNote] = useState('')
    const fileRef = useRef(null)
    const pending = useRef(null)
    const send = (ops, done) => {
        if (!ops?.length) return setNote('nothing to write yet')
        applyOps(ops)
        setNote(done)
    }
    const run = (action) => {
        try { send(action.make(), action.done || 'done') } catch (error) { setNote(`could not: ${error.message}`) }
    }
    const pick = (action) => {
        pending.current = action
        fileRef.current?.click()
    }
    const onFile = async (event) => {
        const action = pending.current
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!action || !file) return
        try {
            send(action.file(JSON.parse(await file.text()), file.name), action.done || `loaded ${file.name}`)
        } catch (error) {
            setNote(`could not load ${file.name}: ${error.message}`)
        }
    }
    const shown = actions.filter((a) => a && (a.href || !readOnly))
    return (
        <div className={`rignext ${className}`.trim()} role="group" aria-label="next step">
            <p className="rignext-line">{line}</p>
            {shown.length ? (
                <div className="rignext-acts">
                    {shown.map((a, i) => (a.href
                        ? <a key={a.label} className={`rignext-btn${i === 0 ? ' is-primary' : ''}`} href={a.href}>{a.label}</a>
                        : <button key={a.label} type="button" className={`rignext-btn${i === 0 ? ' is-primary' : ''}`} onClick={() => (a.file ? pick(a) : run(a))}>{a.label}</button>))}
                </div>
            ) : null}
            {readOnly && actions.some((a) => a && !a.href) ? <p className="rignext-note">{NEXT_STEP_WORDS.readOnly}</p> : null}
            {note ? <p className="rignext-note" role="status">{note}</p> : null}
            {readOnly ? null : <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} aria-hidden="true" tabIndex={-1} />}
        </div>
    )
}

import { useId, useRef, useState } from 'react'
import './askdi.css'

// "Ask di": a question box that answers from di.iiii's own public pages, in the
// browser. It never calls a server or a model; a visitor's question stays on the
// page. The index loads when the box is first used (dynamic import), not before.
const EXAMPLES = ['How do I join a space?', 'What is di.iiii?', 'How do I support the work?', 'Where are the works?']

export default function AskDi() {
    const [question, setQuestion] = useState('')
    const [state, setState] = useState({ phase: 'idle', results: [], asked: '' })
    const engine = useRef(null)
    const inputId = useId()

    async function run(q) {
        const text = q.trim()
        if (!text) return
        setState((s) => ({ ...s, phase: 'working', asked: text }))
        try {
            if (!engine.current) {
                const mod = await import('./askSources.js')
                engine.current = mod.createPublicAsk()
            }
            setState({ phase: 'done', results: engine.current.ask(text, 3), asked: text })
        } catch {
            setState({ phase: 'error', results: [], asked: text })
        }
    }

    const submit = (e) => { e.preventDefault(); run(question) }

    return (
        <section className="askdi" aria-labelledby={`${inputId}-h`} data-testid="ask-di">
            <h2 className="askdi-title" id={`${inputId}-h`}>Ask di</h2>
            <p className="askdi-note">Type a question. The answer comes from di.iiii&rsquo;s own pages, on your device; nothing you type is sent anywhere.</p>
            <form className="askdi-form" onSubmit={submit} role="search">
                <label className="askdi-label" htmlFor={inputId}>Your question</label>
                <input
                    id={inputId}
                    className="askdi-input"
                    type="search"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="How do I join a space?"
                    autoComplete="off"
                />
                <button className="askdi-go" type="submit">Ask</button>
            </form>
            <div className="askdi-examples">
                {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" className="askdi-example" onClick={() => { setQuestion(ex); run(ex) }}>{ex}</button>
                ))}
            </div>
            <div className="askdi-answer" role="status" aria-live="polite">
                {state.phase === 'working' && <p className="askdi-empty">Looking…</p>}
                {state.phase === 'error' && <p className="askdi-empty">Ask di could not load. The Wiki below has the same pages.</p>}
                {state.phase === 'done' && state.results.length === 0 && (
                    <p className="askdi-empty">Nothing in our pages answers &ldquo;{state.asked}&rdquo;. Try other words, or write to info@thedi.studio.</p>
                )}
                {state.phase === 'done' && state.results.length > 0 && (
                    <ol className="askdi-results">
                        {state.results.map((r) => (
                            <li key={r.id} className="askdi-result">
                                <a className="askdi-link" href={r.url}>{r.title}</a>
                                <p className="askdi-snippet">{r.snippet}</p>
                                <p className="askdi-source">{r.category} · {r.url}</p>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    )
}

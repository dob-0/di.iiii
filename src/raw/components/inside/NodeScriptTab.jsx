import { useEffect, useState } from 'react'

// The Script tab for every node that is not a picture operator.
//
// A slot, not an engine: the per-node script runner lives in its own module
// (workstream 7, src/project/graph/nodeScripts.js) and is connected by the
// editor through these props. Until it is, the tab says so plainly instead of
// offering a box nothing runs — the exact dishonesty the retired
// "Code — stored, not run" section was removed for.
//
//   useStatus(nodeId) → { error, stopped, blocked, lastRunMs } | null   (a hook)
//   onApply(text)     → Promise<{ ok, error }>   checks the script; on ok this
//                        tab saves it through onPatchValues({ __script })
//   example           the starting script shown by "Example"
//   blockedMessage    what to say when this machine does not run desk scripts

const useNoStatus = () => null

export default function NodeScriptTab({
    node,
    onPatchValues,
    useStatus = useNoStatus,
    onApply = null,
    example = '',
    blockedMessage = ''
}) {
    const status = useStatus(node?.id)
    const saved = typeof node?.values?.__script === 'string' ? node.values.__script : ''
    const [draft, setDraft] = useState(saved)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { setDraft(saved) }, [saved])

    if (!onApply) {
        return (
            <p className="raw-inside-dim">
                A script for this node is not available in this build. What it gives is worked out by the built-in code in the other tabs.
            </p>
        )
    }

    const apply = async () => {
        setBusy(true)
        try {
            const result = await onApply(draft)
            if (result?.ok) {
                setError(null)
                onPatchValues?.({ __script: draft })
            } else {
                setError(result?.error || 'The script was not accepted.')
            }
        } catch (caught) {
            setError(String(caught?.message || caught))
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="raw-inside-section">
            <h3>Script <span>{saved ? (status?.stopped ? 'stopped' : 'running') : 'none'}</span></h3>
            <p className="raw-inside-dim">
                {status?.blocked && blockedMessage
                    ? blockedMessage
                    : 'Define compute({ inputs, time, values, memory }) and return the outputs it should give. If it fails, the node gives its built-in answer.'}
            </p>
            <textarea
                className="raw-inside-code"
                aria-label={`Script for ${node?.label || 'this node'}`}
                rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
                spellCheck={false}
                placeholder={example}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); apply() } }}
            />
            {error ? <p className="raw-inside-error" role="alert">{error}</p> : null}
            {!error && status?.error ? <p className="raw-inside-error">While running: {status.error}</p> : null}
            {Number.isFinite(status?.lastRunMs) ? <p className="raw-inside-dim">Last run took {status.lastRunMs.toFixed(1)} ms.</p> : null}
            <div className="raw-inside-actions">
                <button type="button" className="raw-inside-button is-primary" onClick={apply} disabled={busy || draft === saved}>Apply (Ctrl+Enter)</button>
                {example ? <button type="button" className="raw-inside-button" onClick={() => setDraft(example)}>Example</button> : null}
                <button type="button" className="raw-inside-button" onClick={() => { setError(null); onPatchValues?.({ __script: '' }) }} disabled={!saved}>Remove</button>
            </div>
        </section>
    )
}

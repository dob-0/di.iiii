import { useEffect } from 'react'
import { describeCanvas, helpKeyRows, helpLines } from '../utils/rawGuide.js'

// Help: one sheet, no tabs (audit 2026-10-05 §3.9). The first line is about
// THIS canvas, counted from the open project, so nothing here can contradict
// what is on screen. The lines and keys come from rawGuide.js / the keymap.
export default function RawHelpDialog({
    open,
    onClose,
    nodeCount = 0,
    wireCount = 0,
    thingCount = 0,
    // In the right region (audit 2026-10-05 §3.5, #777): no backdrop, no
    // scrim, a panel in the layout that replaces whatever stood there.
    inline = false
}) {
    useEffect(() => {
        if (!open) return undefined
        // Capture phase + preventDefault: closing help is the WHOLE meaning of
        // this Escape — the editor's ladder sees it handled and does not also
        // leave a level (it did, inventory 2026-10-02 §1f.1).
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            onClose?.()
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className={inline ? 'raw-help-inline' : 'raw-help-backdrop'}>
            {inline ? null : (
                <button
                    type="button"
                    className="raw-help-scrim"
                    aria-label="Close help"
                    onClick={onClose}
                />
            )}
            <section
                className="raw-help-dialog"
                role={inline ? 'region' : 'dialog'}
                aria-modal={inline ? undefined : 'true'}
                aria-label="Help"
            >
                <header className="raw-help-header">
                    <div>
                        <span className="raw-window-kicker">Help</span>
                        <h3>{describeCanvas({ nodeCount, wireCount, thingCount })}</h3>
                    </div>
                    <button type="button" className="raw-cell" onClick={onClose}>Close</button>
                </header>
                <ul className="raw-help-lines">
                    {helpLines().map((line) => (
                        <li key={line.id} className="raw-help-line">
                            <b>{line.label}</b>
                            <span>{line.text}</span>
                            {line.key ? <kbd>{line.key}</kbd> : <span />}
                        </li>
                    ))}
                </ul>
                <details className="raw-help-keys">
                    <summary>Every key and mouse action</summary>
                    <dl>
                        {helpKeyRows().map(([does, how]) => (
                            <div key={does} style={{ display: 'contents' }}>
                                <dt>{does}</dt>
                                <dd>{how}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
            </section>
        </div>
    )
}

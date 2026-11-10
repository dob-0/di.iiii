import { useEffect, useState } from 'react'
import {
    canPlaceOnScreen, currentScreen, featuresForScreen, loadScreens, matchScreenOps,
    matchTarget, resolveScreen, screenChoices, screenToDoc, useOutputWindow, withOutputWindow
} from './outputWindows.js'
import './outputControl.css'

// THE OUTPUT BUTTON: one toggle (open / close, and it says which), and beside it the
// settings of that window. Stored in the project document (mapping.output), so every
// desk and the stage box read the same answer; nothing here is browser storage.
export default function OutputControl({ ctx, className = '' }) {
    const { spaceId, projectId, mapApi } = ctx
    const mapping = ctx.document?.mappingState
    const output = mapping?.output || { width: 1920, height: 1080 }
    const win = output.window || {}
    const out = useOutputWindow(spaceId, projectId)
    const [panel, setPanel] = useState(false)
    const [screens, setScreens] = useState(() => [currentScreen()])
    const [reason, setReason] = useState(() => (canPlaceOnScreen() ? '' : 'This browser cannot place a window on a screen. The output opens where the browser puts it; drag it to the projector once.'))

    // Chromium: when the person already allowed window management, list the screens
    // without asking again. A first-time ask only ever happens on the button.
    useEffect(() => {
        if (!canPlaceOnScreen() || !navigator.permissions?.query) return
        let alive = true
        navigator.permissions.query({ name: 'window-management' }).then((status) => {
            if (status.state === 'granted') loadScreens().then((got) => { if (alive) { setScreens(got.screens); setReason(got.reason) } })
        }, () => {})
        return () => { alive = false }
    }, [])

    const chosen = resolveScreen(screens, win.screen)
    const choices = screenChoices(screens, win.screen)
    const matchSize = matchTarget(screens, win.screen)
    const setWindow = (patch) => mapApi.setOutput({ output: withOutputWindow(output, patch) })
    const listScreens = async () => {
        const got = await loadScreens()
        setScreens(got.screens)
        setReason(got.reason)
    }
    const toggle = () => {
        if (out.isOpen) out.close()
        else out.open({ features: featuresForScreen(chosen?.saved ? null : chosen) })
    }
    const match = () => {
        if (!matchSize) return
        mapApi.applyOps(matchScreenOps(mapping, matchSize))
    }
    const note = out.blocked
        ? (out.via === 'ping' ? 'The output page did not close. Close it by hand.' : 'The browser blocked the window. Allow pop-ups for this site, then press again.')
        : ''

    return (
        <div className={`output-control ${className}`.trim()}>
            <div className="output-control-row">
                <button type="button" className={`perform-action output-toggle${out.isOpen ? ' is-on' : ''}`}
                    aria-pressed={out.isOpen} onClick={toggle}
                    title={out.isOpen ? 'Close the output window' : 'Open the output window'}>
                    {out.isOpen ? 'CLOSE OUTPUT' : 'OPEN OUTPUT'}
                </button>
                <span className="output-state" role="status">{out.isOpen ? 'OPEN' : 'CLOSED'}</span>
                <button type="button" className="perform-action output-settings-toggle" aria-expanded={panel}
                    onClick={() => setPanel((v) => !v)} title="Where the output opens, full screen, picture size">Settings</button>
            </div>
            {note ? <p className="output-note" role="alert">{note}</p> : null}
            {panel ? (
                <div className="output-panel">
                    <label className="output-field">
                        <span>Screen</span>
                        <select value={chosen ? String(chosen.index) : ''} disabled={!canPlaceOnScreen()}
                            onChange={(event) => {
                                const picked = screens.find((s) => String(s.index) === event.target.value)
                                setWindow({ screen: screenToDoc(picked) })
                            }}>
                            <option value="">Where the browser puts it</option>
                            {choices.map((s) => <option key={s.index} value={s.index}>{s.width > 0 ? `${s.label} ${s.width}x${s.height}` : s.label}</option>)}
                        </select>
                    </label>
                    {canPlaceOnScreen() ? <button type="button" className="perform-action" onClick={listScreens}>List screens</button> : null}
                    {reason ? <p className="output-note">{reason}</p> : null}
                    <label className="output-field output-check">
                        <input type="checkbox" checked={win.fullscreen === true} onChange={(event) => setWindow({ fullscreen: event.target.checked })} />
                        <span>Full screen on open</span>
                    </label>
                    {win.fullscreen ? <p className="output-note">A browser allows full screen only after a click or key press in the output window: click it once. Nothing is drawn on the projector for that.</p> : null}
                    <div className="output-field">
                        <span>Size</span>
                        <input type="number" min="1" aria-label="Output width" value={output.width}
                            onChange={(event) => mapApi.setOutput({ output: { ...output, width: Number(event.target.value) || 1 } })} />
                        <span aria-hidden="true">x</span>
                        <input type="number" min="1" aria-label="Output height" value={output.height}
                            onChange={(event) => mapApi.setOutput({ output: { ...output, height: Number(event.target.value) || 1 } })} />
                    </div>
                    <button type="button" className="perform-action" onClick={match}
                        title="Sets the output and every surface to the screen's size">
                        {`Match the screen${matchSize ? ` (${matchSize[0]}x${matchSize[1]})` : ''}`}
                    </button>
                </div>
            ) : null}
        </div>
    )
}

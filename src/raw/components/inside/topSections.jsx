import { useEffect, useMemo, useState } from 'react'
import { TOP_OPERATORS } from '../../../project/tops/topOperators.js'
import { SHADER_PREAMBLE, checkShader, shaderSourceFor } from '../../../project/tops/topEngine.js'
import { SCRIPT_EXAMPLE, compileTopScript } from '../../../project/tops/topScripts.js'

// Inside a picture operator: the parts only a picture operator has — the real
// camera as its machine reports it, the shader it is compiled from, and the
// JavaScript that may drive it. Moved whole from the retired TopInsidePanel
// (2026-09-14) into the one inside every node shares: the camera sits in IN
// under the operator's settings, shader and script are MADE OF tabs. What is
// changed here lives in the node — `__constraints`, `__shader`, `__script` in
// its values — so it travels with the desk and runs where the operator runs.

// --- the camera, as its machine sees it ------------------------------------

const RESOLUTIONS = [[320, 240], [640, 480], [800, 600], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]]
const RANGE_LABELS = {
    frameRate: 'Frame rate', exposureTime: 'Exposure time', exposureCompensation: 'Exposure compensation',
    colorTemperature: 'Colour temperature', focusDistance: 'Focus distance', brightness: 'Brightness',
    contrast: 'Contrast', saturation: 'Saturation', sharpness: 'Sharpness', zoom: 'Zoom', pan: 'Pan', tilt: 'Tilt', iso: 'ISO'
}
const MODE_LABELS = { exposureMode: 'Exposure', focusMode: 'Focus', whiteBalanceMode: 'White balance', resizeMode: 'Resize' }

const isRange = (value) => value && typeof value === 'object' && Number.isFinite(value.min) && Number.isFinite(value.max) && value.max > value.min

export function CameraSection({ node, report, onPatchValues }) {
    const camera = report.camera || null
    const constraints = useMemo(() => (node.values?.__constraints && typeof node.values.__constraints === 'object' ? node.values.__constraints : {}), [node.values?.__constraints])
    const setConstraint = (patch) => {
        const next = { ...constraints, ...patch }
        for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === '') delete next[key]
        onPatchValues({ __constraints: Object.keys(next).length ? next : null })
    }

    if (!camera) {
        return (
            <section className="raw-inside-section">
                <h3>Camera</h3>
                <p className="raw-inside-dim">Waiting for the machine this camera runs on to open it…</p>
            </section>
        )
    }

    const caps = camera.capabilities || {}
    const settings = camera.settings || {}
    const resolutions = isRange(caps.width) && isRange(caps.height)
        ? RESOLUTIONS.filter(([w, h]) => w >= caps.width.min && w <= caps.width.max && h >= caps.height.min && h <= caps.height.max)
        : []
    const ranges = Object.keys(RANGE_LABELS).filter((key) => isRange(caps[key]))
    const modes = Object.keys(MODE_LABELS).filter((key) => Array.isArray(caps[key]) && caps[key].length > 1)

    return (
        <section className="raw-inside-section">
            <h3>Camera <span>{camera.label || 'camera'}</span></h3>
            <p className="raw-inside-dim">
                Now: {settings.width || '?'}×{settings.height || '?'}{settings.frameRate ? ` at ${Math.round(settings.frameRate)} fps` : ''}
                {camera.error ? <span className="raw-inside-error"> — the camera refused: {camera.error}</span> : null}
            </p>

            {resolutions.length ? (
                <label className="raw-inside-field">
                    <span>Resolution</span>
                    <select
                        value={constraints.width ? `${constraints.width.ideal ?? constraints.width}x${constraints.height?.ideal ?? constraints.height}` : ''}
                        onChange={(event) => {
                            const [w, h] = event.target.value.split('x').map(Number)
                            setConstraint(event.target.value ? { width: { ideal: w }, height: { ideal: h } } : { width: undefined, height: undefined })
                        }}
                    >
                        <option value="">What the camera chooses</option>
                        {resolutions.map(([w, h]) => <option key={`${w}x${h}`} value={`${w}x${h}`}>{w}×{h}</option>)}
                    </select>
                </label>
            ) : null}

            {modes.map((key) => (
                <label key={key} className="raw-inside-field">
                    <span>{MODE_LABELS[key]}</span>
                    <select value={constraints[key] ?? ''} onChange={(event) => setConstraint({ [key]: event.target.value || undefined })}>
                        <option value="">As the camera sets it ({settings[key] || '—'})</option>
                        {caps[key].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                </label>
            ))}

            {ranges.map((key) => {
                const range = caps[key]
                const value = Number(constraints[key]?.ideal ?? constraints[key] ?? settings[key] ?? range.min)
                return (
                    <label key={key} className="raw-inside-field raw-inside-range">
                        <span>{RANGE_LABELS[key]}</span>
                        <input
                            type="range"
                            min={range.min}
                            max={range.max}
                            step={range.step || (range.max - range.min) / 100}
                            value={value}
                            onChange={(event) => setConstraint({ [key]: Number(event.target.value) })}
                        />
                        <output>{Number.isInteger(value) ? value : value.toFixed(2)}</output>
                    </label>
                )
            })}

            {!ranges.length && !modes.length ? (
                <p className="raw-inside-dim">This camera offers no exposure, focus or colour controls to a browser — only size and frame rate.</p>
            ) : null}

            <details className="raw-inside-advanced">
                <summary>Constraints (JSON) — anything the device supports</summary>
                <JsonEditor
                    value={constraints}
                    onApply={(next) => onPatchValues({ __constraints: next && Object.keys(next).length ? next : null })}
                />
                <p className="raw-inside-dim">What this camera says it can do:</p>
                <pre className="raw-inside-code is-readonly">{JSON.stringify(caps, null, 2)}</pre>
            </details>

            <button type="button" className="raw-inside-button" onClick={() => onPatchValues({ __constraints: null })}>Reset the camera</button>
        </section>
    )
}

function JsonEditor({ value, onApply }) {
    const [draft, setDraft] = useState(() => JSON.stringify(value || {}, null, 2))
    const [error, setError] = useState('')
    useEffect(() => { setDraft(JSON.stringify(value || {}, null, 2)) }, [value])
    return (
        <>
            <textarea className="raw-inside-code" rows={6} spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} />
            {error ? <p className="raw-inside-error">{error}</p> : null}
            <button
                type="button"
                className="raw-inside-button"
                onClick={() => {
                    try {
                        const parsed = JSON.parse(draft || '{}')
                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('constraints are one { … } object')
                        setError('')
                        onApply(parsed)
                    } catch (caught) {
                        setError(String(caught?.message || caught))
                    }
                }}
            >
                Apply constraints
            </button>
        </>
    )
}

// --- the shader ---------------------------------------------------------------

export function ShaderSection({ node, operator, report, onPatchValues }) {
    const saved = shaderSourceFor(node.typeId, node.values)
    const custom = typeof node.values?.__shader === 'string' && node.values.__shader.trim()
    const [draft, setDraft] = useState(saved)
    const [localError, setLocalError] = useState(null)
    useEffect(() => { setDraft(saved) }, [saved])

    const apply = () => {
        const error = checkShader(draft)
        setLocalError(error)
        if (error) return
        onPatchValues({ __shader: draft.trim() === operator.fragment.trim() ? '' : draft })
    }
    const names = ['uv', ...operator.inputs, 'self', 'texel', ...operator.params.map((p) => `p_${p.name}`), ...(operator.history ? ['history', 'shift'] : []), ...(operator.source ? ['source'] : [])]

    return (
        <section className="raw-inside-section">
            <h3>Shader <span>{custom ? 'your code' : 'the original'}</span></h3>
            <p className="raw-inside-dim">GLSL, compiled on the machine this operator runs on. You can read: {names.join(' · ')}</p>
            <textarea
                className="raw-inside-code"
                rows={Math.min(24, Math.max(8, draft.split('\n').length + 1))}
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); apply() } }}
            />
            {localError ? <p className="raw-inside-error">Does not compile here: {localError}</p> : null}
            {!localError && report.shader ? <p className="raw-inside-error">Does not compile on its machine — still showing the last good picture: {report.shader}</p> : null}
            <div className="raw-inside-row">
                <button type="button" className="raw-inside-button is-primary" onClick={apply} disabled={draft === saved}>Apply (Ctrl+Enter)</button>
                <button type="button" className="raw-inside-button" onClick={() => { setLocalError(null); onPatchValues({ __shader: '' }) }} disabled={!custom}>Back to the original</button>
            </div>
            <details className="raw-inside-advanced">
                <summary>Compiled with, above your code</summary>
                <pre className="raw-inside-code is-readonly">{SHADER_PREAMBLE}</pre>
            </details>
        </section>
    )
}

// --- the script ---------------------------------------------------------------

export function TopScriptSection({ node, report, where, scriptsAllowed, onPatchValues }) {
    const saved = typeof node.values?.__script === 'string' ? node.values.__script : ''
    const [draft, setDraft] = useState(saved)
    const [localError, setLocalError] = useState(null)
    useEffect(() => { setDraft(saved) }, [saved])
    const example = TOP_OPERATORS[node.typeId]?.source === 'camera' ? SCRIPT_EXAMPLE.camera : SCRIPT_EXAMPLE.any

    const apply = () => {
        const compiled = compileTopScript(draft)
        setLocalError(compiled.error || null)
        if (compiled.error) return
        onPatchValues({ __script: draft })
    }

    return (
        <section className="raw-inside-section">
            <h3>Script <span>{saved ? 'running' : 'none'}</span></h3>
            <p className="raw-inside-dim">
                JavaScript that runs on <strong>{where}</strong>.
                {' '}
                {scriptsAllowed === false
                    ? 'That machine does not run desk scripts — its owner turns them on with DI_DESK_SCRIPTS=1 in its di.env.'
                    : 'Define frame({ time, params, numbers }) to drive settings every frame, or open({ constraints, mediaDevices }) on a Camera In.'}
            </p>
            <textarea
                className="raw-inside-code"
                rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
                spellCheck={false}
                placeholder={example}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); apply() } }}
            />
            {localError ? <p className="raw-inside-error">{localError}</p> : null}
            {!localError && report.script ? <p className="raw-inside-error">On its machine: {report.script}</p> : null}
            <div className="raw-inside-row">
                <button type="button" className="raw-inside-button is-primary" onClick={apply} disabled={draft === saved}>Apply (Ctrl+Enter)</button>
                <button type="button" className="raw-inside-button" onClick={() => setDraft(example)}>Example</button>
                <button type="button" className="raw-inside-button" onClick={() => { setLocalError(null); onPatchValues({ __script: '' }) }} disabled={!saved}>Remove</button>
            </div>
        </section>
    )
}

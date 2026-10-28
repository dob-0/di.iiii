import { useEffect, useId, useState } from 'react'
import {
    HEX, MOTION_MODES, MOTION_SPATIAL, HEAD_PATTERNS, HEAD_SPATIAL, FLASH,
    modeAllowed, bpmRange, clampBpm, flashLine, headsWarning, partRows, changeSceneOps, cueOps, withSource, SHOW_ID_OF
} from '../utils/sceneEdit.js'

// ONE SCENE, EDITABLE (owner 2026-10-15: "fully editable in the di.iiii Studio"). A scene is a rig look and its cue. Every field
// writes through the Studio's own op path (`onApplyOps` = applyLocalOps: saved, followed, one undo each); the look is rebuilt by
// src/shared/buildLook.js, the function the build script uses, so the room and the desk pick it up as they do for a scripted scene.
// Rectangles, 2 px (no round UI). The flash rule is enforced here (sceneEdit.js FLASH), not only warned.

// A text field that keeps what you type until it is a whole value, then writes it.
// `id` when a visible <label htmlFor> names it (that text is then its name); `label` only when nothing visible does.
function Field({ value, onCommit, valid = () => true, label, id, width, testId, type = 'text' }) {
    const [draft, setDraft] = useState(String(value ?? ''))
    useEffect(() => { setDraft(String(value ?? '')) }, [value])
    return (
        <input
            className="scene-editor__input"
            type={type}
            id={id}
            aria-label={label}
            data-testid={testId}
            style={width ? { width } : undefined}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (valid(e.target.value)) onCommit(e.target.value) }}
            onBlur={() => setDraft(String(value ?? ''))}
        />
    )
}

const Select = ({ value, options, onChange, label, disabled = () => false, testId }) => (
    <select className="scene-editor__input" aria-label={label} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o} disabled={disabled(o)}>{o}{disabled(o) ? ' (not allowed)' : ''}</option>)}
    </select>
)

const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)))

export default function SceneEditor({ document, scene, onApplyOps, onPlay, onClose }) {
    const [playState, setPlayState] = useState('')
    const uid = useId()
    const show = SHOW_ID_OF(document)
    const look = show?.components?.rigLooks?.looks.find((l) => l.id === scene.lookId)
    const cue = (document?.mappingState?.cues || []).find((c) => c.id === scene.cueId)
    if (!look || !cue) return null
    const sourced = withSource(document, look)
    const rows = partRows(document, sourced)
    const change = (patch) => onApplyOps(changeSceneOps(document, look.id, patch))
    const setPart = (part, hex, level) => {
        const parts = { ...sourced.parts }
        if (hex === '' && level == null) delete parts[part]
        else parts[part] = [hex || null, level == null ? 1 : level]
        change({ parts })
    }
    const motion = look.motion || null
    const setMotion = (patch) => {
        const next = { mode: 'pulse', bpm: 60, depth: 255, spatial: 'patch', kinds: [], still: 0, ...(motion || {}), ...patch }
        if (!modeAllowed(next.mode)) return
        change({ motion: { ...next, bpm: clampBpm(next.mode, next.bpm) } })
    }
    const heads = look.heads || null
    const setHeads = (patch) => change({ heads: { pattern: 'nod', period_s: 8, pan_deg: 30, tilt_deg: 20, spatial: 'all', kinds: [], ...(heads || {}), ...patch } })
    const warning = headsWarning(heads)
    const [bpmLo, bpmHi] = bpmRange(motion?.mode)

    return (
        <div className="scene-editor" role="group" aria-label={`Edit scene ${look.title}`} data-testid="scene-editor">
            <div className="scene-editor__row">
                <label htmlFor={`${uid}-title`}>Title <Field id={`${uid}-title`} testId="scene-title" value={look.title} onCommit={(v) => change({ title: v.slice(0, 60) })} valid={(v) => v.trim().length > 0} width={170} /></label>
                <label htmlFor={`${uid}-act`}>Act <Field id={`${uid}-act`} type="number" value={look.act ?? ''} onCommit={(v) => change({ act: num(v, 0, 99) })} valid={(v) => v !== '' && Number.isFinite(Number(v))} width={48} /></label>
                <button type="button" className="scc-btn scene-editor__play" data-testid="scene-play" title="The desk's GO on this scene" onClick={async () => { setPlayState('…'); try { await onPlay?.(cue); setPlayState('playing on the desk') } catch (e) { setPlayState(`not played: ${e.message}`) } }}>Play</button>
                <button type="button" className="scc-btn" aria-label="Close the editor" onClick={onClose}>Close</button>
            </div>
            {playState && <div className="scene-editor__line" data-testid="play-state">{playState}</div>}
            <label className="scene-editor__row" htmlFor={`${uid}-intent`}>Intent <Field id={`${uid}-intent`} value={look.intent} onCommit={(v) => change({ intent: v.slice(0, 480) })} width={300} /></label>

            <div className="scene-editor__title">Parts{show?.components?.rigParts ? '' : ' (each lamp its own: this project keeps no parts)'}</div>
            <div className="scene-editor__parts" data-testid="scene-parts">
                {rows.map((r) => (
                    <div className="scene-editor__row" key={r.part} data-testid={`part-${r.part}`}>
                        <span className="scene-editor__name" title={`${r.units} lamp${r.units === 1 ? '' : 's'}`}>{r.part}</span>
                        <span className="scene-editor__swatch" style={{ background: HEX.test(r.hex) ? r.hex : 'transparent' }} aria-hidden="true" />
                        <Field label={`${r.part} colour`} value={r.hex} width={78} valid={(v) => HEX.test(v.trim())} onCommit={(v) => setPart(r.part, v.trim().toLowerCase(), r.level == null ? 1 : r.level)} />
                        <input type="range" min="0" max="1" step="0.05" aria-label={`${r.part} level`} value={r.level ?? 0} onChange={(e) => setPart(r.part, r.hex, Number(e.target.value))} />
                        <Field label={`${r.part} level number`} type="number" value={r.level ?? ''} width={52} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setPart(r.part, r.hex, num(v, 0, 1))} />
                        <button type="button" className="scc-btn" aria-label={`${r.part} off`} title="Off: the part is left out of the scene" onClick={() => setPart(r.part, '', null)}>off</button>
                    </div>
                ))}
            </div>

            <div className="scene-editor__title">Motion</div>
            <div className="scene-editor__row">
                <Select label="Motion mode" testId="motion-mode" value={motion?.mode || 'none'} options={['none', ...MOTION_MODES]} disabled={(m) => !modeAllowed(m)} onChange={(m) => (m === 'none' ? change({ motion: null }) : setMotion({ mode: m }))} />
                {motion && <>
                    <label htmlFor={`${uid}-bpm`}>bpm <Field id={`${uid}-bpm`} type="number" value={motion.bpm} width={56} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setMotion({ bpm: Number(v) })} /></label>
                    <label htmlFor={`${uid}-depth`}>depth <Field id={`${uid}-depth`} type="number" value={motion.depth} width={56} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setMotion({ depth: num(v, 0, 255) })} /></label>
                    <Select label="Motion spatial" value={motion.spatial} options={MOTION_SPATIAL} onChange={(v) => setMotion({ spatial: v })} />
                    <label htmlFor={`${uid}-still`}>still <Field id={`${uid}-still`} type="number" value={motion.still} width={52} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setMotion({ still: num(v, 0, 1) })} /></label>
                    <label htmlFor={`${uid}-kinds`}>kinds <Field id={`${uid}-kinds`} value={(motion.kinds || []).join(' ')} width={110} onCommit={(v) => setMotion({ kinds: v.split(/[\s,]+/).filter(Boolean).slice(0, 8) })} /></label>
                </>}
            </div>
            <div className="scene-editor__line" data-testid="flash-line">{flashLine(motion)}{motion ? ` · bpm ${bpmLo}–${bpmHi} · glitch ${FLASH.glitch}` : ''}</div>

            <div className="scene-editor__title">Heads</div>
            <div className="scene-editor__row">
                <Select label="Heads pattern" testId="heads-pattern" value={heads?.pattern || 'none'} options={['none', ...HEAD_PATTERNS]} onChange={(p) => (p === 'none' ? change({ heads: null }) : setHeads({ pattern: p }))} />
                {heads && <>
                    <label htmlFor={`${uid}-period`}>period s <Field id={`${uid}-period`} type="number" value={heads.period_s} width={56} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setHeads({ period_s: num(v, 0.5, 600) })} /></label>
                    <label htmlFor={`${uid}-pan`}>pan° <Field id={`${uid}-pan`} type="number" value={heads.pan_deg} width={52} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setHeads({ pan_deg: num(v, 0, 270) })} /></label>
                    <label htmlFor={`${uid}-tilt`}>tilt° <Field id={`${uid}-tilt`} type="number" value={heads.tilt_deg} width={52} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => setHeads({ tilt_deg: num(v, 0, 135) })} /></label>
                    <Select label="Heads spatial" value={heads.spatial} options={HEAD_SPATIAL} onChange={(v) => setHeads({ spatial: v })} />
                </>}
            </div>
            {warning && <div className="scene-editor__warn" role="alert" data-testid="heads-warning">{warning}</div>}

            <div className="scene-editor__title">Cue</div>
            <div className="scene-editor__row">
                <label htmlFor={`${uid}-cue-fade`}>fade s <Field id={`${uid}-cue-fade`} type="number" value={cue.fade ?? 0} width={56} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => onApplyOps(cueOps(cue.id, { fade: num(v, 0, 3600) }))} /></label>
                <label htmlFor={`${uid}-cue-hold`}>hold s <Field id={`${uid}-cue-hold`} type="number" value={cue.hold ?? 0} width={56} valid={(v) => v !== '' && Number.isFinite(Number(v))} onCommit={(v) => onApplyOps(cueOps(cue.id, { hold: num(v, 0, 3600) }))} /></label>
            </div>
        </div>
    )
}

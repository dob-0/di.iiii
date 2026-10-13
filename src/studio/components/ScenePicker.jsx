import { useState } from 'react'
import { scenesOf } from '../utils/scenesOf.js'

// SCENES in the Studio, open by default (owner 2026-10-13 15:5x: "by default make that I can select in
// edit mode — I can't select a light show and understand how the light will be"). Until now the Studio
// followed the show clock and offered no choice. A click shows that scene's light in the viewport while
// you edit (StudioViewport `rigLook` → useRigLookEntities explicit); "Follow the show" goes back to the
// clock, "Work light" draws no look. Each row: the scene's name and, under it, one line that says what
// it is from the floor (the rig look's intent). Rectangles, 0–2 px; targets ≥ 32 px.
const box = {
    position: 'absolute', left: 12, bottom: 14, zIndex: 10, pointerEvents: 'auto',
    display: 'flex', flexDirection: 'column', gap: 2, width: 300, maxHeight: '58vh',
    background: 'rgba(15,23,34,0.86)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2,
    backdropFilter: 'blur(8px)', color: '#c8d8e8', fontFamily: 'inherit', fontSize: 12,
}
const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 4px', letterSpacing: '0.08em', fontSize: 11, fontWeight: 700, color: '#8fb3cc' }
const small = { font: 'inherit', fontSize: 11, color: '#c8d8e8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 0, padding: '4px 8px', cursor: 'pointer', minHeight: 28 }
const row = (active) => ({
    font: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 32, padding: '5px 8px', borderRadius: 0,
    background: active ? 'rgba(79,214,255,0.14)' : 'transparent', color: active ? '#e9f6ff' : '#c8d8e8',
    border: '1px solid transparent', borderLeft: active ? '2px solid #4fd6ff' : '2px solid transparent',
})
const intentStyle = { display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.78, lineHeight: 1.25, marginTop: 1 }

export default function ScenePicker({ document, current, onPick }) {
    const [open, setOpen] = useState(true)
    const scenes = scenesOf(document)
    if (!scenes.length) return null
    const following = current === undefined
    const workLight = current === ''
    return (
        <div role="region" aria-label="Scenes" data-testid="studio-scene-picker" style={box}>
            <div style={head}>
                <span>SCENES · {scenes.length}</span>
                <button type="button" style={small} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'fold' : 'open'}</button>
            </div>
            {open && (
                <>
                    <div style={{ display: 'flex', gap: 4, padding: '0 8px 6px' }}>
                        <button type="button" style={{ ...small, fontWeight: following ? 700 : 400, outline: following ? '1px solid #fff' : 'none' }} aria-pressed={following} onClick={() => onPick?.(undefined)}>Follow the show</button>
                        <button type="button" style={{ ...small, fontWeight: workLight ? 700 : 400, outline: workLight ? '1px solid #fff' : 'none' }} aria-pressed={workLight} onClick={() => onPick?.('')}>Work light</button>
                    </div>
                    <div style={{ overflowY: 'auto', padding: '0 4px 6px' }}>
                        {scenes.map((s) => {
                            const active = current === s.lookId
                            return (
                                <button key={s.cueId} type="button" aria-pressed={active} title={s.title} style={{ ...row(active), width: '100%' }} onClick={() => onPick?.(s.lookId)}>
                                    <span style={{ fontWeight: 700 }}>{s.name}</span>
                                    {s.intent && <span style={intentStyle}>{s.intent}</span>}
                                </button>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

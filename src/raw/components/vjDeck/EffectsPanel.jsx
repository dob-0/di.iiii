import { useState } from 'react'
import {
    EFFECT_TYPE_IDS,
    MASTER_STACK,
    addEffect,
    MAX_EFFECTS,
    effectLabel,
    effectMainParams,
    effectNumericParams,
    moveEffect,
    removeEffect,
    setEffectMix,
    setEffectOn,
    setEffectParam,
    stackOf
} from '../../../project/tops/vjDeck.js'

// The EFFECTS panel of the VJ deck: the effect stack of one layer, or of the
// master. An effect is one of the picture operators the engine already has
// (tops/vjDeck.js EFFECT_TYPES); this panel only edits node.values.deck.
// Sliders carry data-midi-target so MIDI Learn can bind any of them:
//   fxmix:<layer|m>:<effect>   fxp:<layer|m>:<effect>:<numeric param>

const percent = (value) => `${Math.round(value * 100)}`
const shown = (value, step) => (step >= 1 ? String(Math.round(value)) : Number(value).toFixed(step >= 0.1 ? 1 : 2))

export default function EffectsPanel({ deck, scope, layerIndex, onScope, onLayer, editable, write }) {
    const isMaster = scope === MASTER_STACK
    const where = isMaster ? MASTER_STACK : layerIndex
    const stack = stackOf(deck, where) || []
    const mark = isMaster ? 'm' : String(layerIndex)
    // Which effects show their sliders; a freshly added one opens, the rest stay one line.
    const [open, setOpen] = useState(() => new Set())
    const toggle = (id) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
    const onAdd = (type) => {
        const next = addEffect(deck, where, type)
        const added = stackOf(next, where) || []
        const fresh = added[added.length - 1]
        if (fresh && added.length > stack.length) setOpen((current) => new Set(current).add(fresh.id))
        write(next)
    }
    const stackName = isMaster ? 'Master' : deck.layers[layerIndex]?.name || ''
    return (
        <section className="vj-deck-panel vj-deck-fx" aria-label="Effects">
            <div className="vj-deck-panel-head vj-deck-fx-top">
                <span className="vj-deck-label">Effects</span>
                <div className="vj-deck-fx-scope" role="radiogroup" aria-label="Effects of">
                    <button type="button" role="radio" aria-checked={!isMaster} className={`vj-deck-button vj-deck-fx-button${!isMaster ? ' is-on' : ''}`} onClick={() => onScope('layer')}>Layer</button>
                    <button type="button" role="radio" aria-checked={isMaster} className={`vj-deck-button vj-deck-fx-button${isMaster ? ' is-on' : ''}`} onClick={() => onScope(MASTER_STACK)}>Master</button>
                </div>
                {!isMaster ? (
                    <select className="vj-deck-chip vj-deck-fx-layer" value={String(layerIndex)} aria-label="Effects layer" onChange={(event) => onLayer(Number(event.target.value))}>
                        {deck.layers.map((layer, index) => <option key={layer.id} value={String(index)}>{layer.name}</option>)}
                    </select>
                ) : null}
                <select
                    className="vj-deck-chip vj-deck-fx-add"
                    value=""
                    disabled={!editable || stack.length >= MAX_EFFECTS}
                    aria-label="Add effect"
                    onChange={(event) => { if (event.target.value) onAdd(event.target.value) }}
                >
                    <option value="">{stack.length >= MAX_EFFECTS ? `Full: ${MAX_EFFECTS} of ${MAX_EFFECTS}` : '+ Add effect'}</option>
                    {EFFECT_TYPE_IDS.map((type) => <option key={type} value={type}>{effectLabel(type)}</option>)}
                </select>
            </div>
            {!stack.length ? <p className="vj-deck-hint">No effects on {stackName}. Add one: it runs {isMaster ? 'after the last layer' : 'on this layer'}.</p> : null}
            {stack.map((effect, index) => {
                const numeric = effectNumericParams(effect.type)
                const isOpen = open.has(effect.id)
                return (
                    <div className="vj-deck-fx-effect" key={effect.id} role="group" aria-label={`${effectLabel(effect.type)} effect`} data-on={effect.on ? 'true' : 'false'}>
                        <div className="vj-deck-fx-head">
                            <button type="button" className="vj-deck-button vj-deck-toggle vj-deck-fx-button" aria-pressed={effect.on} aria-label={`${effectLabel(effect.type)} on`} disabled={!editable} onClick={() => write(setEffectOn(deck, where, effect.id, !effect.on))}>On</button>
                            <button type="button" className="vj-deck-fx-name vj-deck-fx-open" aria-expanded={isOpen} aria-label={`${effectLabel(effect.type)} settings`} onClick={() => toggle(effect.id)}>{isOpen ? '▾' : '▸'} {effectLabel(effect.type)}</button>
                            <button type="button" className="vj-deck-button vj-deck-fx-button" aria-label={`Move ${effectLabel(effect.type)} up`} title="Runs earlier" disabled={!editable || index === 0} onClick={() => write(moveEffect(deck, where, effect.id, -1))}>↑</button>
                            <button type="button" className="vj-deck-button vj-deck-fx-button" aria-label={`Move ${effectLabel(effect.type)} down`} title="Runs later" disabled={!editable || index === stack.length - 1} onClick={() => write(moveEffect(deck, where, effect.id, 1))}>↓</button>
                            <button type="button" className="vj-deck-button vj-deck-fx-button" aria-label={`Remove ${effectLabel(effect.type)}`} disabled={!editable} onClick={() => write(removeEffect(deck, where, effect.id))}>×</button>
                        </div>
                        <div className="vj-deck-fx-params" hidden={!isOpen}>
                        <label className="vj-deck-list-row vj-deck-setting">
                            <span className="vj-deck-label">Mix</span>
                            <input type="range" min="0" max="1" step="0.01" value={effect.mix} disabled={!editable} aria-label={`${effectLabel(effect.type)} mix`} data-midi-target={`fxmix:${mark}:${index}`} title="Dry / wet" onChange={(event) => write(setEffectMix(deck, where, effect.id, event.target.value))} />
                            <span className="vj-deck-number">{percent(effect.mix)}</span>
                        </label>
                        {effectMainParams(effect.type).map((p) => (p.colour ? (
                            <label className="vj-deck-list-row vj-deck-setting" key={p.name}>
                                <span className="vj-deck-label">{p.label}</span>
                                <input type="color" className="vj-deck-fx-colour" value={effect.params[p.name]} disabled={!editable} aria-label={`${effectLabel(effect.type)} ${p.label}`} onChange={(event) => write(setEffectParam(deck, where, effect.id, p.name, event.target.value))} />
                                <span className="vj-deck-number" />
                            </label>
                        ) : p.options ? (
                            <label className="vj-deck-list-row vj-deck-setting" key={p.name}>
                                <span className="vj-deck-label">{p.label}</span>
                                <select className="vj-deck-chip" value={String(effect.params[p.name])} disabled={!editable} aria-label={`${effectLabel(effect.type)} ${p.label}`} onChange={(event) => write(setEffectParam(deck, where, effect.id, p.name, event.target.value))}>
                                    {p.options.map((option, optionIndex) => <option key={option} value={String(optionIndex)}>{option}</option>)}
                                </select>
                                <span className="vj-deck-number" />
                            </label>
                        ) : (
                            <label className="vj-deck-list-row vj-deck-setting" key={p.name}>
                                <span className="vj-deck-label">{p.label}</span>
                                <input type="range" min={p.min} max={p.max} step={p.step} value={effect.params[p.name]} disabled={!editable} aria-label={`${effectLabel(effect.type)} ${p.label}`} data-midi-target={`fxp:${mark}:${index}:${numeric.indexOf(p)}`} onChange={(event) => write(setEffectParam(deck, where, effect.id, p.name, event.target.value))} />
                                <span className="vj-deck-number">{shown(effect.params[p.name], p.step)}</span>
                            </label>
                        )))}
                        </div>
                    </div>
                )
            })}
        </section>
    )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../project/hooks/useOpHistory.js'
import { useProjectStore } from '../project/state/projectStore.js'
import { useRigAutoPatch } from '../studio/hooks/useRigAutoPatch.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { equipmentCsv, FLAG_WORDS, FROM_WORDS } from './equipment.js'
import { useEquipment } from './useEquipment.js'
import { InventoryPanel, ReduceDialog, Stepper } from './Inventory.jsx'
import { buildEquipmentPath } from './equipmentRouting.js'
import { plotModel, titleTotals } from './plotModel.js'
import { rigProgress } from './rigProgress.js'
import RigBar from './RigSteps.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'
import { NO_WRITE } from './rigToolAccess.js'
import ViewOnlyLine from './ViewOnlyLine.jsx'
import './plot.css'
import './cards.css'
import './equipment.css'

// THE EQUIPMENT PAGE — /{space}/equipment/{project} (docs/architecture/RIG_BUILD.md §13).
// The show's own list of what it takes: the inventory (every device as a tile, its card,
// take or skip it, how many) and the order (the lines, what they cost by the quote's day
// rule, the power and universes they need, what is owed; CSV and a printable A4 order for
// the rental house). One data set with the plot, the cards and the room: the list is
// `components.rentalList` on the show's entity, written as ops through the history.

const PHONE_QUERY = '(max-width: 760px), (max-height: 500px)'
const useIsPhone = () => {
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches)
    useEffect(() => {
        const mq = window.matchMedia?.(PHONE_QUERY)
        if (!mq) return undefined
        const on = () => setPhone(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [])
    return phone
}

const money = (n, currency = 'AMD') => (n == null ? '—' : `${Math.round(n).toLocaleString('en-GB')} ${currency}`)
const download = (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const FROM_ORDER = [['rental', 'from the rental house — the order'], ['other', 'from other suppliers'], ['own', 'our own']]

export function OrderPart({ eq, title, venue, readOnly, sheetTotals }) {
    const m = eq.model
    const list = m.list
    const currency = list?.currency || 'AMD'
    const [from, setFrom] = useState(list?.dates?.from || '')
    const [to, setTo] = useState(list?.dates?.to || '')
    useEffect(() => { setFrom(list?.dates?.from || ''); setTo(list?.dates?.to || '') }, [list?.dates?.from, list?.dates?.to])
    const lines = m.lines
    const tileOf = (line) => eq.tiles.find((t) => t.key === line.key) || null
    const t = m.totals
    const rows = (group) => lines.filter((l) => (l.unlisted ? group === 'unlisted' : l.from === group))
    return (
        <section className="rigequip-order" aria-label="The order">
            <div className="rigequip-printhead">
                <h1>equipment order · {title}</h1>
                <p>{venue ? `${venue} · ` : ''}rental {list?.dates?.from ? `${list.dates.from} → ${list.dates.to || list.dates.from}` : ''} · {t.days ? `${t.days} day${t.days === 1 ? '' : 's'}, billed as ${t.billed}` : 'rental days not set'} · printed {new Date().toISOString().slice(0, 10)}</p>
                <p>{list?.source}</p>
            </div>
            <div className="rigequip-order__terms rigequip-noprint">
                <label className="rigplot-field"><span>from</span><input type="date" value={from} disabled={readOnly} onChange={(e) => setFrom(e.target.value)} onBlur={() => eq.setDays({ from, to: to || from })} /></label>
                <label className="rigplot-field"><span>to</span><input type="date" value={to} disabled={readOnly} onChange={(e) => setTo(e.target.value)} onBlur={() => eq.setDays({ from: from || to, to })} /></label>
                <span className="rigplot-mono">{t.days ? `${t.days} day${t.days === 1 ? '' : 's'} → billed ${t.billed} (day 1 full, each further day × ${t.extraDay})` : 'set the rental days to cost the order'}</span>
                <span className="rigplot-mono rigplot-status__dim">{list?.rule?.source || ''}</span>
            </div>
            <div className="rigequip-totals">
                <div><b>{t.cost != null ? money(t.cost, currency) : '—'}</b><span>{t.cost != null ? `total, ${t.days} day${t.days === 1 ? '' : 's'}, excl. VAT` : 'total: set the days'}</span></div>
                <div><b>{money(t.perDay, currency)}</b><span>a day at the full rate</span></div>
                <div><b>{t.units}</b><span>{t.fixtures} fixtures · {t.items} item{t.items === 1 ? '' : 's'} · {m.totals.lines} lines</span></div>
                <div><b>{(t.watts / 1000).toFixed(1)} kW</b><span>datasheet max of the list{t.wattsUnknown.length ? ` · ${t.wattsUnknown.length} types unknown` : ''}</span></div>
                <div><b>{t.universes} universe{t.universes === 1 ? '' : 's'}</b><span>{t.channels} channels at known modes{t.modesOwed.length ? ` · ${t.modesOwed.length} types owed` : ''}</span></div>
                {sheetTotals ? <div><b>{sheetTotals.fixtures}</b><span>in the rig now · {sheetTotals.channels}</span></div> : null}
            </div>
            <table className="rigequip-table">
                <thead>
                    <tr><th>code</th><th>item</th><th className="n">qty</th><th className="n">stock</th><th className="n">placed</th><th>mode</th><th className="n">W</th><th className="n">rate/day</th><th className="n">line total</th><th>source · note</th><th className="rigequip-noprint" aria-label="actions" /></tr>
                </thead>
                <tbody>
                    {[...FROM_ORDER, ['unlisted', 'placed in the rig, not on the list']].map(([group, label]) => {
                        const rs = rows(group)
                        if (!rs.length) return null
                        const sub = rs.reduce((s, l) => s + (l.cost || 0), 0)
                        return [
                            <tr key={`g-${group}`} className="is-group"><td colSpan={11}>{label}{t.cost != null && group !== 'unlisted' ? ` · ${money(sub, currency)}` : ''}</td></tr>,
                            ...rs.map((l) => {
                                const tile = tileOf(l)
                                return (
                                    <tr key={l.key}>
                                        <td className="rigplot-mono">{l.code}</td>
                                        <td>{l.label}{l.kind === 'item' ? <span className="rigplot-status__dim"> · item, {l.category}</span> : null}{l.supplier ? <span className="rigplot-status__dim"> · {l.supplier}</span> : null}</td>
                                        <td className="n">{readOnly || !tile ? l.ordered : <><span className="rigequip-printonly">{l.ordered}</span><span className="rigequip-noprint"><Stepper value={l.ordered} onChange={(n) => eq.setQuantity(tile, n)} label={`how many ${l.code}`} /></span></>}</td>
                                        <td className="n">{l.stock ?? ''}{l.flags.includes('over-stock') ? ' !' : ''}</td>
                                        <td className="n">{l.placed ?? ''}{l.over ? ` (${l.over} over)` : ''}</td>
                                        <td className="rigplot-mono">{l.kind === 'item' ? '—' : l.modeOwed ? 'OWED' : `${l.mode === `${l.footprint}ch` ? '' : `${l.mode} · `}${l.footprint} ch${l.channelsOwed ? ' · list owed' : ''}`}</td>
                                        <td className="n">{l.watts ?? '?'}</td>
                                        <td className="n">{l.rate != null ? l.rate.toLocaleString('en-GB') : '?'}</td>
                                        <td className="n">{l.cost != null ? l.cost.toLocaleString('en-GB') : '—'}</td>
                                        <td className="rigequip-src">{l.source}{l.note ? ` · ${l.note}` : ''}{l.flags.filter((f) => FLAG_WORDS[f] && f !== 'channels-owed' && f !== 'mode-owed').map((f) => <b key={f}> · ! {FLAG_WORDS[f]}</b>)}</td>
                                        <td className="rigequip-noprint">{!readOnly && tile?.key ? <button type="button" className="rigcards-btn" onClick={() => eq.skip(tile)} aria-label={`delete ${l.code}`}>delete</button> : null}</td>
                                    </tr>
                                )
                            })
                        ]
                    })}
                </tbody>
                <tfoot>
                    <tr><td colSpan={2}>total</td><td className="n">{t.units}</td><td /><td className="n">{t.placed}</td><td /><td className="n">{(t.watts / 1000).toFixed(1)} kW</td><td className="n">{t.perDay.toLocaleString('en-GB')}</td><td className="n">{t.cost != null ? t.cost.toLocaleString('en-GB') : '—'}</td><td colSpan={2}>{currency}, excl. VAT{t.unpriced.length ? ` · no rate: ${t.unpriced.join(', ')}` : ''}</td></tr>
                </tfoot>
            </table>
            {/* the phone: the same lines as a list with steppers and a delete button */}
            <ul className="rigequip-lines" aria-label="Lines">
                {lines.map((l) => {
                    const tile = tileOf(l)
                    return (
                        <li key={l.key} className="rigequip-line">
                            <div className="rigequip-line__head"><b className="rigplot-mono">{l.code}</b><span className="rigplot-mono">{l.cost != null ? money(l.cost, currency) : l.rate != null ? `${l.rate.toLocaleString('en-GB')}/day` : 'no rate'}</span></div>
                            <div className="rigequip-line__meta">{l.label} · {l.unlisted ? 'not on the list' : FROM_WORDS[l.from]}{l.supplier ? ` (${l.supplier})` : ''}{l.stock != null ? ` · stock ${l.stock}` : ''}{l.placed != null ? ` · ${l.placed} placed` : ''}{l.note ? ` · ${l.note}` : ''}</div>
                            {l.flags.filter((f) => FLAG_WORDS[f] && f !== 'channels-owed').length ? <div className="rigequip-line__meta"><b>! {l.flags.filter((f) => FLAG_WORDS[f] && f !== 'channels-owed').map((f) => FLAG_WORDS[f]).join(' · ')}</b></div> : null}
                            {!readOnly && tile?.key ? (
                                <div className="rigequip-fields"><Stepper value={l.ordered} onChange={(n) => eq.setQuantity(tile, n)} label={`how many ${l.code}`} /><button type="button" className="rigcards-btn" onClick={() => eq.skip(tile)} aria-label={`delete ${l.code}`}>delete</button></div>
                            ) : null}
                        </li>
                    )
                })}
            </ul>
            {m.owed.length ? (
                <div className="rigequip-owed">
                    <h3>what we need from you (owed)</h3>
                    <ul>{m.owed.map((o) => <li key={o}>{o}</li>)}</ul>
                </div>
            ) : null}
            <p className="rigequip-foot">
                {m.terms.map((term) => <span key={term.cell}>{term.text} ({term.cell}) · </span>)}
                Cost by the quote&apos;s own rule: day 1 at the full rate, each further day at {Math.round(t.extraDay * 100)}%. The quote itself is not confirmed by the rental house; this order is what we ask for, not what they agreed. Power is the datasheet maximum, not a distribution plan.
            </p>
        </section>
    )
}

export default function EquipmentSurface({ spaceId, projectId, readOnly = false, library: baseLibrary = TYPE_LIBRARY }) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps: sentOps } = useProjectDocumentSync({ projectId, store, clientIdPrefix: 'equipment-client', opIdPrefix: 'equipment-op' })
    // Read only (a visitor on a public space, rigToolAccess.js): nothing reaches the document.
    const syncOps = readOnly ? NO_WRITE : sentOps
    const { applyLocalOps, undo, redo } = useOpHistory({ projectId, document: state.document, applyLocalOps: syncOps })
    const document_ = state.document
    const entities = useMemo(() => document_.entities || [], [document_.entities])
    const library = useMemo(() => libraryWithShow(baseLibrary, entities), [baseLibrary, entities])
    // Removed lamps leave the desk too: auto-patch prunes a deleted lamp's fixture (§4.2).
    const patch = useRigAutoPatch({ projectId: readOnly ? null : projectId, entities: readOnly ? [] : entities, applyOps: syncOps, library })
    const phone = useIsPhone()
    const apply = useCallback((ops) => applyLocalOps(ops), [applyLocalOps])
    const eq = useEquipment({ entities, library, apply, readOnly })
    const sheetTotals = useMemo(() => titleTotals(plotModel({ entities, library, deskFlags: patch.flags, projectId }).sheet), [entities, library, patch.flags, projectId])
    const localInstall = useLocalInstall()
    const progress = useMemo(() => rigProgress({ entities, library, deskFlags: patch.flags, projectId }), [entities, library, patch.flags, projectId])
    const [pane, setPane] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'order' ? 'order' : 'inventory'))

    useEffect(() => {
        const onKey = (event) => {
            const tag = event.target?.tagName
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
            if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [undo, redo, readOnly])

    const title = document_.projectMeta?.title || projectId
    useEffect(() => {
        const prev = document.title
        document.title = `Equipment — ${title}`
        return () => { document.title = prev }
    }, [title])
    const print = () => {
        setPane('order')
        document.documentElement.classList.add('rigequip-print')
        const done = () => { document.documentElement.classList.remove('rigequip-print'); window.removeEventListener('afterprint', done) }
        window.addEventListener('afterprint', done)
        window.setTimeout(() => window.print(), 50)
    }
    const venue = entities.find((e) => e.components?.venuePlan)?.components.venuePlan.name || ''

    const header = (
        <header className="rigplot-top rigcards-top rigequip-noprint">
            <span className="rigplot-mono rigplot-top__title">{title} · equipment</span>
            <nav className="rigcards-links" aria-label="Views">
                <div className="rigplot-toggle" role="group" aria-label="View">
                    <button type="button" aria-pressed={pane === 'inventory'} onClick={() => setPane('inventory')}>inventory</button>
                    <button type="button" aria-pressed={pane === 'order'} onClick={() => setPane('order')}>order</button>
                </div>
                {pane === 'order' ? <button type="button" onClick={() => download(`${projectId}-equipment.csv`, equipmentCsv(eq.model))}>CSV</button> : null}
                {pane === 'order' ? <button type="button" onClick={print}>print A4</button> : null}
            </nav>
            {readOnly ? <ViewOnlyLine /> : null}
        </header>
    )

    return (
        <>
        <RigBar spaceId={spaceId} projectId={projectId} projectLabel={title} here="equipment" progress={progress} isLocalInstall={localInstall.isLocal} />
        <div className="rigplot rigequip-page has-rigbar">
            {header}
            <main className="rigequip-page__main">
                {!state.hasLoaded ? <p className="rigplot-hint" style={{ padding: 16 }}>Reading the rig…</p> : null}
                {state.hasLoaded && pane === 'inventory' ? (
                    <InventoryPanel eq={eq} library={library} phone={phone} readOnly={readOnly} orderHref={`${buildEquipmentPath(spaceId, projectId)}?view=order`} />
                ) : null}
                {state.hasLoaded && pane === 'order' ? (
                    <>
                        <OrderPart eq={eq} title={title} venue={venue} sheetTotals={sheetTotals} readOnly={readOnly} />
                        {eq.pending && !readOnly ? <ReduceDialog pending={eq.pending} onAnswer={eq.answer} /> : null}
                    </>
                ) : null}
            </main>
            <div className="rigplot-status rigplot-mono rigequip-noprint rigequip-page__status" role="status" aria-live="polite">
                <span>{eq.said || `${eq.model.totals.units} units on the list · ${eq.model.totals.placed} placed`}</span>
                {patch.message ? <span className="rigplot-status__dim">desk · {patch.message}</span> : null}
            </div>
        </div>
        </>
    )
}

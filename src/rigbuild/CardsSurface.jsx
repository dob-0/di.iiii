import { useEffect, useMemo, useState } from 'react'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useProjectStore } from '../project/state/projectStore.js'
import { TYPE_LIBRARY } from './types/index.js'
import { buildPatchSheetPath } from './patchRouting.js'
import { buildPlotPath } from './plotRouting.js'
import { countWords, rentalCounts, rentalOf } from './rental.js'
import { symbolTable, shapePath } from './plotSymbols.js'
import './plot.css'
import './cards.css'

// THE CARDS — view C of the rig builder: the rental list dealt onto named positions,
// the patch filling in beside them, the looks on a cue list underneath.
// docs/architecture/RIG_BUILD.md §11.
//
// Everything is read from, and written to, the project document through the op log
// (the Studio's own path), so the plot, the patch sheet and the room see the same rig.
// The look is the plot's: paper, ink, the house mono — the same classes.

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

export function Symbol({ shape, letter, size = 16 }) {
    const r = size * 0.36
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="rigplot-symbol">
            <path d={shapePath(shape, size / 2, size / 2, r)} fill={shape === 'bar' ? '#111' : '#fff'} stroke="#111" strokeWidth="1.2" />
            {letter ? <text x={size / 2} y={size / 2 + r * 0.35} fontSize={r * 1.1} textAnchor="middle" dominantBaseline="central">{letter}</text> : null}
        </svg>
    )
}

/** One card: a type on the list, its count as a bar, dashed when its mode is owed. */
export function Card({ item, shape, selected, onSelect }) {
    const fill = item.ordered ? Math.min(1, item.placed / item.ordered) : 1
    const owed = item.modeOwed === true
    const cls = `rigcards-card${selected ? ' is-selected' : ''}${owed ? ' is-owed' : ''}${item.over || item.unlisted ? ' is-over' : ''}`
    return (
        <button type="button" className={cls} aria-pressed={selected} onClick={onSelect}>
            <span className="rigcards-card__head">
                {shape ? <Symbol shape={shape.shape} letter={shape.letter} /> : null}
                <span className="rigplot-mono rigcards-card__code">{item.code}</span>
                <span className="rigplot-mono rigcards-card__count">{item.placed}/{item.ordered}</span>
            </span>
            <span className="rigcards-card__meta">
                {item.label || item.category || ''}
                {' · '}
                <span className="rigplot-mono">{owed ? 'mode OWED' : item.footprint ? `${item.footprint}ch` : 'mode ?'}{item.watts ? ` · ${item.watts} W` : ''}</span>
            </span>
            <span className="rigcards-card__bar" aria-hidden="true"><span style={{ width: `${Math.round(fill * 100)}%` }} /></span>
            <span className="rigcards-card__words rigplot-mono">{countWords(item)}</span>
        </button>
    )
}

export default function CardsSurface({ spaceId, projectId, library = TYPE_LIBRARY }) {
    const store = useProjectStore()
    const { state } = store
    useProjectDocumentSync({ projectId, store, clientIdPrefix: 'cards-client', opIdPrefix: 'cards-op' })
    const document_ = state.document
    const entities = useMemo(() => document_.entities || [], [document_.entities])
    const phone = useIsPhone()

    const { list } = useMemo(() => rentalOf(entities), [entities])
    const counts = useMemo(() => rentalCounts({ entities, library, list }), [entities, library, list])
    const table = useMemo(() => symbolTable(library.types || []), [library])
    const [card, setCard] = useState(null)

    const title = document_.projectMeta?.title || projectId
    useEffect(() => {
        const prev = document.title
        document.title = `Cards — ${title}`
        return () => { document.title = prev }
    }, [title])

    const cards = (
        <section className="rigcards-cards" aria-label="Rental list">
            <h2 className="rigcards-h">rental list</h2>
            {!state.hasLoaded ? <p className="rigplot-hint">Reading the rig…</p> : null}
            {state.hasLoaded && !list ? <p className="rigplot-hint">No rental list in this project. It is written from the rental house&apos;s spreadsheet by scripts/rigbuild/rental.mjs.</p> : null}
            <div className="rigcards-cardlist">
                {counts.items.map((item) => (
                    <Card key={item.type} item={item} shape={table.get(item.type)} selected={card === item.type} onSelect={() => setCard(card === item.type ? null : item.type)} />
                ))}
            </div>
            {list ? (
                <p className="rigcards-foot rigplot-mono">
                    {counts.totals.placed} placed / {counts.totals.ordered} ordered{counts.totals.over ? ` · ${counts.totals.over} over` : ''}
                    <br />
                    <span className="rigplot-status__dim">{list.source}</span>
                </p>
            ) : null}
        </section>
    )

    const links = (
        <nav className="rigcards-links" aria-label="Sheets">
            <a href={buildPlotPath(spaceId, projectId)}>plot</a>
            <a href={buildPatchSheetPath(spaceId, projectId)}>patch sheet</a>
        </nav>
    )

    return (
        <div className={`rigplot rigcards${phone ? ' rigcards--phone' : ''}`}>
            <header className="rigplot-top rigcards-top">
                <span className="rigplot-mono rigplot-top__title">{title} · cards</span>
                {links}
            </header>
            <main className="rigcards-main">
                {cards}
            </main>
        </div>
    )
}

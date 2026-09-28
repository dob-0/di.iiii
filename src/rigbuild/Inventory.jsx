import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { GROUPS, picturesOf } from './items/index.js'
import { DOC_WORDS, STATUS_WORDS, assetUrl, documentsOf, photosOf, verificationOf } from './items/media.js'
import { apiBaseUrl } from '../services/apiClient.js'
import { byGroup, matchTile, tileWords } from './inventory.js'
import { FLAG_WORDS, FROM_WORDS, ITEM_CATEGORIES } from './equipment.js'
import { typeById, modeOf, powerOf } from './fixtureTypes.js'
import { lightingApiUrl, probeLightingDesk } from '../map/lightingLink.js'
import './plot.css'
import './cards.css'
import './equipment.css'

// THE INVENTORY SCREEN and THE ITEM CARD (docs/architecture/RIG_BUILD.md §13). Owner,
// 2026-09-28: "i want to see it all in ui like minecraft where i can pick and create what
// i want … like how in games you have item and can check what is what". A grid of tiles,
// one per device, grouped; a card for each with its picture, what it is, what it does in
// the show, what it needs, its specs and real alternatives, every line with its source;
// TAKE / SKIP and a quantity on the card. The look is the plot's: paper, ink, the house
// mono; a picture is the only thing in colour.

const EffectPreview = lazy(() => import('./EffectPreview.jsx'))

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
const src = (path) => `${BASE}${String(path).replace(/^\/+/, '')}`
const money = (n, currency = 'AMD') => (n == null ? '—' : `${Math.round(n).toLocaleString('en-GB')} ${currency}`)

export function Stepper({ value, onChange, min = 0, max = 999, label = 'quantity', disabled = false }) {
    const [draft, setDraft] = useState(String(value))
    useEffect(() => { setDraft(String(value)) }, [value])
    const commit = (v) => {
        const n = Math.max(min, Math.min(max, Math.round(Number(v))))
        if (Number.isFinite(n) && n !== value) onChange(n)
        else setDraft(String(value))
    }
    return (
        <span className="rigequip-stepper" role="group" aria-label={label}>
            <button type="button" className="rigequip-stepper__btn" onClick={() => commit(value - 1)} disabled={disabled || value <= min} aria-label={`one less (${label})`}>−</button>
            <input
                className="rigequip-stepper__n rigplot-mono" inputMode="numeric" value={draft} disabled={disabled} aria-label={label}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
                onBlur={() => commit(draft)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(draft) }}
            />
            <button type="button" className="rigequip-stepper__btn" onClick={() => commit(value + 1)} disabled={disabled || value >= max} aria-label={`one more (${label})`}>+</button>
        </span>
    )
}

// A picture that fails to load (a maker's file on a tier that does not hold it, a render not
// built) is dropped, not shown broken — the next one takes its place.
function Picture({ tile, size = 'tile' }) {
    const all = useMemo(() => picturesOf({ id: tile.typeId || tile.item?.id, piece: tile.piece, item: tile.item, apiBase: apiBaseUrl }), [tile])
    const [failed, setFailed] = useState(() => new Set())
    // On a tile, a stand-in's photo never stands for the rental unit: our model comes first there.
    const pics = useMemo(() => {
        const ok = all.filter((p) => !failed.has(p.src))
        return size === 'tile' ? [...ok.filter((p) => !(p.kind === 'maker' && p.equivalent)), ...ok.filter((p) => p.kind === 'maker' && p.equivalent)] : ok
    }, [all, failed, size])
    const [i, setI] = useState(0)
    const pic = pics[Math.min(i, pics.length - 1)] || null
    const drop = (p) => setFailed((f) => new Set(f).add(p.src))
    if (!pic) {
        return <div className={`rigequip-pic rigequip-pic--${size} is-none`} aria-hidden={size === 'tile'}><span className="rigplot-mono">{size === 'tile' ? String(tile.code).replace(/^UP-/, '') : 'no picture yet — owed'}</span></div>
    }
    const at = pics.indexOf(pic)
    const imgSrc = pic.absolute ? pic.src : src(pic.src)
    const alt = size === 'tile' ? '' : `${tile.name}: ${pic.kind === 'render' ? '3D model — a render of our model' : pic.kind === 'maker' ? `${pic.equivalent ? 'equivalent product, not the rental unit — ' : ''}${pic.shows || 'the maker\'s photo'}` : pic.shows || 'a photo'}`
    return (
        <figure className={`rigequip-pic rigequip-pic--${size}${pic.kind === 'maker' ? ' is-maker' : ''}`}>
            <img key={imgSrc} src={imgSrc} alt={alt} loading="lazy" draggable="false" onError={() => drop(pic)} referrerPolicy="no-referrer" />
            {size !== 'tile' ? (
                <figcaption className="rigplot-mono">
                    <span className="rigequip-pic__kind">{pic.kind === 'render' ? '3D model' : pic.kind === 'maker' ? (pic.equivalent ? 'maker\'s photo · EQUIVALENT product, not the rental unit' : 'maker\'s photo') : 'photo'}</span>
                    {' · '}
                    {pic.kind === 'render' ? <>our model, rendered · {pic.licence}</>
                        : pic.kind === 'maker' ? <>© {pic.credit} — manufacturer’s image, internal reference · <a href={pic.page} target="_blank" rel="noreferrer">source</a> · fetched {pic.fetched}</>
                            : <>{pic.credit} · {pic.licenceUrl ? <a href={pic.licenceUrl} target="_blank" rel="noreferrer">{pic.licence}</a> : pic.licence}{pic.page ? <> · <a href={pic.page} target="_blank" rel="noreferrer">source</a></> : null}{pic.shows ? <> · {pic.shows}</> : null}</>}
                </figcaption>
            ) : null}
            {size !== 'tile' && pics.length > 1 ? (
                <div className="rigequip-gallery" role="group" aria-label="pictures">
                    {pics.map((p, k) => (
                        <button key={p.src} type="button" className={`rigequip-gallery__dot${k === at ? ' is-on' : ''}`} aria-pressed={k === at} onClick={() => setI(k)}
                            aria-label={`${k + 1} of ${pics.length}: ${p.kind === 'render' ? '3D model' : p.kind === 'maker' ? 'maker\'s photo' : 'photo'}`}>
                            <img src={p.absolute ? p.src : src(p.src)} alt="" loading="lazy" draggable="false" onError={() => drop(p)} referrerPolicy="no-referrer" />
                        </button>
                    ))}
                </div>
            ) : null}
        </figure>
    )
}

/** The verification badge: is this the rental unit's maker's product, and the evidence. */
function Verified({ id }) {
    const v = verificationOf(id)
    if (!v) return null
    const words = STATUS_WORDS[v.status] || STATUS_WORDS.unknown
    const ev = (v.evidence || [])[0]
    return (
        <p className={`rigequip-verified is-${v.status}`}>
            <span className="rigequip-verified__badge rigplot-mono">{words.badge}</span>
            <span className="rigequip-verified__means">{words.means}{v.status === 'equivalent' && v.equivalentOf ? <> — shown: {v.equivalentOf.url ? <a href={v.equivalentOf.url} target="_blank" rel="noreferrer"><b>{v.equivalentOf.maker} {v.equivalentOf.model}</b></a> : <b>{v.equivalentOf.maker} {v.equivalentOf.model}</b>}</> : null}.</span>
            <span className="rigplot-mono rigequip-verified__ev">
                {ev ? <><a href={ev.url} target="_blank" rel="noreferrer">evidence</a> · checked {ev.accessed || v.checked}</> : <>checked {v.checked}</>}
            </span>
            {v.note ? <span className="rigequip-verified__note">{v.note}</span> : null}
        </p>
    )
}

// Whether this install holds the makers' files at all (a hosted tier never does). One probe
// per page, on the first document or photo asked for.
let storeProbe = null
const probeStore = (url) => {
    if (!storeProbe) storeProbe = fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
    return storeProbe
}

/** The documents: manual, DMX chart, datasheet, safety. A file the maker offers for download
 * opens the copy this install keeps; anything else links the maker's page, never copied. */
function Documents({ id }) {
    const docs = documentsOf(id)
    const first = docs.map((d) => assetUrl(apiBaseUrl, d)).find(Boolean)
    const [here, setHere] = useState(null)
    useEffect(() => {
        let live = true
        if (first) probeStore(first).then((ok) => { if (live) setHere(ok) })
        else setHere(false)
        return () => { live = false }
    }, [first])
    if (!docs.length) return null
    return (
        <section className="rigequip-card__part rigequip-docs"><h3>documents</h3>
            {first && here === false ? <p className="rigplot-hint">The kept copies stay on the studio’s own install (the makers’ copyright, internal reference) — here each line links the maker’s file.</p> : null}
            <ul>
                {docs.map((d) => {
                    const local = here ? assetUrl(apiBaseUrl, d) : null
                    return (
                        <li key={d.url}>
                            <span className="rigplot-mono rigequip-kind">{DOC_WORDS[d.kind] || d.kind}</span>{' '}
                            <a href={local || d.url} target="_blank" rel="noreferrer"><b>{d.title}</b></a>
                            {d.pages ? <span className="rigplot-mono"> · {d.pages} p.</span> : null}
                            {d.equivalent ? <span className="rigequip-flag rigplot-mono"> · EQUIVALENT product, not the rental unit</span> : null}
                            {d.note ? <span> — {d.note}</span> : null}
                            <span className="rigequip-docs__rights rigplot-mono">
                                {d.offer === 'link'
                                    ? <>© {d.maker} — on the maker’s page, linked, not copied · checked {d.checked}</>
                                    : <>© {d.maker} — manufacturer’s document, internal reference · <a href={d.page || d.url} target="_blank" rel="noreferrer">source</a> · fetched {d.fetched || 'not yet'}{d.sha256 ? <> · sha256 {d.sha256.slice(0, 12)}…</> : null}{local ? ' · the copy kept here' : ''}</>}
                            </span>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

/** The maker's photos that are only linked (a shop page's pictures are theirs to show, not ours to copy). */
function PhotoLinks({ id }) {
    const links = photosOf(id).filter((m) => m.offer === 'link')
    if (!links.length) return null
    const pages = [...new Map(links.map((m) => [m.page || m.url, m])).values()]
    return (
        <p className="rigequip-photolinks rigplot-mono">
            <span className="rigequip-pic__kind">maker’s photos</span>{' '}
            {pages.map((m, k) => (
                <span key={m.page || m.url}>{k ? ' · ' : ''}<a href={m.page || m.url} target="_blank" rel="noreferrer">{m.equivalent ? `${m.product} (equivalent, not the rental unit)` : m.product || m.maker}</a></span>
            ))}
            <span className="rigequip-docs__rights">© {[...new Set(pages.map((m) => m.maker))].join(', ')} — on the maker’s page, linked, not copied · checked {pages[0].checked}</span>
        </p>
    )
}

function Tile({ tile, selected, onOpen, onDragStart }) {
    const warn = tile.flags?.some((f) => f === 'over-stock' || f === 'over-order' || f === 'not-on-list')
    return (
        <button
            type="button"
            className={`rigequip-tile${tile.taken ? ' is-taken' : ''}${selected ? ' is-selected' : ''}${tile.modeOwed ? ' is-owed' : ''}${warn ? ' is-warn' : ''}`}
            aria-pressed={selected}
            onClick={() => onOpen(tile.id)}
            onPointerDown={(e) => onDragStart?.(e, tile)}
            data-tile={tile.id}
        >
            <Picture tile={tile} />
            <span className="rigequip-tile__name">{tile.name}</span>
            <span className="rigequip-tile__code rigplot-mono">{tile.code}</span>
            <span className="rigequip-tile__words rigplot-mono">{warn ? '! ' : ''}{tileWords(tile)}</span>
        </button>
    )
}

const Refs = ({ keys, sources }) => {
    const list = (keys || []).filter((k) => sources?.[k])
    if (!list.length) return null
    return <span className="rigequip-refs rigplot-mono">[{list.map((k, i) => <span key={k}>{i ? ', ' : ''}<a href={`#src-${k}`}>{k}</a></span>)}]</span>
}

// An item's spec that says what the type already says, from the same source, is not said twice.
const SPEC_SAME = { 'power draw': 'power', 'ingress protection': 'IP', 'IP rating': 'IP' }
const specLabel = (label) => SPEC_SAME[label] || label

/** The type's own numbers, with where each came from. */
function typeSpecs(type, tile) {
    const out = []
    if (!type) return out
    if (type.modesOwed) out.push({ label: 'DMX mode', value: 'owed — the rental house has not said', owed: true })
    else {
        const mode = modeOf(type, type.defaultMode)
        out.push({ label: 'DMX modes', value: type.modes.map((m) => `${m.name} (${m.footprint} ch)`).join(' · '), src: type.modes[0]?.src })
        out.push({ label: 'channel list', value: mode?.channels ? mode.channels.map((c) => c.label || c.role).join(' · ') : 'owed', owed: !mode?.channels })
    }
    const w = powerOf(type)
    if (w != null) out.push({ label: 'power', value: `${w} W`, src: type.power_w?.src })
    if (type.weight_kg?.value != null) out.push({ label: 'weight', value: `${type.weight_kg.value} kg`, src: type.weight_kg.src })
    if (Array.isArray(type.size_mm?.value)) out.push({ label: 'size', value: `${type.size_mm.value.join(' × ')} mm${type.size_mm.order ? ` (${type.size_mm.order})` : ''}`, src: type.size_mm.src })
    if (type.ip?.value) out.push({ label: 'IP', value: type.ip.value, src: type.ip.src })
    if (type.optics?.beam_deg) out.push({ label: 'beam', value: `${type.optics.beam_deg}°`, src: type.optics.photometrySrc })
    if (tile.rate != null) out.push({ label: 'day rate', value: `${money(tile.rate)} · ${tile.cat?.cells || tile.line?.source || ''}` })
    if (tile.available != null) out.push({ label: 'the house holds', value: String(tile.available) })
    return out
}

/** The item card — the game's item detail: see what it is, then take it or skip it. */
export function ItemCard({ tile, eq, library, readOnly, phone, onClose, onToHotbar, hotbarOn, onOfl, onItem, deskHere }) {
    const [preview, setPreview] = useState(false)
    const [qty, setQty] = useState(1)
    const item = tile.item
    const type = tile.typeId ? typeById(library, tile.typeId) : null
    const specs = typeSpecs(type, tile)
    const sources = { ...(item?.sources || {}), ...(type?.sources || {}) }
    const typeSrcKeys = new Set(Object.keys(type?.sources || {}))
    const taken = tile.taken
    const line = tile.line
    const [from, setFrom] = useState(line?.from || 'rental')
    useEffect(() => { setFrom(line?.from || 'rental') }, [line?.from])
    const hazer = tile.id === 'extra:hazer'
    const node = tile.id === 'extra:artnet-node'

    const takeIt = () => {
        if (hazer) { onOfl({ manufacturer: 'mdg', key: 'atme', ordered: qty }); return }
        if (node || (tile.suggested && !tile.cat)) { onItem({ code: item?.name || tile.name, category: node ? 'node' : 'other', ordered: qty, label: item?.product || '' }); return }
        eq.take(tile, { ordered: qty })
    }

    return (
        <article className={`rigequip-card${phone ? ' is-phone' : ''}`} aria-label={`${tile.name} — item card`}>
            <header className="rigequip-card__head">
                <div>
                    <h2 className="rigequip-card__name">{tile.name}</h2>
                    <p className="rigequip-card__code rigplot-mono">{tile.code}{tile.label && tile.label !== tile.name && tile.label !== tile.code ? ` · ${tile.label}` : ''}</p>
                </div>
                <button type="button" className="rigequip-close" onClick={onClose} aria-label="Close the card">×</button>
            </header>
            <Picture tile={tile} size="card" />
            {item ? <PhotoLinks id={item.id} /> : null}
            {item?.product ? <p className="rigequip-card__product">{item.product}</p> : null}
            {item ? <Verified id={item.id} /> : null}

            {/* take it or skip it, and how many */}
            {!readOnly ? (
                <section className="rigequip-take" aria-label="Take or skip">
                    {taken ? (
                        <>
                            <span className="rigequip-take__state rigplot-mono"><b>TAKING</b></span>
                            <Stepper value={tile.taking} onChange={(n) => eq.setQuantity(tile, n)} label={`how many ${tile.code}`} />
                            <button type="button" className="rigcards-btn" onClick={() => eq.skip(tile)}>skip</button>
                            {tile.placeable && hotbarOn ? <button type="button" className="rigcards-btn" onClick={() => onToHotbar(tile)}>to hotbar</button> : null}
                        </>
                    ) : (
                        <>
                            <span className="rigequip-take__state rigplot-mono">not taken</span>
                            <Stepper value={qty} onChange={setQty} min={1} label={`how many ${tile.code} to take`} />
                            <button type="button" className="rigcards-btn is-primary" onClick={takeIt} disabled={hazer && !deskHere}>take {qty}</button>
                        </>
                    )}
                    <span className="rigequip-take__words rigplot-mono">
                        {tileWords(tile)}{tile.placed ? ` · ${tile.placed} placed` : ''}
                        {tile.flags?.filter((f) => FLAG_WORDS[f]).map((f) => <span key={f} className="rigequip-flag"> · ! {FLAG_WORDS[f]}</span>)}
                    </span>
                    {hazer && !deskHere ? <span className="rigequip-take__words rigplot-mono">taking it reads its channels from the Open Fixture Library through the desk — a local di.iiii</span> : null}
                    {taken && line ? (
                        <span className="rigequip-take__from">
                            <label className="rigplot-field"><span>from</span>
                                <select value={from} onChange={(e) => { setFrom(e.target.value); eq.setFields(tile, { from: e.target.value }) }}>
                                    {Object.entries(FROM_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
                                </select>
                            </label>
                            {from === 'other' ? <label className="rigplot-field rigplot-field--text"><span>supplier</span><input defaultValue={line.supplier} placeholder="who" onBlur={(e) => { if (e.target.value !== line.supplier) eq.setFields(tile, { supplier: e.target.value }) }} /></label> : null}
                            <label className="rigplot-field rigplot-field--text"><span>note</span><input defaultValue={line.note} placeholder="—" onBlur={(e) => { if (e.target.value !== line.note) eq.setFields(tile, { note: e.target.value }) }} /></label>
                        </span>
                    ) : null}
                </section>
            ) : null}

            {item ? (
                <>
                    <section className="rigequip-card__part"><h3>what it is</h3><p>{item.what} <Refs keys={item.whatSources} sources={sources} /></p></section>
                    <section className="rigequip-card__part">
                        <h3>in the show</h3>
                        <p>{item.inShow} <Refs keys={item.inShowSources} sources={sources} /></p>
                        {item.preview && item.preview !== 'none' ? (
                            preview ? (
                                <Suspense fallback={<div className="rigequip-preview is-empty rigplot-mono">preview…</div>}>
                                    <EffectPreview kind={item.preview} onClose={() => setPreview(false)} />
                                </Suspense>
                            ) : <button type="button" className="rigcards-btn" onClick={() => setPreview(true)}>see it · {item.preview}</button>
                        ) : null}
                    </section>
                    {item.needs?.length ? (
                        <section className="rigequip-card__part"><h3>needs</h3>
                            <ul className="rigequip-needs">{item.needs.map((n, i) => <li key={i}><span className="rigplot-mono rigequip-kind">{n.kind}</span> {n.text} <Refs keys={n.sources} sources={sources} /></li>)}</ul>
                        </section>
                    ) : null}
                </>
            ) : (
                <section className="rigequip-card__part"><p className="rigplot-hint">No card text for this device yet — owed. {type?.sources?.OFL ? <a href={type.sources.OFL.url} target="_blank" rel="noreferrer">its Open Fixture Library page</a> : null}</p></section>
            )}

            <section className="rigequip-card__part"><h3>specs</h3>
                <dl className="rigequip-specs">
                    {specs.map((s) => (
                        <div key={s.label} className={s.owed ? 'is-owed' : ''}><dt className="rigplot-mono">{s.label}</dt><dd>{s.value}{s.src && typeSrcKeys.has(s.src) ? <> <Refs keys={[s.src]} sources={sources} /></> : null}</dd></div>
                    ))}
                    {(item?.specs || []).filter((s) => !specs.some((x) => x.label === specLabel(s.label) && (x.value === s.value || (x.src && (s.sources || []).includes(x.src))))).map((s) => (
                        <div key={`i-${s.label}`}><dt className="rigplot-mono">{s.label}</dt><dd>{s.value} <Refs keys={s.sources} sources={sources} /></dd></div>
                    ))}
                    {!specs.length && !item?.specs?.length ? <div><dt className="rigplot-mono">—</dt><dd>no specs known</dd></div> : null}
                </dl>
            </section>

            {item?.alternatives?.length ? (
                <section className="rigequip-card__part"><h3>real alternatives</h3>
                    <ul className="rigequip-alts">
                        {item.alternatives.map((a) => (
                            <li key={`${a.maker}-${a.model}`}><a href={a.url} target="_blank" rel="noreferrer"><b>{a.maker} {a.model}</b></a> — {a.why} <Refs keys={a.sources} sources={sources} /></li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {item ? <Documents id={item.id} /> : null}

            {Object.keys(sources).length ? (
                <section className="rigequip-card__part rigequip-sources"><h3>sources</h3>
                    <ol>
                        {Object.entries(sources).map(([k, s]) => (
                            <li key={k} id={`src-${k}`} className="rigplot-mono"><b>{k}</b> {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.what || s.url}</a> : s.what}{s.licence ? ` · ${s.licence}` : ''}{s.accessed ? ` · ${s.accessed}` : ''}</li>
                        ))}
                    </ol>
                </section>
            ) : null}
        </article>
    )
}

/** Lowering below what is placed: remove the last placed, pick which, or keep them flagged. */
export function ReduceDialog({ pending, onAnswer }) {
    const [picking, setPicking] = useState(false)
    const [picked, setPicked] = useState(() => new Set())
    const r = pending.reduction
    const need = r.over
    return (
        <div className="rigequip-modal" role="dialog" aria-modal="true" aria-label="What happens to the placed lamps">
            <div className="rigequip-modal__box">
                <h2 className="rigcards-h">{pending.verb}</h2>
                <p className="rigequip-modal__said"><b className="rigplot-mono">{r.placed}</b> {pending.tile.code} are placed; the list will take <b className="rigplot-mono">{r.to}</b>. What happens to the other <b className="rigplot-mono">{need}</b>?</p>
                {!picking ? (
                    <div className="rigequip-modal__acts">
                        <button type="button" className="rigcards-btn is-primary" onClick={() => onAnswer('last')}>remove the last {need} placed</button>
                        <button type="button" className="rigcards-btn" onClick={() => setPicking(true)}>pick which {need}</button>
                        <button type="button" className="rigcards-btn" onClick={() => onAnswer('keep')}>keep them, flagged over the order</button>
                        <button type="button" className="rigcards-btn" onClick={() => onAnswer('cancel')}>cancel</button>
                    </div>
                ) : (
                    <>
                        <p className="rigplot-mono rigequip-modal__count">{picked.size} of {need} picked</p>
                        <ul className="rigequip-pick">
                            {r.lamps.map((l) => (
                                <li key={l.id}>
                                    <label>
                                        <input type="checkbox" checked={picked.has(l.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} />
                                        <span className="rigplot-mono">{l.position || 'no position'}{l.unit != null ? ` · unit ${l.unit}` : ''}{l.index != null ? ` · #${l.index}` : ''}{l.patch ? ` · ${l.patch}` : ''}{r.last.includes(l.id) ? ' · last placed' : ''}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        <div className="rigequip-modal__acts">
                            <button type="button" className="rigcards-btn is-primary" disabled={picked.size !== need} onClick={() => onAnswer([...picked])}>remove these {picked.size}</button>
                            <button type="button" className="rigcards-btn" onClick={() => setPicking(false)}>back</button>
                        </div>
                    </>
                )}
                <p className="rigequip-modal__foot rigplot-mono">removed lamps leave the plot, the cards and the room; the desk un-patches them (auto-patch). Undo takes the whole step back.</p>
            </div>
        </div>
    )
}

const deskGet = async (path) => {
    const res = await fetch(lightingApiUrl(path))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `the desk answered ${res.status}`)
    return body
}

/** A new type from the Open Fixture Library, through the desk's own import (library.js). */
export function OflSheet({ preset = null, onAdd, onClose }) {
    const [desk, setDesk] = useState(null)
    const [makers, setMakers] = useState([])
    const [q, setQ] = useState('')
    const [maker, setMaker] = useState(null)
    const [fixtures, setFixtures] = useState([])
    const [fq, setFq] = useState('')
    const [fixture, setFixture] = useState(null)
    const [described, setDescribed] = useState(null)
    const [error, setError] = useState('')
    const [qty, setQty] = useState(preset?.ordered || 1)
    const [from, setFrom] = useState('other')
    const [supplier, setSupplier] = useState('')
    const [rate, setRate] = useState('')
    const [note, setNote] = useState('')
    useEffect(() => {
        let live = true
        probeLightingDesk().then(async (here) => {
            if (!live) return
            setDesk(here)
            if (!here) return
            try {
                const body = await deskGet('api/library')
                if (!live) return
                setMakers(body.manufacturers || [])
                if (preset) {
                    const m = (body.manufacturers || []).find((x) => x.key === preset.manufacturer)
                    if (m) { setMaker(m); setQ(m.name) }
                }
            } catch (e) { setError(e.message) }
        })
        return () => { live = false }
    }, [preset])
    useEffect(() => {
        if (!maker) return undefined
        let live = true
        setFixtures([]); setError('')
        deskGet(`api/library/manufacturer?key=${encodeURIComponent(maker.key)}`).then((b) => {
            if (!live) return
            setFixtures(b.fixtures || [])
            if (preset?.key && preset.manufacturer === maker.key) {
                const f = (b.fixtures || []).find((x) => x.key === preset.key)
                if (f) setFixture(f)
            }
        }).catch((e) => live && setError(e.message))
        return () => { live = false }
    }, [maker, preset])
    useEffect(() => {
        if (!maker || !fixture) return undefined
        let live = true
        setDescribed(null); setError('')
        deskGet(`api/library/fixture?manufacturer=${encodeURIComponent(maker.key)}&key=${encodeURIComponent(fixture.key)}`).then((b) => live && setDescribed(b)).catch((e) => live && setError(e.message))
        return () => { live = false }
    }, [maker, fixture])
    const shownMakers = makers.filter((m) => !q || `${m.name} ${m.key}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40)
    const shownFixtures = fixtures.filter((f) => !fq || `${f.name} ${f.key} ${(f.categories || []).join(' ')}`.toLowerCase().includes(fq.toLowerCase()))
    return (
        <div className="rigequip-modal" role="dialog" aria-modal="true" aria-label="Add a type from the Open Fixture Library">
            <div className="rigequip-modal__box rigequip-modal__box--wide">
                <header className="rigequip-card__head">
                    <h2 className="rigcards-h">a new type · Open Fixture Library</h2>
                    <button type="button" className="rigequip-close" onClick={onClose} aria-label="Close">×</button>
                </header>
                {desk === false ? <p className="rigplot-hint">The fixture library is read through the lighting desk, which runs on a local di.iiii. On this machine there is none — add the line as an item, or add it on the machine with the desk.</p> : null}
                {desk == null ? <p className="rigplot-hint">looking for the desk…</p> : null}
                {error ? <p className="rigplot-hint" role="alert">{error}</p> : null}
                {desk ? (
                    <div className="rigequip-ofl">
                        <div className="rigequip-ofl__col">
                            <label className="rigplot-field rigplot-field--text"><span>maker</span><input value={q} onChange={(e) => { setQ(e.target.value); setMaker(null); setFixture(null) }} placeholder="search makers" /></label>
                            <ul className="rigequip-ofl__list">
                                {shownMakers.map((m) => <li key={m.key}><button type="button" aria-pressed={maker?.key === m.key} onClick={() => { setMaker(m); setFixture(null); setQ(m.name) }}>{m.name} <span className="rigplot-mono">{m.fixtures}</span></button></li>)}
                            </ul>
                        </div>
                        {maker ? (
                            <div className="rigequip-ofl__col">
                                <label className="rigplot-field rigplot-field--text"><span>fixture</span><input value={fq} onChange={(e) => setFq(e.target.value)} placeholder={`search ${maker.name}`} /></label>
                                <ul className="rigequip-ofl__list">
                                    {shownFixtures.map((f) => <li key={f.key}><button type="button" aria-pressed={fixture?.key === f.key} onClick={() => setFixture(f)}>{f.name} <span className="rigplot-mono">{(f.categories || []).join(', ')}</span></button></li>)}
                                </ul>
                            </div>
                        ) : null}
                        {described ? (
                            <div className="rigequip-ofl__col rigequip-ofl__pick">
                                <p className="rigplot-mono"><b>{maker.name} {described.name}</b> · {(described.categories || []).join(', ')}{described.from ? ` · ${described.from}` : ''}</p>
                                <ul className="rigequip-ofl__modes rigplot-mono">
                                    {(described.modes || []).map((m) => <li key={m.index}>{m.shortName || m.name} · {m.matrix ? 'matrix — footprint owed' : `${m.channels} ch: ${(m.channelNames || []).join(', ')}`}</li>)}
                                </ul>
                                <p className="rigplot-mono rigequip-take__words">{described.physical?.power != null ? `${described.physical.power} W` : 'power not in OFL'}{described.physical?.weight != null ? ` · ${described.physical.weight} kg` : ''} · MIT (Open Fixture Library){described.lastModifyDate ? ` · last modified ${described.lastModifyDate}` : ''}</p>
                                <div className="rigequip-fields">
                                    <Stepper value={qty} onChange={setQty} min={1} label="how many" />
                                    <label className="rigplot-field"><span>from</span><select value={from} onChange={(e) => setFrom(e.target.value)}>{Object.entries(FROM_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></label>
                                    {from === 'other' ? <label className="rigplot-field rigplot-field--text"><span>supplier</span><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="who" /></label> : null}
                                    <label className="rigplot-field"><span>rate/day</span><input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="?" /></label>
                                    <label className="rigplot-field rigplot-field--text"><span>note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" /></label>
                                </div>
                                <button type="button" className="rigcards-btn is-primary" onClick={() => onAdd({ manufacturer: maker.key, manufacturerName: maker.name, key: fixture.key, described, from: described.from, ordered: qty, lineFrom: from, supplier, rate: rate || null, note })}>take {qty} {maker.name} {described.name}</button>
                            </div>
                        ) : fixture ? <p className="rigplot-hint">reading {fixture.name}…</p> : null}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

/** A non-DMX item: a node, a splitter, a cable, a console — counted and costed, never patched. */
export function ItemSheet({ preset = {}, onAdd, onClose }) {
    const [code, setCode] = useState(preset.code || '')
    const [category, setCategory] = useState(preset.category || 'node')
    const [qty, setQty] = useState(preset.ordered || 1)
    const [from, setFrom] = useState(preset.from || 'other')
    const [supplier, setSupplier] = useState('')
    const [rate, setRate] = useState('')
    const [watts, setWatts] = useState('')
    const [note, setNote] = useState(preset.note || '')
    return (
        <div className="rigequip-modal" role="dialog" aria-modal="true" aria-label="Add an item">
            <div className="rigequip-modal__box">
                <header className="rigequip-card__head">
                    <h2 className="rigcards-h">an item · not patched</h2>
                    <button type="button" className="rigequip-close" onClick={onClose} aria-label="Close">×</button>
                </header>
                <div className="rigequip-fields rigequip-fields--stack">
                    <label className="rigplot-field rigplot-field--text"><span>name</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Art-Net node" /></label>
                    <label className="rigplot-field"><span>kind</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{ITEM_CATEGORIES.map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></label>
                    <span className="rigplot-field"><span>how many</span><Stepper value={qty} onChange={setQty} min={1} label="how many" /></span>
                    <label className="rigplot-field"><span>from</span><select value={from} onChange={(e) => setFrom(e.target.value)}>{Object.entries(FROM_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></label>
                    {from === 'other' ? <label className="rigplot-field rigplot-field--text"><span>supplier</span><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="who" /></label> : null}
                    <label className="rigplot-field"><span>rate/day</span><input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="?" /></label>
                    <label className="rigplot-field"><span>W each</span><input inputMode="numeric" value={watts} onChange={(e) => setWatts(e.target.value.replace(/[^\d.]/g, ''))} placeholder="?" /></label>
                    <label className="rigplot-field rigplot-field--text"><span>note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="4 universes" /></label>
                </div>
                <button type="button" className="rigcards-btn is-primary" disabled={!code.trim()} onClick={() => onAdd({ code, category, ordered: qty, from, supplier, rate: rate || null, watts: watts || null, note, label: preset.label || '' })}>take {qty} {code || 'item'}</button>
            </div>
        </div>
    )
}

/**
 * The inventory screen. `hotbar` (build mode only): {slots, pinned, onPin(tile, at)} — a
 * tile dragged onto a hotbar slot (mouse), or "to hotbar" on its card (one finger), puts
 * it in the hand.
 */
export function InventoryPanel({ eq, library, readOnly = false, phone = false, hotbar = null, onClose = null, orderHref = null, header = null }) {
    const [q, setQ] = useState('')
    const [only, setOnly] = useState('all') // all | taking
    const [openId, setOpenId] = useState(null)
    const [ofl, setOfl] = useState(null)
    const [itemSheet, setItemSheet] = useState(null)
    const [deskHere, setDeskHere] = useState(false)
    useEffect(() => { probeLightingDesk().then(setDeskHere) }, [])
    const tiles = useMemo(() => eq.tiles.filter((t) => (only === 'all' || t.taken) && matchTile(t, q)), [eq.tiles, only, q])
    const groups = useMemo(() => byGroup(tiles, GROUPS), [tiles])
    const open = openId ? eq.tiles.find((t) => t.id === openId) || null : null
    // A tile taken turns from `cat:` into its line: follow it by code.
    const lastCode = useRef(null)
    useEffect(() => { if (open) lastCode.current = open.code }, [open])
    useEffect(() => {
        if (openId && !open && lastCode.current) {
            const again = eq.tiles.find((t) => t.code === lastCode.current)
            if (again) setOpenId(again.id)
        }
    }, [openId, open, eq.tiles])

    // Drag a tile onto the hotbar (mouse or pen; a finger uses the card's "to hotbar").
    const [drag, setDrag] = useState(null)
    const dragStart = (e, tile) => {
        if (!hotbar || readOnly || !tile.taken || !tile.hotbarId || e.pointerType === 'touch' || e.button !== 0) return
        const start = { x: e.clientX, y: e.clientY }
        let moving = false
        const move = (ev) => {
            if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return
            moving = true
            setDrag({ tile, x: ev.clientX, y: ev.clientY })
        }
        const up = (ev) => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            if (!moving) return
            setDrag(null)
            const slot = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-hotbar-slot]')
            if (slot) hotbar.onPin(tile, Number(slot.getAttribute('data-hotbar-slot')))
            const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); window.removeEventListener('click', swallow, true) }
            window.addEventListener('click', swallow, true)
            window.setTimeout(() => window.removeEventListener('click', swallow, true), 50)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
    }

    const m = eq.model
    const card = open ? (
        <ItemCard
            tile={open} eq={eq} library={library} readOnly={readOnly} phone={phone} deskHere={deskHere}
            onClose={() => setOpenId(null)}
            hotbarOn={Boolean(hotbar)} onToHotbar={(t) => hotbar?.onPin(t, null)}
            onOfl={(preset) => setOfl(preset)} onItem={(preset) => setItemSheet(preset)}
        />
    ) : null

    return (
        <section className={`rigequip-inv${phone ? ' is-phone' : ''}${open ? ' has-card' : ''}`} aria-label="Inventory">
            <header className="rigequip-inv__head">
                {header || <h2 className="rigcards-h">inventory</h2>}
                <label className="rigplot-field rigplot-field--text rigequip-search"><span>find</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="co2, beam, haze…" /></label>
                <div className="rigplot-seg" role="group" aria-label="Show">
                    <button type="button" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>all</button>
                    <button type="button" aria-pressed={only === 'taking'} onClick={() => setOnly('taking')}>taking</button>
                </div>
                {!readOnly ? (
                    <span className="rigequip-inv__adds">
                        <button type="button" className="rigcards-btn" onClick={() => setOfl({})}>+ type from OFL</button>
                        <button type="button" className="rigcards-btn" onClick={() => setItemSheet({})}>+ item</button>
                    </span>
                ) : null}
                <span className="rigequip-inv__sum rigplot-mono">{m.totals.units} units · {m.totals.fixtures} fixtures{m.totals.cost != null ? ` · ${money(m.totals.cost, m.list?.currency)}` : ` · ${money(m.totals.perDay, m.list?.currency)}/day`}</span>
                {orderHref ? <a className="rigcards-btn" href={orderHref}>the order</a> : null}
                {onClose ? <button type="button" className="rigequip-close" onClick={onClose} aria-label="Close the inventory (E)">×</button> : null}
            </header>
            <div className="rigequip-inv__body">
                <div className="rigequip-inv__grid">
                    {eq.said ? <p className="rigequip-said rigplot-mono" role="status">{eq.said}</p> : null}
                    {groups.map((g) => (
                        <section key={g.id} className="rigequip-group" aria-label={g.label}>
                            <h3 className="rigequip-group__h rigplot-mono">{g.label} <span className="rigplot-status__dim">{g.tiles.filter((t) => t.taken).length} taken of {g.tiles.length}</span></h3>
                            <div className="rigequip-tiles">
                                {g.tiles.map((t) => <Tile key={t.id} tile={t} selected={t.id === openId} onOpen={setOpenId} onDragStart={dragStart} />)}
                            </div>
                        </section>
                    ))}
                    {!groups.length ? <p className="rigplot-hint">Nothing matches “{q}”.</p> : null}
                </div>
                {card && !phone ? <div className="rigequip-inv__card">{card}</div> : null}
            </div>
            {hotbar ? (
                <ol className="rigequip-hotbar" aria-label="Hotbar — drag a tile here, or use “to hotbar” on its card">
                    {hotbar.slots.map((s, i) => (
                        <li key={s.id} data-hotbar-slot={i} className={`rigequip-hotbar__slot${drag ? ' is-target' : ''}`}>
                            <span className="rigequip-hotbar__key rigplot-mono">{s.key}</span>
                            <span className="rigplot-mono">{s.label}</span>
                            <span className="rigplot-mono rigplot-status__dim">{s.ordered != null ? `${s.placed}/${s.ordered}` : s.words}</span>
                        </li>
                    ))}
                    {hotbar.slots.length < 10 ? <li data-hotbar-slot={hotbar.slots.length} className={`rigequip-hotbar__slot is-empty${drag ? ' is-target' : ''}`}><span className="rigplot-mono">empty</span></li> : null}
                </ol>
            ) : null}
            {drag ? <div className="rigequip-ghost rigplot-mono" style={{ left: drag.x + 8, top: drag.y + 8 }}>{drag.tile.code}</div> : null}
            {card && phone ? <div className="rigequip-sheet" role="dialog" aria-label={`${open.name} — item card`}>{card}</div> : null}
            {eq.pending ? <ReduceDialog pending={eq.pending} onAnswer={eq.answer} /> : null}
            {ofl ? <OflSheet preset={ofl.manufacturer ? ofl : null} onClose={() => setOfl(null)} onAdd={(a) => { eq.addOfl(a); setOfl(null) }} /> : null}
            {itemSheet ? <ItemSheet preset={itemSheet} onClose={() => setItemSheet(null)} onAdd={(a) => { eq.addItem(a); setItemSheet(null) }} /> : null}
        </section>
    )
}

export default InventoryPanel

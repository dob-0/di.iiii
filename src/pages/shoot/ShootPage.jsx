import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyLocally, byCallTime, fetchSheet, linkLabel, propPicture, SheetMissingError, sendOps, shootFileUrl } from './shootApi.js'
import './shoot.css'

// The shoot sheet — /shoot/{key}. One shoot day for one crew: who arrives when,
// what each actor wears and brings, and a tick per prop that everyone shares.
// Anyone holding the link can tick, write a note under a prop ("it's in the
// van") and add one; the page checks the server every few seconds, so the
// whole crew sees the same sheet. Nothing here belongs to one shoot: the plan,
// names and photos all come from the server (the repo is public).

const POLL_MS = 4000
const TABS = ['Cast', 'Checklist', 'Plan']
const newId = () => Math.random().toString(36).slice(2, 10)

export default function ShootPage({ sheetKey = '' }) {
    const [sheet, setSheet] = useState(null)
    const [problem, setProblem] = useState(sheetKey ? '' : 'incomplete')
    const [status, setStatus] = useState('loading')
    const [tab, setTab] = useState('Cast')
    const [dialog, setDialog] = useState(null)
    const pending = useRef(0)
    const revRef = useRef(null)

    const accept = useCallback((next) => {
        if (!next?.plan) return
        revRef.current = next.rev
        setSheet(next)
    }, [])

    // Poll while the tab is visible; skip while one of our own edits is in
    // flight, so the server's older answer cannot undo a tick just made.
    useEffect(() => {
        if (!sheetKey) return undefined
        let stopped = false
        let timer = null
        const load = async () => {
            if (stopped || document.hidden || pending.current) return
            try {
                const answer = await fetchSheet(sheetKey, revRef.current)
                if (stopped || pending.current) return
                if (!answer.unchanged) accept(answer)
                setStatus('live')
            } catch (error) {
                if (stopped) return
                if (error instanceof SheetMissingError) setProblem('missing')
                else setStatus('offline')
            }
        }
        const loop = async () => {
            await load()
            if (!stopped) timer = setTimeout(loop, POLL_MS)
        }
        const onVisible = () => { if (!document.hidden) load() }
        loop()
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            stopped = true
            clearTimeout(timer)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [sheetKey, accept])

    const send = useCallback(async (ops) => {
        setSheet((current) => (current ? { ...current, plan: applyLocally(current.plan, ops) } : current))
        pending.current += 1
        setStatus('saving')
        try {
            accept(await sendOps(sheetKey, ops))
            setStatus('live')
        } catch {
            setStatus('unsaved')
        } finally {
            pending.current -= 1
        }
    }, [sheetKey, accept])

    useEffect(() => {
        const title = sheet?.plan?.title
        document.title = title ? `${title} · shoot sheet` : 'Shoot sheet'
    }, [sheet?.plan?.title])

    if (problem) return <SheetProblem kind={problem} />
    if (!sheet) return <div className="shoot-root shoot-center"><p className="shoot-muted">Opening the shoot sheet…</p></div>

    const { plan } = sheet
    const file = (name) => shootFileUrl(sheetKey, name)

    return (
        <div className="shoot-root">
            <header className="shoot-bar">
                <span className="shoot-brand">{plan.brand || 'Shoot'}<small>{plan.brandNote || 'SHOOT SHEET'}</small></span>
                <SaveState status={status} />
            </header>
            <main className="shoot-main">
                <section className="shoot-hero">
                    <div>
                        {plan.eyebrow && <div className="shoot-eyebrow">{plan.eyebrow}</div>}
                        <h1>{plan.title}{plan.titleAccent && <><span> / </span><em>{plan.titleAccent}</em></>}</h1>
                    </div>
                    {plan.cover?.file && (
                        <figure>
                            <img src={file(plan.cover.file)} alt={plan.cover.alt || ''} />
                            {plan.cover.caption && <figcaption>{plan.cover.caption}</figcaption>}
                        </figure>
                    )}
                </section>
                {Array.isArray(plan.details) && plan.details.length > 0 && (
                    <section className="shoot-details" aria-label="When and where">
                        {plan.details.map((d) => (
                            <div key={d.label}><span>{d.label}</span><strong>{d.value}</strong>{d.sub && <small>{d.sub}</small>}</div>
                        ))}
                    </section>
                )}
                <nav className="shoot-tabs" aria-label="Sheet sections">
                    {TABS.map((name) => (
                        <button key={name} type="button" className={tab === name ? 'on' : ''} aria-pressed={tab === name} onClick={() => setTab(name)}>
                            {name}{name === 'Cast' && <span>{String(plan.cast.length).padStart(2, '0')}</span>}
                        </button>
                    ))}
                </nav>
                {tab === 'Cast' && <CastTab plan={plan} file={file} send={send} openDialog={setDialog} />}
                {tab === 'Checklist' && <ChecklistTab plan={plan} send={send} openDialog={setDialog} />}
                {tab === 'Plan' && <PlanTab plan={plan} send={send} />}
                <footer className="shoot-footer">
                    <span>Anyone with this link can tick, write and add. Share it only with the crew.</span>
                    {plan.footer && <span>{plan.footer}</span>}
                </footer>
            </main>
            {dialog?.kind === 'item' && <ItemDialog {...dialog} plan={plan} send={send} close={() => setDialog(null)} />}
            {dialog?.kind === 'add' && <AddDialog {...dialog} send={send} close={() => setDialog(null)} />}
            {dialog?.kind === 'actor' && <ActorDialog member={plan.cast.find((c) => c.id === dialog.cast)} send={send} close={() => setDialog(null)} />}
        </div>
    )
}

function SheetProblem({ kind }) {
    return (
        <div className="shoot-root shoot-center">
            <div className="shoot-problem">
                <h1>{kind === 'incomplete' ? 'This link is missing its end.' : 'No shoot sheet here.'}</h1>
                <p className="shoot-muted">
                    {kind === 'incomplete'
                        ? 'A shoot sheet link looks like /shoot/ followed by a long code. Ask whoever sent it for the whole link.'
                        : 'The link may be cut short or mistyped. Ask whoever sent it to send it again.'}
                </p>
            </div>
        </div>
    )
}

function SaveState({ status }) {
    const text = {
        loading: 'Loading…',
        live: 'Saved · live',
        saving: 'Saving…',
        unsaved: 'Not saved — check your connection',
        offline: 'Offline — showing the last copy'
    }[status] || ''
    return <span className={`shoot-save shoot-save-${status}`} aria-live="polite">{text}</span>
}

function CastTab({ plan, file, send, openDialog }) {
    const lineup = useMemo(() => byCallTime(plan.cast), [plan.cast])
    return (
        <>
            <div className="shoot-section-title">
                <h2>The cast.</h2>
                <span>In order of arrival · tap a prop to tick it</span>
            </div>
            {lineup.some((c) => c.callTime) && (
                <div className="shoot-calls" aria-label="Call times">
                    <div className="shoot-calls-label">CALL TIMES</div>
                    <ol>
                        {lineup.filter((c) => c.callTime).map((c) => (
                            <li key={c.id}><a href={`#actor-${c.id}`}><strong>{c.callTime}</strong><span>{c.role}</span></a></li>
                        ))}
                    </ol>
                </div>
            )}
            <div className="shoot-lineup">
                {lineup.map((member, index) => (
                    <ActorRow key={member.id} member={member} index={index} total={lineup.length} plan={plan} file={file} send={send} openDialog={openDialog} />
                ))}
            </div>
            {plan.castNote && <p className="shoot-note">{plan.castNote}</p>}
            {Array.isArray(plan.crew) && plan.crew.length > 0 && (
                <section className="shoot-crew" aria-label="Crew">
                    <div className="shoot-section-title"><h2>The crew.</h2><span>Behind the camera</span></div>
                    <div className="shoot-crew-grid">
                        {plan.crew.map((person) => (
                            <figure key={person.name}>
                                {person.photo && <img src={file(person.photo)} alt={person.name} loading="lazy" />}
                                <figcaption><strong>{person.name}</strong><span>{person.role}</span></figcaption>
                            </figure>
                        ))}
                    </div>
                </section>
            )}
        </>
    )
}

function ActorRow({ member, index, total, plan, file, send, openDialog }) {
    const list = `cast:${member.id}`
    const ready = member.items.filter((i) => i.done).length
    return (
        <article className="shoot-actor" id={`actor-${member.id}`}>
            <div className="shoot-actor-time">
                <span>CALL</span>
                <strong>{member.callTime || '—'}</strong>
                <span className="shoot-order">{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
            </div>
            <button type="button" className="shoot-actor-photo" onClick={() => openDialog({ kind: 'actor', cast: member.id })} aria-label={`Edit ${member.role}`}>
                {member.photo ? <img src={file(member.photo)} alt={`${member.role} costume reference`} /> : <span className="shoot-muted">No photo</span>}
                {member.photoLabel && <span className="shoot-photo-label">{member.photoLabel}</span>}
            </button>
            <div className="shoot-actor-main">
                <div className="shoot-actor-head">
                    <div>
                        <h3>{member.role}</h3>
                        {member.name && <div className="shoot-actor-name">{member.name}</div>}
                    </div>
                    <div className="shoot-actor-actions">
                        <span className={`shoot-ready${member.allSet ? ' all' : ''}`}>
                            {member.allSet ? '✓ All done · actor has everything' : `${ready} / ${member.items.length} ready`}
                        </span>
                        <button type="button" className={`shoot-chip${member.allSet ? ' on' : ''}`} aria-pressed={Boolean(member.allSet)}
                            onClick={() => send([{ op: 'cast.set', cast: member.id, allSet: !member.allSet }])}>
                            {member.allSet ? 'Undo all done' : 'Actor has everything'}
                        </button>
                        <button type="button" className="shoot-chip" onClick={() => openDialog({ kind: 'actor', cast: member.id })}>Edit</button>
                    </div>
                </div>
                {(member.outfit || member.sounds) && (
                    <dl className="shoot-brief">
                        {member.outfit && <><dt>OUTFIT</dt><dd>{member.outfit}</dd></>}
                        {member.sounds && <><dt>SOUNDS</dt><dd>{member.sounds}</dd></>}
                    </dl>
                )}
                <ul className="shoot-props" aria-label={`${member.role} props`}>
                    {member.items.map((item) => (
                        <PropTile key={item.id} item={item} picture={file(propPicture(plan, item))} fallbackNote={member.allSet ? 'Actor has it' : ''}
                            toggle={() => send([{ op: 'item.set', list, item: item.id, done: !item.done }])}
                            edit={() => openDialog({ kind: 'item', list, item: item.id })} />
                    ))}
                    <li className="shoot-prop shoot-prop-add">
                        <button type="button" onClick={() => openDialog({ kind: 'add', list, title: `Add a prop for ${member.role}` })}>
                            <span className="shoot-prop-img" aria-hidden="true">+</span>
                            <span className="shoot-prop-name">Add a prop</span>
                        </button>
                    </li>
                </ul>
            </div>
        </article>
    )
}

function PropTile({ item, picture, fallbackNote, toggle, edit }) {
    const note = item.note || fallbackNote
    return (
        <li className={`shoot-prop${item.done ? ' done' : ''}`}>
            <button type="button" className="shoot-prop-tick" onClick={toggle} aria-pressed={item.done} aria-label={`${item.text}: ${item.done ? 'ready, tap to untick' : 'tap when ready'}`}>
                <span className="shoot-prop-img">
                    {picture ? <img src={picture} alt="" loading="lazy" /> : <span aria-hidden="true">?</span>}
                    <span className="shoot-box" aria-hidden="true">{item.done ? '✓' : ''}</span>
                </span>
            </button>
            <button type="button" className="shoot-prop-text" onClick={edit} aria-label={`Note or link for ${item.text}`}>
                <span className="shoot-prop-name">{item.text}</span>
                {note ? <small>{note}</small> : <small className="shoot-add-note">+ note</small>}
            </button>
            {item.link && <a className="shoot-link" href={item.link} target="_blank" rel="noopener noreferrer">{linkLabel(item.link)} ↗</a>}
        </li>
    )
}

function ChecklistTab({ plan, send, openDialog }) {
    const lists = plan.lists || []
    if (!lists.length) return <p className="shoot-muted shoot-empty">No shared lists on this sheet.</p>
    return (
        <div className="shoot-two">
            {lists.map((list) => {
                const done = list.items.filter((i) => i.done).length
                return (
                    <section key={list.id} className="shoot-panel">
                        <div className="shoot-eyebrow">{done} / {list.items.length} DONE</div>
                        <h2>{list.title}</h2>
                        {list.subtitle && <p className="shoot-muted">{list.subtitle}</p>}
                        <ul className="shoot-checks">
                            {list.items.map((item) => (
                                <li key={item.id} className={item.done ? 'done' : ''}>
                                    <button type="button" className="shoot-check-box" aria-pressed={item.done} aria-label={`${item.text}: ${item.done ? 'done' : 'not done'}`}
                                        onClick={() => send([{ op: 'item.set', list: list.id, item: item.id, done: !item.done }])}>{item.done ? '✓' : ''}</button>
                                    <button type="button" className="shoot-check-text" onClick={() => openDialog({ kind: 'item', list: list.id, item: item.id })}>
                                        <span>{item.text}</span>
                                        {item.note ? <small>{item.note}</small> : <small className="shoot-add-note">+ note</small>}
                                    </button>
                                    {item.link && <a className="shoot-link" href={item.link} target="_blank" rel="noopener noreferrer">{linkLabel(item.link)} ↗</a>}
                                </li>
                            ))}
                        </ul>
                        <button type="button" className="shoot-chip" onClick={() => openDialog({ kind: 'add', list: list.id, title: `Add to ${list.title}` })}>+ Add</button>
                    </section>
                )
            })}
        </div>
    )
}

function PlanTab({ plan, send }) {
    return (
        <div className="shoot-two">
            <TextPanel eyebrow="ORDER OF THE DAY" title={plan.scheduleTitle || 'The day'} field="schedule" value={plan.schedule || ''} send={send} />
            <TextPanel eyebrow="KEEP EVERYTHING HERE" title="Production notes" field="notes" value={plan.notes || ''} send={send}
                placeholder="Contacts, reminders, anything the crew must remember…" />
        </div>
    )
}

// Saves when the field loses focus, so nobody has to find a button on a phone.
// While someone is typing, the server's copy does not overwrite their draft.
function TextPanel({ eyebrow, title, field, value, send, placeholder = '' }) {
    const [draft, setDraft] = useState(value)
    const [editing, setEditing] = useState(false)
    useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
    return (
        <section className="shoot-panel">
            <div className="shoot-eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
            <textarea value={draft} placeholder={placeholder} aria-label={title}
                onFocus={() => setEditing(true)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                    setEditing(false)
                    if (draft !== value) send([{ op: 'text.set', field, value: draft }])
                }} />
            <p className="shoot-muted shoot-hint">Saves when you tap outside the box.</p>
        </section>
    )
}

function Dialog({ title, close, children }) {
    const boxRef = useRef(null)
    // Focus the first field when the dialog opens, so typing a note on a phone
    // is one tap, not two.
    useEffect(() => {
        boxRef.current?.querySelector('input:not([type=checkbox]), textarea')?.focus()
    }, [])
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [close])
    return (
        <div className="shoot-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
            <section className="shoot-dialog" ref={boxRef} role="dialog" aria-modal="true" aria-label={title}>
                <div className="shoot-dialog-head">
                    <h2>{title}</h2>
                    <button type="button" className="shoot-close" onClick={close} aria-label="Close">×</button>
                </div>
                {children}
            </section>
        </div>
    )
}

function findItem(plan, list, id) {
    const items = list.startsWith('cast:') ? plan.cast.find((c) => c.id === list.slice(5))?.items : plan.lists?.find((l) => l.id === list)?.items
    return items?.find((i) => i.id === id)
}

function ItemDialog({ plan, list, item: id, send, close }) {
    const item = findItem(plan, list, id)
    const [note, setNote] = useState(item?.note || '')
    const [link, setLink] = useState(item?.link || '')
    if (!item) return null
    const save = (e) => {
        e.preventDefault()
        const op = { op: 'item.set', list, item: id }
        if (note.trim() !== (item.note || '')) op.note = note.trim()
        if (link.trim() !== (item.link || '')) op.link = link.trim()
        if ('note' in op || 'link' in op) send([op])
        close()
    }
    return (
        <Dialog title={item.text} close={close}>
            <form className="shoot-form" onSubmit={save}>
                <label>Note
                    <input value={note} maxLength={300} placeholder="e.g. Ani brings it · It's in the van" onChange={(e) => setNote(e.target.value)} />
                </label>
                <label>Link (shop, listing or 3D print)
                    <input value={link} type="url" inputMode="url" placeholder="Paste a link" onChange={(e) => setLink(e.target.value)} />
                </label>
                <label className="shoot-inline">
                    <input type="checkbox" checked={item.done} onChange={() => send([{ op: 'item.set', list, item: id, done: !item.done }])} />
                    Ready
                </label>
                <div className="shoot-form-actions">
                    <button type="button" className="shoot-danger" onClick={() => {
                        if (window.confirm(`Remove “${item.text}” for everyone?`)) {
                            send([{ op: 'item.remove', list, item: id }])
                            close()
                        }
                    }}>Remove</button>
                    <button type="submit" className="shoot-primary">Save</button>
                </div>
            </form>
        </Dialog>
    )
}

function AddDialog({ list, title, send, close }) {
    const [text, setText] = useState('')
    const add = (e) => {
        e.preventDefault()
        if (text.trim()) send([{ op: 'item.add', list, id: newId(), text: text.trim() }])
        close()
    }
    return (
        <Dialog title={title} close={close}>
            <form className="shoot-form" onSubmit={add}>
                <label>What is it?
                    <input value={text} maxLength={300} placeholder="e.g. Hair gel" onChange={(e) => setText(e.target.value)} />
                </label>
                <div className="shoot-form-actions">
                    <button type="button" onClick={close}>Cancel</button>
                    <button type="submit" className="shoot-primary" disabled={!text.trim()}>Add</button>
                </div>
            </form>
        </Dialog>
    )
}

function ActorDialog({ member, send, close }) {
    const [form, setForm] = useState({ name: member?.name || '', callTime: member?.callTime || '', outfit: member?.outfit || '', sounds: member?.sounds || '' })
    if (!member) return null
    const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
    const save = (e) => {
        e.preventDefault()
        const op = { op: 'cast.set', cast: member.id }
        for (const field of Object.keys(form)) if (form[field] !== (member[field] || '')) op[field] = form[field]
        if (Object.keys(op).length > 2) send([op])
        close()
    }
    return (
        <Dialog title={member.role} close={close}>
            <form className="shoot-form" onSubmit={save}>
                <label>Performer name<input value={form.name} maxLength={300} placeholder="Add a name" onChange={set('name')} /></label>
                <label>Call time<input value={form.callTime} maxLength={20} placeholder="e.g. 11:40" onChange={set('callTime')} /></label>
                <label>Outfit<textarea value={form.outfit} maxLength={1000} onChange={set('outfit')} /></label>
                <label>Sounds<textarea value={form.sounds} maxLength={300} onChange={set('sounds')} /></label>
                <div className="shoot-form-actions">
                    <button type="button" onClick={close}>Cancel</button>
                    <button type="submit" className="shoot-primary">Save</button>
                </div>
            </form>
        </Dialog>
    )
}

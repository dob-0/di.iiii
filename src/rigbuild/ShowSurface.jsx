import { useCallback, useEffect, useMemo, useState } from 'react'
import { SIGN_IN_SEGMENT, buildAppSpacePath, buildVanityProjectPath } from '../utils/spaceRouting.js'
import { buildCardsPath } from './cardsRouting.js'
import { CHOOSERS, ShowError, chooseCue, choosersLabel, durationWords, fetchShow, groupByAct, liveOf, setChoosers, swatchWords, youWords } from './showApi.js'
import './show.css'

// THE SHOW PAGE — /{space}/show/{project} (docs/architecture/RIG_BUILD.md §24).
//
// Owner, 2026-10-08: "I need a light-show UI for everyone, so they can see and choose the
// cue." One column of big cards on a black page, made for a phone in a dark hall: the
// live cue at the top (name, act, what is next and when), then every cue of the show,
// tappable. A tap asks the server to send that cue to Light; the server alone says whether
// this person may (the operator's setting: team · everyone · operator only), refuses a
// laser moment for everyone, and holds one choice per cooldown. Every open page reads the
// same answer back once a second, so a choice on one phone shows on all of them.
//
// No WebGL, no project document, no socket: one small JSON a second. The room is a link.

const POLL_MS = 1000
const buildSignInPath = () => `${buildAppSpacePath(null).replace(/\/$/, '')}/${SIGN_IN_SEGMENT}`
const NAME_KEY = 'di.show.name'

const readName = () => {
    try { return window.localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}
const keepName = (value) => {
    try { window.localStorage.setItem(NAME_KEY, value) } catch { /* private window: the name lives for this page only */ }
}

const useNow = () => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 250)
        return () => clearInterval(timer)
    }, [])
    return now
}

function Swatch({ swatch }) {
    return (
        <span className="show-swatch" role="img" aria-label={`colour: ${swatchWords(swatch)}`}>
            {swatch.length
                ? swatch.slice(0, 2).map((s) => <span key={s.hex} style={{ background: s.hex }} />)
                : <span className="is-dark" />}
        </span>
    )
}

function CueCard({ cue, live, next, block, sending, onChoose }) {
    const laser = Boolean(cue.laser)
    const disabled = laser || Boolean(block) || sending
    const state = live ? 'is-live' : next ? 'is-next' : ''
    return (
        <li className={`show-cue ${state}${laser ? ' is-laser' : ''}`}>
            <button type="button" className="show-cue__button" disabled={disabled} aria-current={live ? 'true' : undefined}
                onClick={() => onChoose(cue)} data-cue={cue.index}>
                <span className="show-cue__head">
                    <span className="show-cue__n">{cue.index + 1}</span>
                    <Swatch swatch={cue.swatch} />
                    {live ? <span className="show-cue__tag is-live">live</span> : null}
                    {next && !live ? <span className="show-cue__tag">next</span> : null}
                </span>
                <span className="show-cue__name">{cue.title || cue.name}</span>
                <span className="show-cue__line">{laser ? 'laser moment — operator only' : cue.line}</span>
            </button>
        </li>
    )
}

export default function ShowSurface({ spaceId, projectId }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(null) // { status, message }
    const [notice, setNotice] = useState('')
    // A notice answers one tap; it goes after a few seconds, or a phone left on the page would
    // keep saying "on Light now" about a cue the list moved past long ago (seen 2026-10-08).
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
    }, [notice])
    const [sending, setSending] = useState(false)
    const [name, setName] = useState(readName)
    const now = useNow()

    const take = useCallback((body, t0, t1) => {
        if (!body) return
        // The server's clock minus ours, from this one round trip (its midpoint): the clock
        // fallback and every countdown read the server's time, not this phone's.
        const offset = Number.isFinite(body.now) ? body.now - (t0 + t1) / 2 : 0
        setData({ ...body, receivedAt: t1, offset })
        setError(null)
    }, [])

    useEffect(() => {
        let gone = false
        let controller = null
        const tick = async () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            controller?.abort()
            controller = new AbortController()
            const t0 = Date.now()
            try {
                const body = await fetchShow(spaceId, projectId, { signal: controller.signal })
                if (!gone) take(body, t0, Date.now())
            } catch (e) {
                if (gone || e?.name === 'AbortError') return
                setError({ status: e instanceof ShowError ? e.status : 0, message: e instanceof ShowError ? e.message : 'The server does not answer. Trying again…' })
            }
        }
        tick()
        const timer = setInterval(tick, POLL_MS)
        const onVisible = () => { if (document.visibilityState === 'visible') tick() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { gone = true; clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', onVisible) }
    }, [spaceId, projectId, take])

    const serverNow = now + (data?.offset || 0)
    const live = useMemo(() => liveOf(data, serverNow), [data, serverNow])
    const cues = useMemo(() => data?.cues || [], [data])
    const liveCue = live ? cues[live.index] : null
    const nextCue = live && live.nextIndex >= 0 ? cues[live.nextIndex] : null
    const cooldownLeftMs = data ? Math.max(0, (data.control?.cooldownLeftMs || 0) - (now - data.receivedAt)) : 0
    const block = data ? (data.you?.block === 'cooldown' && cooldownLeftMs <= 0 ? '' : data.you?.block) : 'loading'
    const lightBlocked = data && (data.light?.state === 'none' || data.clock?.showSource === 'clock')
    const cardBlock = lightBlocked ? 'no-light' : block
    const groups = useMemo(() => groupByAct(cues), [cues])
    const roomHref = data ? buildVanityProjectPath(spaceId, data.project?.slug || data.project?.id || projectId) : null

    const choose = useCallback(async (cue) => {
        if (cue.laser) { setNotice('Laser moment — operator only.'); return }
        setSending(true)
        setNotice(`Sending ${cue.index + 1} · ${cue.title || cue.name}…`)
        const t0 = Date.now()
        try {
            const body = await chooseCue(spaceId, projectId, { index: cue.index, cueId: cue.id, name: name.trim() })
            take(body, t0, Date.now())
            setNotice(`${cue.index + 1} · ${cue.title || cue.name} — on Light now.`)
        } catch (e) {
            if (e instanceof ShowError && e.body?.cues) take(e.body, t0, Date.now())
            setNotice(e.message || 'Light did not take it.')
        } finally {
            setSending(false)
        }
    }, [spaceId, projectId, name, take])

    const changeChoosers = useCallback(async (value) => {
        const t0 = Date.now()
        try {
            take(await setChoosers(spaceId, projectId, value), t0, Date.now())
            setNotice(`Who may choose: ${choosersLabel(value)}.`)
        } catch (e) { setNotice(e.message) }
    }, [spaceId, projectId, take])

    if (!data && error) {
        const sentence = error.status === 401 ? 'Sign in to see this show.'
            : error.status === 403 ? 'This show is private to its space.'
                : error.status === 404 ? 'There is no show at this address.'
                    : error.message
        return (
            <main className="show-page">
                <p className="show-empty" role="alert">{sentence}</p>
                {error.status === 401 || error.status === 403 ? <p className="show-empty"><a className="show-link" href={buildSignInPath()}>sign in</a></p> : null}
            </main>
        )
    }
    if (!data) return <main className="show-page" aria-busy="true"><p className="show-empty">Loading the show…</p></main>

    const lightWords = data.light.state === 'none' ? 'the clock (no Light on this di.iiii)'
        : data.light.otherShow ? "Light — running another space's show"
            : data.light.otherList ? "Light — playing another project's list"
                : data.light.state === 'closed' ? 'Light — not open yet'
                    : live?.source === 'light' ? (live.running ? 'Light — playing' : 'Light — stopped') : 'Light — not playing this show'

    return (
        <main className="show-page" data-testid="show-page">
            <header className="show-top">
                <div className="show-top__title">
                    <span className="show-top__mark" aria-hidden="true" />
                    <span>show</span>
                    <span className="show-top__project">{data.project.title}</span>
                </div>
                {roomHref ? <a className="show-link" href={roomHref}>see the room</a> : null}
            </header>

            <section className="show-live" aria-live="polite" aria-label="On now">
                {liveCue ? (
                    <>
                        <div className="show-live__meta">
                            <span>{live.index + 1} / {cues.length}</span>
                            {liveCue.act ? <span>act {liveCue.act}</span> : null}
                            <Swatch swatch={liveCue.swatch} />
                        </div>
                        <h1 className="show-live__name">{liveCue.title || liveCue.name}</h1>
                        <p className="show-live__next">
                            {nextCue ? <>next: <b>{nextCue.title || nextCue.name}</b>{live.nextInMs != null ? ` · in ${durationWords(live.nextInMs)}` : ' · waits for GO'}</> : 'the list stops here'}
                        </p>
                        <p className="show-live__by">{live.by ? `chosen by ${live.by}` : live.source === 'clock' ? 'played by the clock' : 'the list plays on by itself'}</p>
                    </>
                ) : (
                    <>
                        <h1 className="show-live__name is-quiet">Nothing on yet</h1>
                    </>
                )}
                <p className="show-live__source">{lightWords}</p>
            </section>

            <p className={`show-you${block && block !== 'cooldown' ? ' is-blocked' : ''}`} data-block={block || ''}>{youWords(data, cooldownLeftMs)}</p>

            {data.you.who === 'operator' ? (
                <section className="show-operator" aria-label="Operator">
                    <span className="show-operator__label">who may choose</span>
                    <div className="show-seg" role="radiogroup" aria-label="Who may choose">
                        {CHOOSERS.map((value) => (
                            <button key={value} type="button" role="radio" aria-checked={data.control.choosers === value}
                                className={data.control.choosers === value ? 'is-on' : ''} onClick={() => changeChoosers(value)}>
                                {choosersLabel(value)}
                            </button>
                        ))}
                    </div>
                    <details className="show-operator__more">
                        <summary>{data.you.authOff ? 'sign-in is off here — read this' : 'about lasers and choosing'}</summary>
                        {data.you.authOff ? <p className="show-operator__note">Sign-in is off on this di.iiii, so everyone who opens this page is the operator. For a night with guests, start it with <code>di up --lan --guests</code>.</p> : null}
                        <p className="show-operator__note">Laser moments are fired from <a href={buildCardsPath(spaceId, data.project.id)}>the cards</a> or Light, after the laser safety sign-off — never from this page. One choice per {durationWords(data.control.cooldownMs)}, for everybody.</p>
                    </details>
                </section>
            ) : null}

            {notice ? <p className="show-notice" role="status">{notice}</p> : null}

            {cues.length ? groups.map((group, g) => (
                <section key={`${group.act || 'none'}-${g}`} className="show-act" aria-label={group.act ? `Act ${group.act}` : 'Cues'}>
                    {group.act ? <h2 className="show-act__title">act {group.act}</h2> : null}
                    <ol className="show-cues">
                        {group.cues.map((cue) => (
                            <CueCard key={cue.id} cue={cue} live={live?.index === cue.index} next={live?.nextIndex === cue.index}
                                block={cardBlock} sending={sending} onChoose={choose} />
                        ))}
                    </ol>
                </section>
            )) : <p className="show-empty">This project has no cue list yet. The cue list is made on <a href={buildCardsPath(spaceId, data.project.id)}>the cards</a>.</p>}

            <footer className="show-foot">
                <label className="show-name">
                    <span>your name, shown when you choose</span>
                    <input value={name} maxLength={24} autoComplete="nickname" placeholder="optional"
                        onChange={(e) => { setName(e.target.value); keepName(e.target.value) }} />
                </label>
                {error ? <p className="show-notice is-error" role="alert">{error.message}</p> : null}
            </footer>
        </main>
    )
}

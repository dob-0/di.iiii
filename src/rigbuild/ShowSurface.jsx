import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShowFeed } from './useShowFeed.js'
import { SIGN_IN_SEGMENT, buildAppSpacePath, buildVanityProjectPath } from '../utils/spaceRouting.js'
import { buildCardsPath } from './cardsRouting.js'
import { CHOOSERS, ShowError, chooseCue, choosersLabel, cleanName, durationWords, liveOf, setAutoplay, setChoosers, swatchWords, youWords } from './showApi.js'
import './show.css'

// THE SHOW PAGE (simple buttons, 2026-10-09)
//
// Owner: "I need so simple buttons: you press, the scene changes, and auto play stops.
// A cue is just like lego bricks, one scene after the other." So: a grid of big bricks, each
// a scene's name and its colours; the live one marked; a press changes the scene and it
// HOLDS until someone presses another (the desk's runner no longer advances by itself unless
// the operator switches "play in order" on). Who may choose lives behind one small settings
// button. The older notes below describe the first version.
//
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

function Brick({ cue, live, block, sending, onChoose }) {
    const laser = Boolean(cue.laser)
    const disabled = laser || Boolean(block) || sending
    return (
        <li className={`show-brick${live ? ' is-live' : ''}${laser ? ' is-laser' : ''}`}>
            <button type="button" className="show-brick__button" disabled={disabled} aria-current={live ? 'true' : undefined}
                onClick={() => onChoose(cue)} data-cue={cue.index}>
                <Swatch swatch={cue.swatch} />
                <span className="show-brick__name">{cue.title || cue.name}</span>
                {live ? <span className="show-brick__tag">live</span> : null}
                {laser && !live ? <span className="show-brick__tag is-laser">operator only</span> : null}
            </button>
        </li>
    )
}

export default function ShowSurface({ spaceId, projectId }) {
    const { data, error, take } = useShowFeed(spaceId, projectId)
    const [notice, setNotice] = useState('')
    // A notice answers one press; it goes after a few seconds.
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
    }, [notice])
    const [sending, setSending] = useState(false)
    const [mine, setMine] = useState(null) // the scene this person chose last: { title, at }
    const [name, setName] = useState(readName)
    const [settings, setSettings] = useState(false)
    const now = useNow()

    useEffect(() => {
        const before = document.title
        document.title = data ? `${data.project.title} — show` : error?.status === 404 ? 'No show here' : 'Show'
        return () => { document.title = before }
    }, [data, error?.status])

    const serverNow = now + (data?.offset || 0)
    const live = useMemo(() => liveOf(data, serverNow), [data, serverNow])
    const cues = useMemo(() => data?.cues || [], [data])
    const cooldownLeftMs = data ? Math.max(0, (data.control?.cooldownLeftMs || 0) - Math.max(0, now - data.receivedAt)) : 0
    const block = data ? (data.you?.block === 'cooldown' && cooldownLeftMs <= 0 ? '' : data.you?.block) : 'loading'
    const lightBlocked = data && (data.light?.state === 'none' || data.clock?.showSource === 'clock')
    const lightBusy = Boolean(data && (data.light?.otherList || data.light?.otherShow))
    const cardBlock = lightBlocked ? 'no-light' : lightBusy ? 'busy' : block
    const roomHref = data ? buildVanityProjectPath(spaceId, data.project?.slug || data.project?.id || projectId) : null

    const choose = useCallback(async (cue) => {
        if (cue.laser) { setNotice('Laser scene — operator only.'); return }
        setSending(true)
        const t0 = Date.now()
        try {
            const body = await chooseCue(spaceId, projectId, { index: cue.index, cueId: cue.id, name: cleanName(name) })
            take(body, t0, Date.now())
            setMine({ title: cue.title || cue.name, at: Date.now() })
            setNotice('')
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

    const changeAutoplay = useCallback(async (on) => {
        const t0 = Date.now()
        try {
            take(await setAutoplay(spaceId, projectId, on), t0, Date.now())
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
                <p className="show-empty"><a className="show-link" href={buildAppSpacePath(spaceId)}>back to the space</a></p>
            </main>
        )
    }
    if (!data) return <main className="show-page" aria-busy="true"><p className="show-empty">Loading the show…</p></main>

    const operator = data.you.who === 'operator'
    // One short line, only when a press would do nothing, and why.
    const why = block && block !== 'cooldown' ? youWords(data, cooldownLeftMs, mine) : (cardBlock === 'no-light' || cardBlock === 'busy' ? youWords(data, cooldownLeftMs, mine) : '')
    const wait = cooldownLeftMs > 0 ? youWords(data, cooldownLeftMs, mine) : ''

    return (
        <main className={`show-page${error ? ' is-offline' : ''}`} data-testid="show-page">
            {error ? <p className="show-offline" role="alert">{error.status ? error.message : 'No link to the server — what you see is old. Trying again…'}</p> : null}
            <header className="show-top">
                <h1 className="show-top__title">
                    <span className="show-top__mark" aria-hidden="true" />
                    <span className="show-top__project">{data.project.title}</span>
                </h1>
                {operator ? (
                    <button type="button" className="show-link" aria-expanded={settings} onClick={() => setSettings((o) => !o)}>settings</button>
                ) : null}
            </header>

            {settings && operator ? (
                <section className="show-operator" aria-label="Settings">
                    <span className="show-operator__label">who may press</span>
                    <div className="show-seg" role="radiogroup" aria-label="Who may choose">
                        {CHOOSERS.map((value) => (
                            <button key={value} type="button" role="radio" aria-checked={data.control.choosers === value}
                                className={data.control.choosers === value ? 'is-on' : ''} onClick={() => changeChoosers(value)}>
                                {choosersLabel(value)}
                            </button>
                        ))}
                    </div>
                    <label className="show-switch">
                        <input type="checkbox" checked={Boolean(live?.autoplay)} disabled={live?.source !== 'light'} onChange={(e) => changeAutoplay(e.target.checked)} />
                        <span>play in order</span>
                    </label>
                    <label className="show-name">
                        <span>your name, shown when you press</span>
                        <input value={name} maxLength={24} autoComplete="nickname" placeholder="optional"
                            onChange={(e) => { setName(e.target.value); keepName(e.target.value) }} />
                    </label>
                    <p className="show-operator__note">One press per {durationWords(data.control.cooldownMs)}, for everybody. Laser scenes are never fired from this page.{data.you.authOff ? ' Sign-in is off here, so everyone is the operator.' : ''}</p>
                    {roomHref ? <a className="show-link" href={roomHref}>see the room</a> : null}
                </section>
            ) : null}

            {notice || why || wait ? <p className={`show-notice${why ? ' is-blocked' : ''}`} role="status" data-block={block || ''}>{notice || why || wait}</p> : null}

            {cues.length ? (
                <ol className="show-bricks" aria-label="Scenes">
                    {cues.map((cue) => (
                        <Brick key={cue.id} cue={cue} live={live?.index === cue.index} block={cardBlock} sending={sending} onChoose={choose} />
                    ))}
                </ol>
            ) : <p className="show-empty">This project has no scenes yet. They are made on <a href={buildCardsPath(spaceId, data.project.id)}>the cards</a>.</p>}
        </main>
    )
}

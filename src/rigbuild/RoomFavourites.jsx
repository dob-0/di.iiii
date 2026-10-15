import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShowError, blockOf, chooseCue, cleanName, isLiveScene, liveOf, sceneButtons } from './showApi.js'
import { deskCues } from './cueRun.js'
import { useShowFeed } from './useShowFeed.js'
import useRememberedOpen from '../utils/rememberedOpen.js'
import { CHIP, ACTIVE, INK, LINE } from './chromeStyle.js'

// THE SCENE STRIP of the room page (was the ten favourite bricks; owner, 2026-10-15: "why are the scenes not selectable; make the dev
// version multi-page for now"). It lists ALL scenes of the show, ten to a page with ‹ › and "n / N" (a page, not a scroll: ten
// cards never move under a finger or a mouse, and "page 4 of 5" says where you are in a 50-scene show), and it opens on the page of the
// scene that is playing. The playing scene is read from the desk's runner where a desk drives the room (the SAME read the SHOW chip
// makes, deskCues.read once a second), from the show clock where the clock does (`playingIndex`, the chip's own), else from the server's show answer - never a card the chip does not agree with.
// The strip stays behind one small control (owner 2026-10-13: the scene is the page; rememberedOpen.js, remembered for that viewer only).
// A click sends that scene to Light through the SAME POST .../choose (on a show that plays by its own clock there is no runner: the click is the chip's per-viewer PREVIEW) as the list and the show page, so the server alone decides who
// may (the cooldown, the operator's lock); a viewer who may not gets a card that does nothing and says so on hover. A laser scene is
// never sent (the server refuses it). The audience playing is a FUTURE plan (owner): `audiencePlays` is its one hook - false today, so
// only what the server lets this viewer do is clickable; true will hand every click to the server, which still decides.
// Rectangles, 0-2 px, ember red for the playing one, targets >= 44 px.
export const FAVOURITES_EVENT = 'di:show-answer'
export const PAGE_SIZE = 10
export const WATCH_WORDS = 'the show runs on its own clock'
const EMBER = 'var(--di-danger, #f25f5c)'
// A phone-wide screen wraps ten buttons to 2 x 5; wider screens keep one row. Measured by moxirMotion tests and a real browser.
const WIDE_QUERY = '(min-width: 720px)'
const useWide = () => {
    const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : true)
    const [wide, setWide] = useState(read)
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const mq = window.matchMedia(WIDE_QUERY)
        const on = () => setWide(mq.matches)
        on()
        mq.addEventListener?.('change', on)
        return () => mq.removeEventListener?.('change', on)
    }, [])
    return wide
}

export default function RoomFavourites({ spaceId, projectId, bottom = '5.2rem', driver = '', playingIndex = null, previewLook = null, onPreview = null, audiencePlays = false }) {
    const { data, take } = useShowFeed(spaceId, projectId)
    const [sending, setSending] = useState(null)
    const [notice, setNotice] = useState('')
    const [now, setNow] = useState(() => Date.now())
    const rowRef = useRef(null)
    const wide = useWide()
    const [lift, setLift] = useState(null)
    const [open, toggleOpen] = useRememberedOpen('bricks')
    const [picked, setPicked] = useState(null) // a page the viewer turned to; null = the page of the playing scene
    const [desk, setDesk] = useState(null)
    // Where a desk drives the room the playing scene is the desk runner's: the chip's own read, so card and chip cannot disagree.
    const [deskAgain, setDeskAgain] = useState(0)
    useEffect(() => {
        if (driver !== 'desk') { setDesk(null); return undefined }
        let gone = false
        const tick = async () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            try { const c = await deskCues.read(); if (!gone) setDesk(c) } catch { if (!gone) setDesk(null) }
        }
        tick()
        const timer = setInterval(tick, 1000)
        return () => { gone = true; clearInterval(timer) }
    }, [driver, deskAgain])
    // Sit just above the view bar (Floor / DJ / Top ...), wherever it stands on this screen: measured, never covering it.
    useEffect(() => {
        const place = () => {
            const bar = document.querySelector('[data-smart-view-bar]')
            const parent = rowRef.current?.offsetParent
            if (!bar || !parent) return setLift(null)
            const gap = parent.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8
            setLift((old) => (old != null && Math.abs(old - gap) < 1 ? old : Math.max(8, Math.round(gap))))
        }
        place()
        const timer = setInterval(place, 1000)
        window.addEventListener('resize', place)
        return () => { clearInterval(timer); window.removeEventListener('resize', place) }
    }, [data])
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 500)
        return () => clearInterval(timer)
    }, [])
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 5000)
        return () => clearTimeout(timer)
    }, [notice])
    // The list (stars) and this row read the same server answer; a star set in the list shows here at once.
    useEffect(() => {
        const onAnswer = (event) => {
            const d = event.detail
            if (d?.body && d.spaceId === spaceId && d.projectId === projectId) take(d.body, d.t0, d.t1)
        }
        window.addEventListener(FAVOURITES_EVENT, onAnswer)
        return () => window.removeEventListener(FAVOURITES_EVENT, onAnswer)
    }, [spaceId, projectId, take])

    const serverNow = now + (data?.offset || 0)
    const feedLive = useMemo(() => liveOf(data, serverNow), [data, serverNow])
    const live = useMemo(() => (driver === 'clock' && playingIndex != null ? { index: playingIndex } : driver === 'desk' && desk && desk.project === projectId_(data, projectId) && desk.index >= 0 ? { index: desk.index } : feedLive), [driver, playingIndex, desk, data, projectId, feedLive])
    const cues = useMemo(() => data?.cues || [], [data?.cues])
    const buttons = useMemo(() => sceneButtons(cues), [cues])
    const pages = Math.max(1, Math.ceil(buttons.length / PAGE_SIZE))
    const livePos = buttons.findIndex((cue) => isLiveScene(cue, live, cues))
    const page = Math.min(pages - 1, picked != null ? picked : Math.max(0, Math.floor(livePos / PAGE_SIZE)))
    const playingPage = livePos >= 0 ? Math.floor(livePos / PAGE_SIZE) : null
    const shown = buttons.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    const cooldownLeftMs = data ? Math.max(0, (data.control?.cooldownLeftMs || 0) - Math.max(0, now - data.receivedAt)) : 0
    const lightBlocked = Boolean(data && (data.light?.state === 'none' || data.clock?.showSource === 'clock'))
    const lightBusy = Boolean(data && (data.light?.otherList || data.light?.otherShow))
    const youBlock = blockOf(data, cooldownLeftMs)
    // not this viewer's to press (the server's word): the card does nothing and says so. The future audience-plays hook lifts it.
    const watching = Boolean(youBlock) && youBlock !== 'cooldown' && !audiencePlays

    const choose = useCallback(async (cue) => {
        if (cue.laser || sending != null || watching) return
        // A show that plays by its own clock is not Light's: there is no runner to GO (the server answers 'no-light' to every card). The click
        // shows that scene to THIS viewer as the chip's preview ("PREVIEW · name · the show is on ..."); the clock keeps running for everyone else.
        if (onPreview) { onPreview(String(cue.lookId || '').replace(/^rig-/, '') || null); return }
        setSending(cue.index)
        setNotice('')
        const t0 = Date.now()
        try {
            take(await chooseCue(spaceId, projectId, { index: cue.index, cueId: cue.id, name: cleanName(readName()) }), t0, Date.now())
            setDeskAgain((n) => n + 1) // read the desk now, not in a second
        } catch (e) {
            if (e instanceof ShowError && e.body?.cues) take(e.body, t0, Date.now())
            setNotice(e.message || 'Light did not take it.')
        } finally {
            setSending(null)
        }
    }, [spaceId, projectId, sending, watching, take, onPreview])

    if (!data || !buttons.length) return null
    return (
        <div ref={rowRef} data-testid="room-favourites" style={{ ...rowStyle, bottom: lift != null ? lift : bottom }}>
            {notice ? <p role="status" style={noticeStyle}>{notice}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button type="button" data-testid="room-favourites-toggle" aria-expanded={open} aria-controls="room-favourites-list" onClick={toggleOpen}
                    title={open ? 'Hide the scenes' : 'Show the scenes: tap one to change the light'}
                    style={{ ...CHIP, pointerEvents: 'auto', marginBottom: open ? 4 : 0, color: open ? ACTIVE : INK }}>
                    Scenes <span aria-hidden="true" style={{ opacity: 0.7 }}>{open ? '▾' : '▴'}</span>
                </button>
            </div>
            {open && pages > 1 ? (
                <div data-testid="room-scenes-pager" style={pagerStyle}>
                    <button type="button" aria-label="previous scenes" data-testid="room-scenes-prev" disabled={page === 0} onClick={() => setPicked(page - 1)} style={pageButton}>‹</button>
                    <span data-testid="room-scenes-page" aria-live="polite" style={{ minWidth: '4.5rem', textAlign: 'center', fontSize: 'var(--di-text-3, 0.76rem)', fontWeight: 600 }}>{page + 1} / {pages}</span>
                    {playingPage != null && playingPage !== page ? (
                        <button type="button" data-testid="room-scenes-now" title="Back to the scene that is playing" onClick={() => setPicked(null)} style={{ ...pageButton, padding: '0 var(--di-space-3, 12px)', minWidth: 44, marginLeft: 4 }}>playing: page {playingPage + 1}</button>
                    ) : null}
                    <button type="button" aria-label="next scenes" data-testid="room-scenes-next" disabled={page >= pages - 1} onClick={() => setPicked(page + 1)} style={pageButton}>›</button>
                </div>
            ) : null}
            {open ? <ul id="room-favourites-list" aria-label="scenes" data-cols={wide ? 10 : 5} style={{ ...listStyle, gridTemplateColumns: `repeat(${wide ? 10 : 5}, minmax(0, 1fr))` }}>
                {shown.map((cue) => {
                    const isLive = isLiveScene(cue, live, cues)
                    const previewed = Boolean(previewLook) && String(cue.lookId || '').replace(/^rig-/, '') === previewLook
                    const disabled = Boolean(cue.laser) || (!onPreview && (lightBlocked || lightBusy || youBlock === 'cooldown')) || sending != null
                    const name = cue.title || cue.name
                    const tip = watching ? `${name} — ${WATCH_WORDS}` : cue.laser ? `${name} — operator only` : name
                    return (
                        <li key={cue.lookId} style={{ minWidth: 0 }}>
                            <button type="button" disabled={disabled} aria-disabled={watching || undefined} data-fav={cue.lookId} data-cue={cue.index} aria-current={isLive ? 'true' : undefined} aria-pressed={previewed || undefined} title={tip}
                                onClick={() => choose(cue)}
                                style={{ ...brickStyle, cursor: disabled || watching ? 'default' : 'pointer', opacity: (disabled || watching) && !isLive ? 0.55 : 1, borderColor: isLive ? EMBER : previewed ? ACTIVE : LINE, background: isLive ? 'rgba(var(--di-danger-rgb, 242, 95, 92), 0.22)' : 'var(--di-scrim-strong, rgba(4, 6, 14, 0.9))', boxShadow: isLive ? `inset 0 0 0 1px ${EMBER}` : 'none' }}>
                                <span aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
                                    {(cue.swatch?.length ? cue.swatch.slice(0, 2) : [{ hex: '#000' }]).map((s, i) => (
                                        <span key={i} style={{ width: 12, height: 8, background: s.hex, border: '1px solid rgba(255,255,255,0.3)' }} />
                                    ))}
                                </span>
                                <span style={{ fontSize: 'var(--di-text-2, 0.625rem)', fontWeight: isLive ? 700 : 500, lineHeight: 1.15, maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
                            </button>
                        </li>
                    )
                })}
            </ul> : null}
        </div>
    )
}

const projectId_ = (data, routeProject) => data?.project?.id || routeProject
const NAME_KEY = 'di.show.name'
const readName = () => {
    try { return window.localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

const rowStyle = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 19,
    width: 'min(56rem, calc(100vw - 2rem))',
    pointerEvents: 'none', // the empty width between the control and the bricks belongs to the scene
    color: '#f5f7fa'
}
const pagerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 4, pointerEvents: 'auto', color: INK }
const pageButton = { ...CHIP, minWidth: 44, padding: 0, pointerEvents: 'auto' }
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, pointerEvents: 'auto' }
const brickStyle = {
    width: '100%',
    minHeight: 48,
    padding: '0.25rem 0.2rem',
    border: '1px solid',
    borderRadius: '2px',
    color: 'inherit',
    font: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    touchAction: 'manipulation',
    backdropFilter: 'blur(8px)'
}
const noticeStyle = { pointerEvents: 'auto', margin: '0 0 4px', padding: '0.3rem 0.5rem', background: EMBER, color: '#000', fontWeight: 700, fontSize: 'var(--di-text-3, 0.76rem)', borderRadius: '2px' }

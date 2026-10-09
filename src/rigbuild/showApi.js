import { apiBaseUrl } from '../services/apiClient.js'
import { showOf, showStateAt } from './showClock.js'

// THE SHOW PAGE'S SIDE of serverXR/src/routes/showRoutes.js (RIG_BUILD.md §24): the three
// calls, and the pure words the page shows. The server decides who may choose; nothing
// here does — `you.block` is read, never computed.

const showUrl = (spaceId, projectId) => `${apiBaseUrl}/api/spaces/${encodeURIComponent(spaceId)}/show/${encodeURIComponent(projectId)}`

export class ShowError extends Error {
    constructor(message, status, body = null) {
        super(message)
        this.status = status
        this.body = body
    }
}

const readAnswer = async (response) => {
    let body = null
    try { body = await response.json() } catch { body = null }
    if (!response.ok) throw new ShowError(body?.error || `The server answered ${response.status}.`, response.status, body)
    return body
}

export const fetchShow = async (spaceId, projectId, { signal } = {}) => readAnswer(await fetch(showUrl(spaceId, projectId), { signal, cache: 'no-store', credentials: 'same-origin' }))

export const chooseCue = async (spaceId, projectId, { index, cueId, name }) => readAnswer(await fetch(`${showUrl(spaceId, projectId)}/choose`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, cueId, ...(name ? { name } : {}) })
}))

export const setChoosers = async (spaceId, projectId, choosers) => readAnswer(await fetch(`${showUrl(spaceId, projectId)}/control`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choosers })
}))

export const setFavourites = async (spaceId, projectId, favourites) => readAnswer(await fetch(`${showUrl(spaceId, projectId)}/favourites`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favourites })
}))

/** The favourite buttons: the scene button of each favourite look id, in the server's order; ids no longer in the show drop out. */
export const favouriteButtons = (cues, ids) => {
    const byLook = new Map(sceneButtons(cues).filter((c) => c.lookId).map((c) => [c.lookId, c]))
    return (ids || []).map((id) => byLook.get(id)).filter(Boolean)
}

/** The list after a star is toggled: off if starred, else appended (when full the oldest star leaves). The server checks it again. */
export const toggledFavourites = (ids, lookId, max = 5) => {
    const list = Array.isArray(ids) ? ids : []
    if (list.includes(lookId)) return list.filter((id) => id !== lookId)
    return [...list, lookId].slice(-max)
}

export const setAutoplay = async (spaceId, projectId, autoplay) => readAnswer(await fetch(`${showUrl(spaceId, projectId)}/autoplay`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoplay: autoplay === true })
}))

/** "9 s", "1 min 20 s". */
export const durationWords = (ms) => {
    const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000))
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
}

/**
 * What is on now, from whichever source drives this show: Light's cue runner (a local
 * di.iiii, `data.live`), or — where there is no Light (a hosted tier) or the show plays by
 * its own clock — the clock every viewer computes the same way (showClock.js).
 * `now` is this browser's clock already corrected to the server's.
 */
/**
 * The buttons: one per LOOK, not one per cue. A press holds (no auto-advance), so four cues that
 * all play "the black" are one button, not four (owner 10-09: "so simple buttons"). The first cue
 * of each look stands for it, in list order; `isLiveScene` marks it live whichever of its cues
 * the desk is on. A cue with no lookId stays its own button.
 */
export const sceneButtons = (cues) => {
    const seen = new Set()
    return (cues || []).filter((cue) => {
        if (!cue?.lookId) return true
        if (seen.has(cue.lookId)) return false
        seen.add(cue.lookId)
        return true
    })
}

export const isLiveScene = (cue, live, cues) => {
    if (!live || live.index == null || !cue) return false
    if (live.index === cue.index) return true
    const liveCue = (cues || []).find((c) => c.index === live.index)
    return Boolean(liveCue && cue.lookId && liveCue.lookId === cue.lookId)
}

export const liveOf = (data, now) => {
    if (!data) return null
    if (data.live) {
        const elapsed = Math.max(0, now - (data.now || now))
        return {
            source: 'light',
            index: data.live.index,
            nextIndex: data.live.nextIndex,
            nextInMs: data.live.nextInMs == null ? null : Math.max(0, data.live.nextInMs - elapsed),
            running: data.live.running,
            autoplay: data.live.autoplay === true,
            by: data.live.by || null,
            missing: data.live.missing || 0
        }
    }
    const byClock = data.light?.state === 'none' || data.clock?.showSource === 'clock'
    const show = byClock ? showOf({ mappingState: data.clock }) : null
    const state = show ? showStateAt(show, now) : null
    if (!state) return null
    // The clock's list is the document's own cues with a look, the order the page shows.
    const nextIndex = state.ended ? -1 : (state.index + 1 < state.n ? state.index + 1 : (show.loop ? 0 : -1))
    return { source: 'clock', index: state.index, nextIndex: state.nextInMs == null ? -1 : nextIndex, nextInMs: state.nextInMs, running: !state.ended, autoplay: true, by: null, missing: 0 }
}

const CHOOSERS_WORDS = {
    team: 'the team',
    everyone: 'everyone',
    operator: 'the operator only'
}

/** The line that tells this person whether a tap will do anything, and why not. */
export const youWords = (data, cooldownLeftMs = 0, mine = null) => {
    if (!data) return ''
    const who = data.you?.who
    const block = data.you?.block || ''
    const choosers = CHOOSERS_WORDS[data.control?.choosers] || 'the team'
    if (data.light?.state === 'none') return 'Light runs on a local di.iiii. Here the scenes play by the clock — watch, nothing to press.'
    if (data.clock?.showSource === 'clock') return 'This show plays by its own clock — watch, nothing to press.'
    if (data.light?.otherList || data.light?.otherShow) return "Light is playing another project's list. Stop it on Light first — then you can choose here."
    if (block === 'operator-only') return 'Locked by the operator — only the operator presses now.'
    if (block === 'team-only') return 'You watch. The team (the members of this space) presses the scenes.'
    if (block === 'not-allowed') return 'You can see this show, not press its scenes.'
    if (cooldownLeftMs > 0 && mine?.title) return `You pressed ${mine.title} — next press in ${durationWords(cooldownLeftMs)}.`
    if (cooldownLeftMs > 0) return `Someone just pressed. Next press in ${durationWords(cooldownLeftMs)}.`
    if (who === 'operator' && data.you?.authOff) return `Sign-in is off here, so everyone who opens this page is the operator. Press a scene.`
    if (who === 'operator') return `Press a scene. Who may choose: ${choosers}.`
    const wait = data.control?.cooldownMs || 0
    return `Press a scene. ${choosers === 'everyone' ? 'Everyone here' : 'The team'} presses${wait > 0 ? `; one press per ${durationWords(wait)}` : ''}.`
}

/** Cards under act headings: a cue that names no act stays under the act before it. */
export const groupByAct = (cues = []) => {
    const groups = []
    let current = null
    for (const cue of cues) {
        const act = cue.act || current?.act || null
        if (!current || act !== current.act) {
            current = { act, cues: [] }
            groups.push(current)
        }
        current.cues.push(cue)
    }
    return groups
}

/** The swatch's words, for a screen reader: "ember and ash", or "dark". */
export const swatchWords = (swatch = []) => {
    if (!swatch.length) return 'dark'
    const words = [...new Set(swatch.map((s) => s.word || s.hex))]
    return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]
}

export const CHOOSERS = ['operator', 'team', 'everyone']
export const choosersLabel = (value) => ({ operator: 'operator only', team: 'team', everyone: 'everyone' })[value] || value

/** The name the server will keep (serverXR show/showRemote.js cleanName): letters of any script, digits, space . ' _ -, at most 24. */
export const cleanName = (value) => String(value || '').normalize('NFC').replace(/[^\p{L}\p{N} .'_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24)

/** Why a cue cannot be tapped right now, in the person's words ('' when it can). Shared by the show page and the room's list. */
export const cueBlockWords = (cue, block, lightBlocked) => {
    if (cue?.laser) return 'laser scene — operator only'
    if (lightBlocked === 'busy') return "Light plays another list"
    if (lightBlocked) return 'Light is not open here'
    if (block === 'cooldown') return 'wait for the cooldown'
    if (block === 'operator-only') return 'locked by the operator'
    if (block) return 'you watch'
    return ''
}

/** What a person may do right now, from one show answer: the same rule the page used inline. */
export const blockOf = (data, cooldownLeftMs) => {
    if (!data) return 'loading'
    return data.you?.block === 'cooldown' && cooldownLeftMs <= 0 ? '' : (data.you?.block || '')
}

// THE SHOW PAGE'S RULES — who may choose the cue, and when (docs/architecture/RIG_BUILD.md §24).
//
// /{space}/show/{project} is a remote for the light desk's cue list, open to everyone in
// the space. Everything that decides whether a tap fires a cue lives here, pure, so the
// route (routes/showRoutes.js) only gathers facts and the tests can walk every case:
//
//   who      operator · member · visitor — from the session the server already resolved,
//            never from the page. Operator: the space's owner, an admin, or the person at
//            the machine on a `di up --guests` install. Member: signed in, editor, and in
//            the space's scope (sessionScope — the same rule every write here uses).
//            Visitor: anyone else who may see the space (a public one, or viewer scope).
//            On a di.iiii with sign-in off everyone is the operator: that is what "auth
//            off" has always meant here (getPublicAuthState), and the page says so.
//   choose   a SETTING per project, the operator's (owner 2026-10-08: "create it now, we
//            decide later"): `team` (the default — the operator and the space's members),
//            `everyone` (anyone who can see the show, a guest on a phone too), or
//            `operator` (the operator alone: choosing locked). The operator may always
//            choose. Kept open for a cloud mode where people who are not on the local
//            system choose from afar: the setting says WHO, decideChoose's `light` says
//            WHERE Light is, and the two are independent (RIG_BUILD.md §24).
//   cooldown OFF by default (control.cooldownMs = 0): owner 10-09, "we don't give the crowd
//            control now, that's for the future; this is to show and test with others and the
//            team, to brainstorm" — every tap is instant. The operator may set a wait
//            (0..60 s, CROWD_COOLDOWN_MS is the suggested crowd value) for a future crowd mode;
//            even then the operator himself never waits.
//   lasers   a cue whose look would light a laser is never fired from here, by anyone
//            (shared/laserMoments.cjs). A look the server cannot read counts as one.
//
// No clock and no I/O in this file: `now` is passed in.

const { laserMomentOf } = require('../../../shared/laserMoments.cjs')

const COOLDOWN_MS = 0 // the default: no wait
const CROWD_COOLDOWN_MS = 10_000 // a suggested wait for the future crowd mode
const COOLDOWN_MAX_MS = 60_000
const CHOOSERS = Object.freeze(['team', 'everyone', 'operator'])
const DEFAULT_CHOOSERS = 'team'
const DESK_LOOK_PREFIX = 'rig-'
const NAME_MAX = 24
const FAVOURITES_MAX = 5

// "Act 1 · still smoking" → act 1, "still smoking". The act is only what the cue's own
// name says; a cue that names none ("the black") has none.
const ACT_NAME = /^\s*act\s+([0-9]{1,2}|[ivx]{1,5})\s*[·:\-–—]\s*(.+)$/i

const lookIdOfDesk = (deskId) => (typeof deskId === 'string' && deskId.startsWith(DESK_LOOK_PREFIX) ? deskId.slice(DESK_LOOK_PREFIX.length) : null)

const splitActName = (name) => {
  const text = String(name || '').trim()
  const m = ACT_NAME.exec(text)
  return m ? { act: m[1].toUpperCase(), title: m[2].trim() } : { act: null, title: text }
}

// The colour a person reads off a swatch: ember (the warm, saturated reds and oranges of
// MOXIR's fire), ash (the greys and warm whites), or the hex itself. HSL from sRGB.
const colourWord = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  if (s < 0.25) return 'ash'
  if (h <= 45 || h >= 330) return 'ember'
  return null
}

/** Up to three colours the look lights, most-used first: [{ hex, word }]. A dark look has none. */
const swatchOf = (look) => {
  if (!look) return []
  const count = new Map()
  const keys = new Set([...Object.keys(look.aims || {}), ...Object.keys(look.colours || {}), ...Object.keys(look.levels || {})])
  for (const key of keys) {
    const level = Number.isFinite(look.levels?.[key]) ? look.levels[key] : 1
    const hex = look.colours?.[key]
    if (!(level > 0) || typeof hex !== 'string') continue
    const k = hex.toLowerCase()
    count.set(k, (count.get(k) || 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([hex]) => ({ hex, word: colourWord(hex) }))
}

// The one line under a cue's name: what the data says about it and nothing invented —
// the look's intent (first sentence), or the aside in its title ("Ash falling (the
// breakdown)"), then how long it holds.
const lineOf = (cue, look) => {
  const parts = []
  const intent = String(look?.intent || '').replace(/requiresLaserSignOff/g, '').trim()
  const first = intent.split(/(?<=[.!?])\s/)[0]?.trim()
  const aside = /\(([^)]{2,60})\)\s*$/.exec(String(look?.title || ''))?.[1]
  if (first) parts.push(first.length > 90 ? `${first.slice(0, 89)}…` : first)
  else if (aside) parts.push(aside)
  const hold = Number(cue?.hold) || 0
  parts.push(hold > 0 ? `holds ${hold} s` : 'waits for GO')
  return parts.join(' · ')
}

const looksOfDocument = (document) => {
  const entity = (document?.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks))
  return entity ? entity.components.rigLooks.looks : []
}

/**
 * The project's cue list as the show page shows it — the same list the cards page plays
 * (document.mappingState.cues), each cue with its look's swatch and whether it is a
 * laser moment. Only cues that fire a desk look count, as the desk's runner reads them.
 */
const showCuesOf = (document) => {
  const looks = new Map(looksOfDocument(document).map((l) => [l.id, l]))
  const cues = Array.isArray(document?.mappingState?.cues) ? document.mappingState.cues : []
  return cues
    .filter((c) => c && typeof c.lightLook === 'string' && c.lightLook)
    .slice(0, 200)
    .map((cue, index) => {
      const lookId = lookIdOfDesk(cue.lightLook)
      const look = lookId ? looks.get(lookId) || null : null
      const { act, title } = splitActName(cue.name || look?.title || cue.lightLook)
      // A cue whose look is not in the document fires something the server cannot read:
      // it is held like a laser moment, never guessed safe.
      const laser = look ? laserMomentOf(look) : { reason: 'unread', groups: [] }
      return {
        index,
        id: String(cue.id || `cue-${index + 1}`).slice(0, 60),
        name: String(cue.name || look?.title || cue.lightLook).slice(0, 80),
        act,
        title: title.slice(0, 80),
        line: lineOf(cue, look),
        swatch: swatchOf(look),
        hold: Math.max(0, Number(cue.hold) || 0),
        fade: Math.max(0, Number(cue.fade) || 0),
        lookId: cue.lightLook.slice(0, 40),
        laser: laser ? laser.reason : null
      }
    })
}

/** The desk runner's list for these cues (cueRun.js deskCueList, the cards page's shape). */
const deskListOf = (document) => (Array.isArray(document?.mappingState?.cues) ? document.mappingState.cues : [])
  .filter((c) => c && typeof c.lightLook === 'string' && c.lightLook)
  .map((c) => ({ id: c.id, name: c.name || c.lightLook, lookId: c.lightLook, hold: Number(c.hold) || 0, fade: Number(c.fade) || 0 }))

const signature = (list) => JSON.stringify((list || []).map((c) => [c.id, c.lookId, c.hold, c.fade]))

const whoIs = ({ state, meta, spaceId, requireAuth, canAccessSpace, hasRequiredAuthRole, isOwnerOrAdmin }) => {
  if (!requireAuth) return 'operator'
  const s = state || {}
  if (s.authenticated && (s.isUnrestricted || s.role === 'admin' || isOwnerOrAdmin(s, meta))) return 'operator'
  if (s.authenticated && hasRequiredAuthRole(s.role, 'editor') && canAccessSpace(s, spaceId)) return 'member'
  if (meta?.isPublic) return 'visitor'
  if (s.authenticated && hasRequiredAuthRole(s.role, 'viewer') && canAccessSpace(s, spaceId)) return 'visitor'
  return null
}

/** A name a person typed for themselves: letters (any script), digits, space . ' - _ ; at most 24. */
const cleanName = (value) => String(value || '')
  .normalize('NFC')
  .replace(/[^\p{L}\p{N} .'_-]/gu, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, NAME_MAX)

// Who chose it, as everyone sees it. Never an email: an account label with an @ is cut
// to the part before it. A name typed on the page is shown as typed, marked as such.
const chooserLabel = ({ who, state, typedName }) => {
  const typed = cleanName(typedName)
  const account = String(state?.label || '').trim()
  const isAccount = state?.authenticated && state.type === 'session' && !String(state.subject || '').startsWith('guest:') && state.subject !== 'local-owner'
  if (isAccount && account) return (account.includes('@') ? account.split('@')[0] : account).slice(0, NAME_MAX)
  if (typed) return typed
  if (who === 'operator' && state?.type !== 'disabled') return 'the operator'
  return who === 'member' ? 'a member' : 'someone here'
}

const emptyControl = () => ({ choosers: DEFAULT_CHOOSERS, cooldownMs: COOLDOWN_MS, setAt: null, last: null, favourites: null })

const sanitizeControl = (raw) => {
  const c = emptyControl()
  if (!raw || typeof raw !== 'object') return c
  c.choosers = CHOOSERS.includes(raw.choosers) ? raw.choosers : DEFAULT_CHOOSERS
  c.setAt = Number.isFinite(raw.setAt) ? raw.setAt : null
  if (Number.isFinite(raw.cooldownMs)) c.cooldownMs = Math.min(COOLDOWN_MAX_MS, Math.max(0, Math.round(raw.cooldownMs)))
  // null = the operator never starred any; an array (≤5 look ids) = his five.
  if (Array.isArray(raw.favourites)) c.favourites = [...new Set(raw.favourites.filter((id) => typeof id === 'string' && id).map((id) => id.slice(0, 40)))].slice(0, FAVOURITES_MAX)
  const last = raw.last
  if (last && typeof last === 'object' && Number.isInteger(last.index) && Number.isFinite(last.at)) {
    c.last = { index: last.index, cueId: String(last.cueId || '').slice(0, 60), by: String(last.by || '').slice(0, NAME_MAX + 4), at: last.at }
  }
  return c
}

/**
 * The favourite scenes everyone sees: the operator's starred look ids (those still in the show, none a laser
 * scene), in his order; before he stars any (stored === null) the first five non-laser looks in list order.
 * A look is one scene however many cues play it, so ids are look ids.
 */
const favouritesOf = (cues, stored) => {
  const firstOfLook = new Map()
  for (const cue of cues || []) if (cue.lookId && !firstOfLook.has(cue.lookId)) firstOfLook.set(cue.lookId, cue)
  if (Array.isArray(stored)) return stored.filter((id) => firstOfLook.has(id) && !firstOfLook.get(id).laser).slice(0, FAVOURITES_MAX)
  return [...firstOfLook.values()].filter((cue) => !cue.laser).slice(0, FAVOURITES_MAX).map((cue) => cue.lookId)
}

/** The operator's list, checked: { ok, favourites } or { ok: false, error }. Refuses > 5, repeats, unknown looks and laser scenes. */
const checkFavourites = (ids, cues) => {
  if (!Array.isArray(ids)) return { ok: false, error: 'favourites is a list of scene ids.' }
  if (ids.length > FAVOURITES_MAX) return { ok: false, error: `At most ${FAVOURITES_MAX} favourites.` }
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'A scene is a favourite once.' }
  const byLook = new Map((cues || []).filter((c) => c.lookId).map((c) => [c.lookId, c]))
  for (const id of ids) {
    if (typeof id !== 'string' || !byLook.has(id)) return { ok: false, error: 'That scene is not in this show.' }
    if (byLook.get(id).laser) return { ok: false, error: 'A laser scene is never a favourite - the lasers are not pressed from here.' }
  }
  return { ok: true, favourites: ids }
}

const cooldownLeftMs = (control, now) => {
  const at = control?.last?.at
  const wait = Number.isFinite(control?.cooldownMs) ? control.cooldownMs : COOLDOWN_MS
  return Number.isFinite(at) && wait > 0 ? Math.max(0, at + wait - now) : 0
}

/** Why this person may not choose right now ('' = they may), for the page and the route alike. */
const chooseBlock = ({ who, control, now }) => {
  if (!who) return 'not-allowed'
  const choosers = CHOOSERS.includes(control?.choosers) ? control.choosers : DEFAULT_CHOOSERS
  if (who !== 'operator' && choosers === 'operator') return 'operator-only'
  if (who === 'visitor' && choosers !== 'everyone') return 'team-only'
  if (who !== 'operator' && cooldownLeftMs(control, now) > 0) return 'cooldown'
  return ''
}

/**
 * The whole decision for one tap. `light` is what the route read off this machine:
 *   { runtime: bool (a local di.iiii, where Light can run), showSpace: string|null
 *     (whose show Light holds, null = this machine's own), runner: cueRunner.full()
 *     or null, hasLook(id) }
 * Returns { ok: true, load: null | { list, loop, keepIndex } } or { ok: false, status, code, error }.
 */
const decideChoose = ({ who, control, now, cues, index, cueId, document, spaceId, projectId, light }) => {
  const refuse = (status, code, error) => ({ ok: false, status, code, error })
  const cue = Number.isInteger(index) ? cues[index] : null
  if (!cue) return refuse(404, 'no-cue', 'There is no such cue in this show.')
  if (cueId && cue.id !== cueId) return refuse(409, 'list-changed', 'The cue list changed while you were looking. Look again and choose.')
  // Lasers first: whoever asks, whatever else is true, this page never fires one.
  if (cue.laser) return refuse(403, 'laser', 'Laser moment — operator only. A laser cue is fired by the operator, after the laser safety sign-off.')
  const block = chooseBlock({ who, control, now })
  if (block === 'not-allowed') return refuse(403, block, 'You can see this show, not choose its cue.')
  if (block === 'team-only') return refuse(403, block, 'Choosing is for the team — the members of this space. The operator can open it to everyone.')
  if (block === 'operator-only') return refuse(423, block, 'Locked by the operator: only the operator chooses now.')
  if (block === 'cooldown') return refuse(429, block, `Someone just chose. Next choice in ${Math.ceil(cooldownLeftMs(control, now) / 1000)} s.`)
  if (document?.mappingState?.showSource === 'clock') return refuse(409, 'clock', 'This show plays by its own clock, not by Light; there is nothing to choose.')
  if (!light?.runtime) return refuse(409, 'no-light', 'Light runs on a local di.iiii; on this one the cue list plays by the clock.')
  if (light.showSpace && light.showSpace !== spaceId) return refuse(409, 'other-show', "Light is running another space's show.")
  const runner = light.runner || null
  const list = deskListOf(document)
  const ours = runner && runner.project === projectId && Array.isArray(runner.list) && runner.list.length > 0
  if (runner && runner.running && runner.project && runner.project !== projectId) {
    return refuse(409, 'other-list', "Light is playing another project's cue list.")
  }
  if (typeof light.hasLook === 'function' && !light.hasLook(cue.lookId)) {
    return refuse(409, 'not-on-light', "This cue's look is not on Light yet. The operator sends the looks from the cards page.")
  }
  let load = null
  if (!ours) load = { list, loop: document?.mappingState?.loop === true, keepIndex: false }
  else if (signature(runner.list) !== signature(list)) load = { list, keepIndex: true }
  return { ok: true, load }
}

/** What the page shows as "live": Light's runner when it plays this project, else nothing. */
const liveOf = ({ runner, projectId, control, cues }) => {
  if (!runner || runner.project !== projectId || !(runner.n > 0) || !(runner.index >= 0)) return null
  const last = control?.last
  // "chosen by" only for the firing that choice made: same cue, fired within a second of it.
  const chosen = last && last.index === runner.index && Number.isFinite(runner.firedAt) && Math.abs(runner.firedAt - last.at) < 1000
  const next = runner.index + 1 < runner.n ? runner.index + 1 : (runner.loop ? 0 : -1)
  return {
    index: runner.index,
    n: runner.n,
    name: runner.name || cues[runner.index]?.name || null,
    running: runner.running === true,
    loop: runner.loop === true,
    autoplay: runner.autoplay === true,
    nextIndex: runner.running && runner.autoplay === true ? next : -1,
    nextInMs: runner.nextInMs ?? null,
    firedAt: runner.firedAt ?? null,
    by: chosen ? last.by : null,
    missing: Array.isArray(runner.missing) ? runner.missing.length : 0
  }
}

module.exports = {
  COOLDOWN_MS,
  CROWD_COOLDOWN_MS,
  COOLDOWN_MAX_MS,
  CHOOSERS,
  DEFAULT_CHOOSERS,
  splitActName,
  colourWord,
  swatchOf,
  lineOf,
  showCuesOf,
  deskListOf,
  whoIs,
  cleanName,
  chooserLabel,
  emptyControl,
  sanitizeControl,
  FAVOURITES_MAX,
  favouritesOf,
  checkFavourites,
  cooldownLeftMs,
  chooseBlock,
  decideChoose,
  liveOf
}

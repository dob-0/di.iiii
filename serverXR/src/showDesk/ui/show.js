// The show desk's page (serverXR/src/showDesk/ui): the lighting desk and the laser desk on one page, for the person who runs the
// show. It keeps nothing of its own: it reads the two desks' state and sends their own routes, the same ones their own pages
// send. Addresses are relative to /show/: ../light/api/… is the lighting desk, ../laser/api/… the laser engine and
// ../laser/desk/api/… the laser desk. Same origin, so the desks' guards (own page, same machine, the stops' gate) apply here
// exactly as on their own pages.
//
// Safety, by construction: a poll only reads. Every POST below sits behind a person's press, or a fader under their hand.
// On is one cube at a time, only from that cube's On button. A guard's stop is shown and left to the Laser desk. The engine's
// guards (the still-beam stop, the 200 ms signal-loss blank, start disarmed) belong to the engine; nothing here touches them.
// Blackout all and the B key only ever go dark; a blackout is lifted per desk (Lift blackout under Lights or Laser, or
// Shift+B), and only for a desk that answered its last read and says it is dark (review 2026-10-31, must-fix 1, 2 and 4).
// The laser desk's hardest lesson, kept: a poll never moves a fader the person touched in the last HOLD_MS.
// Live (2026-10-31, the owner: "where to edit scenes real time"): the live strip plays the look that is live now with the
// laser desk's own looks/edit (pads and faders), the lamps take colours by the lighting desk's own fixture route, Save scene
// and Undo are the two desks' own save/undo/recall, and MIDI (a controller in this page) moves the same faders and presses the
// same scene keys and Blackout all. MIDI never reaches On, Off, a lift, Undo, Save or Release: they are not targets at all.
'use strict'
;(() => {
    const LIGHT = '../light/api/'
    const LASER = '../laser/api/'
    const DESK = '../laser/desk/api/'
    const OUT = 'desk' // the laser desk's own Out: an On here is the same On as on the laser desk's Control
    const POLL_MS = 1000 // one read of each desk a second, never faster
    const FOLLOWS_EVERY = 20 // the scene → look table is read again every 20th poll
    const VIEW_IDLE_MS = 500 // the preview while no cube is On
    const VIEW_ARMED_MS = 80 // the preview while a cube is On
    const HOLD_MS = 1000 // a fader under a hand is left to it; the poll moves it again 1 s after it is let go (the owner, 21:2x)
    const SEND_MS = 50 // a fader sends at most this often; the last value always goes
    const BLACKOUT_GAP_MS = 600 // a second lift of the same half inside this is ignored; going dark is never gapped (a panic retry always goes)
    const TIMEOUT_MS = 4000 // a desk that does not answer is said so; nothing waits on it for good
    const NOTE_MS = 12000 // how long the words about a press stay
    const MAX_DOTS = 12
    const EMITTERS = ['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime']
    const LIVE_SEND_MS = 60 // the live strip sends each field at most this often; the last value always goes
    // The laser desk's own swatches (laser/ui/desk.js SWATCHES), then the extra colours of the show's palette.
    const SWATCHES = ['#ff2030', '#ffb020', '#ffffff', '#20d8ff', '#3050ff', '#8040ff', '#ff30c0', '#20ff60', '#e0001a', '#f0eaff', '#7a20ff']
    // A copy of shared/laserShapes.cjs LASER_SHAPES (showDesk.test.js keeps it equal); the desk's own `shapes` wins when it
    // sends one. "spots" (dots) comes first on the strip, so any live look becomes dots with one tap.
    const SHAPES = ['circle', 'line', 'square', 'triangle', 'star', 'wave', 'fan', 'spiral', 'galaxy', 'sunflower', 'noisy', 'grid',
        'arc', 'cross', 'bars', 'rings', 'corners', 'chevron', 'glint', 'sparkle', 'twinkle', 'lines', 'spots', 'wobble',
        'planets', 'pendulum', 'bounce', 'radar', 'constellation', 'clock', 'horizon', 'morse']
    // Every field of a look the laser desk knows (laser/laserDesk.js normaliseLook): its range there, its step here.
    const LIVE = {
        level: { label: 'Level', min: 0, max: 1, step: 0.01, pct: true },
        size: { label: 'Size', min: 0, max: 1, step: 0.01, pct: true },
        height: { label: 'Height', min: -1, max: 1, step: 0.01 },
        x: { label: 'X', min: -1, max: 1, step: 0.01 },
        copies: { label: 'Copies', min: 0, max: 24, step: 1 },
        rotation: { label: 'Rotation', min: -1, max: 1, step: 0.01 },
        spin: { label: 'Spin', min: -4, max: 4, step: 0.01, on: 0.5 },
        pulse: { label: 'Pulse', min: 0, max: 1, step: 0.01, pct: true, on: 0.5 },
        sweep: { label: 'Sweep', min: 0, max: 1, step: 0.01, pct: true, on: 0.5 },
        cycle: { label: 'Cycle', min: 0, max: 64, step: 0.25, on: 4 },
        phase: { label: 'Phase', min: 0, max: 16, step: 0.05 },
        pulseBeats: { label: 'Pulse beats', min: 0.25, max: 64, step: 0.25 },
        sweepBeats: { label: 'Sweep beats', min: 0.25, max: 64, step: 0.25 },
        points: { label: 'Points', min: 16, max: 1992, step: 1 }
    }
    const EFFECTS = ['pulse', 'sweep', 'spin', 'cycle'] // a pad each: a tap turns it off, a tap again back on at its last depth
    const ROW_A = ['level', 'size', 'copies', 'rotation']
    const ROW_B = ['phase', 'pulseBeats', 'sweepBeats', 'points']

    const $ = (id) => document.getElementById(id)
    const el = (tag, props = {}, ...kids) => {
        const n = document.createElement(tag)
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v
            else if (k === 'text') n.textContent = v
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
            else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v)
        }
        for (const kid of kids) if (kid) n.append(kid)
        return n
    }
    const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
    const setText = (node, v) => { if (node && node.textContent !== v) node.textContent = v }
    const setClass = (node, v) => { if (node && node.className !== v) node.className = v }
    const pct = (v, max) => `${Math.round((Number(v) || 0) / max * 100)}%`

    // ---- talking to the desks: every answer comes back as { ok, … }; a desk that does not answer is { ok: false, down: true }
    const call = async (url, body) => {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
        const init = body === undefined
            ? { cache: 'no-store', signal: ctl.signal }
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }
        try {
            const r = await fetch(url, init)
            const out = await r.json().catch(() => ({}))
            const data = out && typeof out === 'object' && !Array.isArray(out) ? out : {}
            if (!r.ok || data.ok === false || data.error) return { ...data, ok: false, status: r.status, error: String(data.error || `refused (${r.status})`) }
            return { ...data, ok: true, status: r.status }
        } catch (error) {
            const timeout = Boolean(error && error.name === 'AbortError')
            return { ok: false, down: true, timeout, error: timeout ? 'no answer in time' : 'no answer' }
        } finally { clearTimeout(timer) }
    }
    const get = (url) => call(url)
    const post = (url, body = {}) => call(url, body)

    // ---- what the two desks say now
    const S = { light: null, lightErr: '', desk: null, deskErr: '', engine: null, engineErr: '', table: {}, view: null, polls: 0 }
    const scenesOf = () => (S.light && Array.isArray(S.light.scenes) ? S.light.scenes.filter((s) => s && typeof s.id === 'string' && s.id) : [])
    const fixturesOf = () => (S.light && Array.isArray(S.light.fixtures) ? S.light.fixtures.filter((f) => f && typeof f.id === 'string') : [])
    const engineCube = (id) => (S.engine && Array.isArray(S.engine.cubes) ? S.engine.cubes.find((c) => c && c.id === id) : null) || null
    const deskCube = (id) => (S.desk && Array.isArray(S.desk.cubes) ? S.desk.cubes.find((c) => c && c.id === id) : null) || null
    const cubesArmed = () => (S.engine && Array.isArray(S.engine.cubes) ? S.engine.cubes.filter((c) => c && c.armed) : [])
    const cubeIds = () => {
        const ids = (S.desk && Array.isArray(S.desk.cubes) ? [...S.desk.cubes] : [])
            .filter((c) => c && typeof c.id === 'string')
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
            .map((c) => c.id)
        for (const c of (S.engine && Array.isArray(S.engine.cubes) ? S.engine.cubes : [])) if (c && typeof c.id === 'string' && !ids.includes(c.id)) ids.push(c.id)
        return ids
    }
    const activeSceneName = () => {
        const id = S.light && S.light.activeScene
        const s = id ? scenesOf().find((x) => x.id === id) : null
        return s ? (s.name || s.id) : ''
    }
    const liveLook = () => {
        if (!S.desk || !S.desk.liveId) return null
        const l = (Array.isArray(S.desk.looks) ? S.desk.looks : []).find((x) => x && x.id === S.desk.liveId)
        return { id: S.desk.liveId, name: (l && l.name) || (S.desk.live && S.desk.live.name) || S.desk.liveId }
    }
    const linkOf = (sceneId) => {
        const l = own(S.table, sceneId) ? S.table[sceneId] : null
        return l && typeof l.look === 'string' && l.look ? { look: l.look, name: typeof l.name === 'string' && l.name ? l.name : l.look } : null
    }
    // Who holds a channel by hand on the lighting desk (its holds.js): 'owner' is a person at a desk page; any other tag is a
    // script or another session. A plain release lets go of the person's own; Release all lets go of everybody's.
    const holdsOf = () => {
        const out = { mine: 0, others: 0, mineUnis: [], allUnis: [], who: {} }
        if (!S.light || !S.light.raw || typeof S.light.raw !== 'object') return out
        const mineU = new Set()
        const allU = new Set()
        for (const key of Object.keys(S.light.raw)) {
            const u = Number(key.split(':')[0])
            if (!Number.isInteger(u) || u < 0) continue
            const by = (S.light.rawOwners && S.light.rawOwners[key]) || 'owner'
            allU.add(u)
            if (by === 'owner') { out.mine += 1; mineU.add(u) } else { out.others += 1; out.who[by] = (out.who[by] || 0) + 1 }
        }
        out.mineUnis = [...mineU].sort((a, b) => a - b)
        out.allUnis = [...allU].sort((a, b) => a - b)
        return out
    }
    // The blackout of each half from its last state read. A half that did not answer reads "not on", so it is never offered a
    // lift. "all" only paints the top button: every answering desk is dark. A lift is decided per half, never from "all".
    const blackoutState = () => {
        const lights = Boolean(S.light && S.light.blackout === true)
        const laser = Boolean(S.desk && S.desk.blackout === true)
        const all = Boolean((S.light || S.desk) && (!S.light || lights) && (!S.desk || laser))
        return { lights, laser, all, any: lights || laser }
    }

    // ---- colour: the lighting desk's own colour rule (../light/colour.js), from what is on the wire
    const colourOf = (chans, values) => {
        const c = window.deskColour
        if (!c) return null
        const emitters = S.light && S.light.roleKinds && Array.isArray(S.light.roleKinds.emitter) ? S.light.roleKinds.emitter : EMITTERS
        return c.colourOfValues(chans, values || {}, emitters, c.mixOf || (() => [0.8, 0.8, 0.8]))
    }
    const chansOf = (f) => ((S.light && S.light.profiles && S.light.profiles[f.profile]) || {}).channels || []
    const cssOf = (c) => (c && window.deskColour && c.level >= (window.deskColour.DARK || 0.03) ? window.deskColour.rgbCss(c) : '')
    const liveCss = (f) => (window.deskColour && S.light ? cssOf(colourOf(chansOf(f), window.deskColour.frameValues(f, chansOf(f), S.light.dmx))) : '')

    // ---- the status line
    let sayTimer = null
    const say = (text, kind = 'ok') => {
        const n = $('status')
        setText(n, text || '')
        setClass(n, `status${text ? ` is-${kind}` : ''}`)
        clearTimeout(sayTimer)
        if (text && kind === 'ok') sayTimer = setTimeout(() => say(''), NOTE_MS)
    }

    // ---- faders: a fader under the hand is never moved by a poll; it sends at most every SEND_MS, the last value always
    const touched = new Map()
    const dragging = new Set()
    const touch = (key) => touched.set(key, Date.now())
    const held = (key) => dragging.has(key) || Date.now() - (touched.get(key) || 0) < HOLD_MS
    const throttled = (send) => {
        let timer = null
        let last = 0
        let value = null
        return (v) => {
            value = v
            if (timer) return
            timer = setTimeout(() => { timer = null; last = Date.now(); send(value) }, Math.max(0, last + SEND_MS - Date.now()))
        }
    }
    const bindFader = (input, key, send, show) => {
        const sendSoon = throttled(async (v) => {
            const r = await send(v)
            if (r && !r.ok) say(`${r.down ? 'No answer' : 'Refused'}: ${r.error}.`, 'error')
        })
        input.addEventListener('input', () => { touch(key); show(Number(input.value)); sendSoon(Number(input.value)) })
        input.addEventListener('pointerdown', () => { dragging.add(key); touch(key) })
        for (const ev of ['pointerup', 'pointercancel', 'blur', 'change']) input.addEventListener(ev, () => { dragging.delete(key); touch(key) })
    }
    const putFader = (input, key, value) => { if (input && !held(key) && Number.isFinite(value) && Number(input.value) !== value) input.value = String(value) }

    // ---- the laser preview: the laser desk's own frame and line drawing (../laser/drawRuns.js), at a calm rate
    const drawFrame = (canvas, points, { zone = null, dim = false } = {}) => {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        const g = canvas.getContext('2d')
        if (!g) return
        g.clearRect(0, 0, w, h)
        const s = Math.min(w, h) / 2 * 0.94
        const X = (x) => w / 2 + x * s
        const Y = (y) => h / 2 - y * s
        g.strokeStyle = '#1f1f23' // the laser desk's frame line (desk.js)
        g.lineWidth = 1
        g.strokeRect(X(-1), Y(1), 2 * s, 2 * s)
        if (zone) {
            g.fillStyle = 'rgba(255,255,255,0.035)' // the laser desk's shade outside the keep-in zone
            const shade = (x0, y0, x1, y1) => { if (x1 > x0 && y1 > y0) g.fillRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s) }
            shade(-1, -1, 1, zone.yMin)
            shade(-1, zone.yMax, 1, 1)
            shade(-1, zone.yMin, zone.xMin, zone.yMax)
            shade(zone.xMax, zone.yMin, 1, zone.yMax)
        }
        if (!Array.isArray(points) || points.length < 2 || !window.DiLaserDraw) return
        g.lineWidth = Math.max(1, 1.4 * dpr)
        g.lineCap = 'round'
        g.lineJoin = 'round'
        g.globalAlpha = dim ? 0.45 : 1
        window.DiLaserDraw.strokeLitRuns(g, points, X, Y)
        g.globalAlpha = 1
    }
    const drawCubes = () => {
        for (const [id, parts] of cubeCards) {
            const e = engineCube(id)
            const points = S.view && S.view.cubes && Array.isArray(S.view.cubes[id]) ? S.view.cubes[id] : []
            drawFrame(parts.canvas, points, { zone: S.engine && S.engine.zone, dim: !(e && e.armed) })
        }
    }
    const readView = async () => {
        if (!S.desk || !cubeCards.size) return
        const v = await get(DESK + 'view')
        S.view = v.ok ? v : null
        drawCubes()
    }

    // ---- the top line and Blackout all
    const renderTop = () => {
        const lit = litSceneOf()
        setText($('nowScene'), S.light ? (activeSceneName() || (lit ? `${lit.name || lit.id} · changed` : 'No scene')) : 'Lights: no answer')
        const look = liveLook()
        setText($('nowLook'), S.desk ? (look ? look.name : 'No laser look') : 'Laser: no answer')
        const armed = cubesArmed().length
        const sim = Boolean(S.engine && S.engine.sim)
        setText($('nowLaser'), armed ? `Laser On${sim ? ' · simulated' : ''}${S.desk && S.desk.blackout ? ' · blackout' : ''}` : 'Laser Off')
        setClass($('nowLaser'), `pill nowlaser${armed ? (sim ? ' is-sim' : ' is-armed') : ''}`)
        const bo = blackoutState()
        const btn = $('blackoutAll')
        // The button only ever says "Blackout all": it has no lift. Its sub-line says what is dark and where the lifts are.
        const sub = bo.lights && bo.laser ? 'On · Lift lights or Lift laser lifts it' : bo.lights ? 'The lights blackout is on' : bo.laser ? 'The laser blackout is on' : ''
        if (btn.dataset.label !== sub) {
            btn.dataset.label = sub
            btn.replaceChildren(document.createTextNode('Blackout all'), ...(sub ? [el('span', { class: 'sub', text: sub })] : []))
        }
        btn.classList.toggle('is-on', bo.all)
        btn.setAttribute('aria-pressed', bo.all ? 'true' : 'false')
        for (const half of ['lights', 'laser']) {
            const b = $(LIFT[half].button)
            const on = half === 'lights' ? bo.lights : bo.laser
            const answered = Boolean(half === 'lights' ? S.light : S.desk)
            b.disabled = !on || liftBusy[half]
            b.classList.toggle('is-on', on)
            const title = !answered ? `${LIFT[half].Desk} did not answer, so its blackout is not lifted from here.`
                : on ? `Lift the ${half} blackout (${LIFT[half].desk}'s own Blackout off). Shift+B lifts each one that is on.` : `The ${half} blackout is off.`
            if (b.title !== title) b.title = title
        }
    }
    // Blackout all only ever goes dark: both desks' own Blackout on, at once, on every press. No number of presses sends a
    // lift (the laser desk's own rule, desk.js: its Blackout only turns on, review 1218 M1), and a panic retry is never
    // dropped. A lift sent just before may land after this press, so once it has landed the dark goes again: B always wins.
    const lifting = new Set()
    const pressBlackout = async () => {
        const before = [...lifting]
        // Both routes, always, at once: a stop is never skipped because a poll was late or a desk looked absent.
        const dark = () => Promise.all([post(LIGHT + 'master', { blackout: true }), post(DESK + 'blackout', { on: true })])
        let [lights, laser] = await dark()
        if (before.length) {
            await Promise.allSettled(before)
            ;[lights, laser] = await dark()
        }
        const bad = [lights.ok ? '' : `the lighting desk: ${lights.error}`, laser.ok ? '' : `the laser desk: ${laser.error}`].filter(Boolean)
        await tick()
        say(bad.length ? `Blackout did not reach ${bad.join('; ')}.` : 'Blackout: lights and laser are dark. Lift each with Lift lights or Lift laser.', bad.length ? 'error' : 'ok')
    }
    // Lifting is per half, each with its desk's own route and body: the lighting desk's master {blackout:false} (its own
    // Blackout button), the laser desk's blackout {on:false} (its Shift+B). A half is lifted only when it answered its last
    // state read AND reports its blackout on; a half that did not answer is never lifted. A second lift of the same half
    // inside BLACKOUT_GAP_MS is ignored, so a double-click lifts once.
    const LIFT = {
        lights: { button: 'liftLights', desk: 'the lighting desk', Desk: 'The lighting desk', send: () => post(LIGHT + 'master', { blackout: false }) },
        laser: { button: 'liftLaser', desk: 'the laser desk', Desk: 'The laser desk', send: () => post(DESK + 'blackout', { on: false }) }
    }
    const liftAt = { lights: 0, laser: 0 }
    const liftBusy = { lights: false, laser: false }
    const liftable = (half) => (half === 'lights' ? blackoutState().lights : blackoutState().laser)
    const pressLift = async (halves) => {
        const on = halves.filter(liftable)
        if (!on.length) {
            say(halves.length > 1 ? 'Nothing to lift: no desk that answered has its blackout on.' : `Nothing lifted: the ${halves[0]} blackout is not on, or its desk did not answer.`, 'ok')
            return
        }
        const t = Date.now()
        const go = on.filter((half) => !liftBusy[half] && t - liftAt[half] >= BLACKOUT_GAP_MS)
        if (!go.length) return
        const sent = go.map((half) => {
            liftBusy[half] = true
            liftAt[half] = t
            const p = LIFT[half].send()
            lifting.add(p)
            return p.finally(() => { lifting.delete(p); liftBusy[half] = false })
        })
        renderTop()
        const replies = await Promise.all(sent)
        await tick()
        const bad = go.map((half, i) => (replies[i].ok ? '' : `${LIFT[half].desk}: ${replies[i].error}`)).filter(Boolean)
        const done = go.filter((half, i) => replies[i].ok)
        const armed = cubesArmed().length
        const laserWords = !done.includes('laser') ? '' : armed ? ` The laser draws again: ${armed} cube${armed > 1 ? 's are' : ' is'} On.` : cubeIds().length ? ' The cubes stay Off until you press On.' : ''
        const words = done.length ? `Blackout lifted on the ${done.join(' and the ')}.${laserWords}` : ''
        say(bad.length ? `${words}${words ? ' ' : ''}Blackout was not lifted on ${bad.join('; ')}.` : words, bad.length ? 'error' : 'ok')
    }

    // ---- scenes: the lighting desk's scenes in its order; a press is the laser desk's Scenes row press (../laser/sceneRow.js)
    let sceneSig = null
    const sceneBtns = new Map()
    let sceneBusy = false
    const sceneItems = () => {
        const api = window.DiSceneRow
        if (api) return api.sceneItems({ scenes: scenesOf(), activeScene: S.light && S.light.activeScene, table: S.table, liveId: S.desk ? S.desk.liveId : null })
        return scenesOf().map((s) => ({ id: s.id, name: s.name || s.id, look: null, lights: Boolean(S.light && s.id === S.light.activeScene), laser: false }))
    }
    const sceneDots = (sceneId) => {
        const scene = scenesOf().find((s) => s.id === sceneId)
        const inScene = scene && Array.isArray(scene.fixtures) ? scene.fixtures : []
        const out = []
        for (const f of fixturesOf()) {
            const sf = inScene.find((x) => x && x.id === f.id)
            if (!sf) continue
            out.push({ name: f.name || f.id, css: cssOf(colourOf(chansOf(f), sf.on === false ? {} : sf.values)) })
            if (out.length >= MAX_DOTS) break
        }
        return out
    }
    const renderScenes = () => {
        const note = $('scenesNote')
        const items = sceneItems()
        if (!S.light) setText(note, `The lighting desk did not answer (${S.lightErr}). Its scenes show here when it does.`)
        else if (!items.length) setText(note, 'No scenes on the lighting desk yet. Store them on the Light desk.')
        else setText(note, S.desk ? 'A press recalls the scene on the lights and puts the look that follows it on the laser.' : 'A press recalls the scene on the lights.')
        const sig = JSON.stringify(items.map((i) => [i.id, i.name]))
        if (sig !== sceneSig) {
            sceneSig = sig
            sceneBtns.clear()
            $('scenes').replaceChildren(...items.map((i, index) => {
                const parts = {
                    num: el('b', { class: 'scenenum', text: String(index).padStart(2, '0') }),
                    nameText: el('span', { class: 'scenetext' }),
                    lookText: el('span', { class: 'scenetext' }),
                    liveTag: el('b', { class: 'tag', text: 'LIVE', hidden: true }),
                    dots: el('span', { class: 'scenedots', 'aria-hidden': 'true' }),
                    dotSig: null
                }
                parts.btn = el('button', { type: 'button', class: 'scenebtn', 'data-id': i.id, 'data-midi': `scene:${index}`, 'aria-pressed': 'false', onclick: () => { if (!learning) pressScene(i.id) } },
                    el('span', { class: 'scenename' }, parts.num, parts.nameText), el('span', { class: 'scenelook' }, parts.lookText, parts.liveTag), parts.dots)
                sceneBtns.set(i.id, parts)
                return parts.btn
            }))
        }
        for (const i of items) {
            const p = sceneBtns.get(i.id)
            if (!p) continue
            setText(p.nameText, i.name)
            setText(p.lookText, i.look ? `laser: ${i.look.name}` : 'lights only')
            p.liveTag.hidden = !i.laser
            const edited = Boolean(S.light && !S.light.activeScene && litScene === i.id)
            setClass(p.btn, `scenebtn${i.lights ? ' is-lights' : ''}${i.laser ? ' is-laser' : ''}${edited ? ' is-edited' : ''}${sceneBusy === i.id ? ' is-busy' : ''}`)
            const pressed = i.lights ? 'true' : 'false'
            if (p.btn.getAttribute('aria-pressed') !== pressed) p.btn.setAttribute('aria-pressed', pressed)
            const dots = sceneDots(i.id)
            const dotSig = JSON.stringify(dots)
            if (dotSig !== p.dotSig) {
                p.dotSig = dotSig
                p.dots.replaceChildren(...dots.map((d) => el('i', { title: d.css ? d.name : `${d.name}: dark`, style: d.css ? `background:${d.css}` : null })))
            }
            const title = i.look ? `Press: the lights recall ${i.name} and the laser plays ${i.look.name}.` : `Press: the lights recall ${i.name}. No laser look follows it, so the laser stays as it is.`
            if (p.btn.title !== title) p.btn.title = title
        }
    }
    const pressWords = ({ name, link, light, laser }) => {
        const parts = []
        if (light.ok) parts.push(link ? `${name}: lights recalled.` : `${name}: lights recalled. No laser look follows it.`)
        else parts.push(`Lights did not change: ${window.DiSceneRow ? window.DiSceneRow.lightWhy(light) : light.error}.`)
        if (light.ok && S.light && S.light.blackout) parts.push('The lights blackout is on, so they stay dark.')
        if (link) {
            if (laser && laser.ok) {
                parts.push(`Laser look ${link.name} is live.`)
                if (S.desk && S.desk.blackout) parts.push('The laser blackout is on, so the cubes stay dark.')
                else if (!cubesArmed().length) parts.push('No cube is On: nothing is drawn until you press On.')
            } else parts.push(`Laser did not change: the laser desk said "${String((laser && laser.error) || 'no').slice(0, 120)}".`)
        }
        return { text: parts.join(' '), kind: !light.ok || (link && !(laser && laser.ok)) ? 'error' : 'ok' }
    }
    const pressScene = async (id) => {
        if (sceneBusy) return
        const scene = scenesOf().find((s) => s.id === id)
        if (!scene) return
        const name = scene.name || scene.id
        const link = linkOf(id)
        sceneBusy = id
        renderScenes()
        const lightPost = (path, body) => post(LIGHT + path, body)
        const goLook = (look) => post(DESK + 'go', { look })
        let light
        let laser = null
        if (window.DiSceneRow) ({ light, laser } = await window.DiSceneRow.pressScene({ scene: { id, name }, link, lightPost, goLook }))
        else light = await lightPost('scenes/recall', { id })
        sceneBusy = false
        if (light && light.ok) { litScene = id; lampsEdited = false }
        const words = pressWords({ name, link, light, laser })
        say(words.text, words.kind)
        await tick()
    }

    // ---- lights
    let lampSig = null
    const lampRows = new Map()
    const renderLights = () => {
        const note = $('lightsNote')
        const fixtures = fixturesOf()
        const why = !S.light ? `The lighting desk did not answer (${S.lightErr}). The lamps show here when it does.`
            : !fixtures.length ? 'No lamps are patched on the lighting desk. Patch them on the Light desk.' : ''
        note.hidden = !why
        setText(note, why)
        if (!S.light) return
        putFader($('lightMaster'), 'light-master', Number(S.light.master))
        setText($('lightMasterVal'), pct(held('light-master') ? $('lightMaster').value : S.light.master, 255))
        const h = holdsOf()
        const rel = $('releaseHolds')
        setText(rel, `Release holds (${h.mine})`)
        rel.disabled = h.mine === 0
        const all = $('releaseAllHolds')
        all.hidden = h.others === 0
        setText(all, `Release all holds (${h.mine + h.others})`)
        all.title = h.others ? `Also the channels held by ${Object.entries(h.who).map(([who, n]) => `${who} (${n})`).join(', ')}: a script or another page` : ''
        const sig = JSON.stringify(fixtures.map((f) => [f.id, f.name, f.address, f.universe, f.profile]))
        if (sig !== lampSig) {
            lampSig = sig
            lampRows.clear()
            $('lamps').replaceChildren(...fixtures.map((f, index) => {
                const key = `lamp:${f.id}`
                const parts = {
                    swatch: el('span', { class: 'swatch', 'aria-hidden': 'true' }),
                    name: el('b'),
                    where: el('span'),
                    input: el('input', { type: 'range', class: 'vfader', min: '0', max: '255', step: '1', 'data-midi': `lamp:${index}`, 'aria-label': `Level of ${f.name || f.id}` }),
                    val: el('b', { class: 'val' }),
                    colours: el('div', { class: 'lampcolours', role: 'group', 'aria-label': `Colour of ${f.name || f.id}` })
                }
                bindFader(parts.input, key, (v) => { lampsEdited = true; return post(LIGHT + 'fixture', { id: f.id, values: { dimmer: v }, on: true }) }, (v) => setText(parts.val, pct(v, 255)))
                // The same colours as the live strip, as this lamp's own colour channels (its profile on the lighting desk)
                if (Object.keys(lampColour(f, '#ffffff')).length) {
                    parts.colours.append(...SWATCHES.map((c) => el('button', {
                        type: 'button', class: 'swatch', 'data-colour': c, style: `background:${c}`, title: `${f.name || f.id}: ${c}`, 'aria-label': `${f.name || f.id} in ${c}`, onclick: () => pressLampColour(f.id, c)
                    })))
                }
                lampRows.set(f.id, parts)
                return el('div', { class: 'lamp strip', 'data-id': f.id },
                    el('div', { class: 'striphead' }, parts.swatch, el('span', { class: 'who' }, parts.name, parts.where)), parts.input, parts.val, parts.colours)
            }))
        }
        for (const f of fixtures) {
            const p = lampRows.get(f.id)
            if (!p) continue
            setText(p.name, f.name || f.id)
            setText(p.where, `${Number(f.universe) > 0 ? `U${Number(f.universe) + 1} ` : ''}@${f.address} · ${f.profile}`)
            const css = liveCss(f)
            const bg = css || ''
            if (p.swatch.style.background !== bg) p.swatch.style.background = bg
            p.swatch.title = css ? `${f.name}: what it sends now` : `${f.name}: dark now`
            const level = f.values && Number.isFinite(Number(f.values.dimmer)) ? Number(f.values.dimmer) : 255 // no dimmer channel: the desk's own, full
            putFader(p.input, `lamp:${f.id}`, level)
            setText(p.val, f.on === false && !held(`lamp:${f.id}`) ? 'off' : pct(held(`lamp:${f.id}`) ? p.input.value : level, 255))
        }
    }
    // A colour on a lamp: r, g, b from the colour, every other emitter of its profile at 0, the dimmer left to its fader.
    const lampColour = (f, hex) => {
        const n = parseInt(String(hex).slice(1), 16)
        const rgb = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
        const chans = chansOf(f)
        const values = {}
        if (!chans.some((k) => own(rgb, k))) return values
        for (const k of chans) {
            if (own(rgb, k)) values[k] = rgb[k]
            else if (EMITTERS.includes(k)) values[k] = 0
        }
        return values
    }
    const pressLampColour = async (id, hex) => {
        const f = fixturesOf().find((x) => x.id === id)
        const values = f ? lampColour(f, hex) : {}
        if (!Object.keys(values).length) return
        lampsEdited = true
        const r = await post(LIGHT + 'fixture', { id: f.id, values, on: true })
        if (!r.ok) say(`${f.name || f.id} did not change colour: ${r.error}.`, 'error')
        await tick()
    }
    const pressRelease = async (all) => {
        const h = holdsOf()
        const unis = all ? h.allUnis : h.mineUnis
        if (!unis.length) return
        const replies = await Promise.all(unis.map((u) => post(LIGHT + 'raw', all ? { clear: true, all: true, universe: u } : { clear: true, universe: u })))
        const bad = replies.find((r) => !r.ok)
        const kept = {}
        for (const r of replies) for (const [who, n] of Object.entries((r && r.kept) || {})) kept[who] = (kept[who] || 0) + (Number(n) || 0)
        if (bad) say(`The holds were not released: ${bad.error}.`, 'error')
        else if (Object.keys(kept).length) say(`Released the holds made by hand. Still held by ${Object.entries(kept).map(([w, n]) => `${w} (${n})`).join(', ')}: Release all holds lets go of those too.`, 'ok')
        else say(all ? 'Released every hold: the scenes reach every lamp again.' : 'Released the holds: the scenes reach every lamp again.', 'ok')
        await tick()
    }

    // ---- laser
    let cubeSig = null
    const cubeCards = new Map()
    const cubeName = (id) => (engineCube(id) && engineCube(id).name) || id
    const cubeState = (id) => {
        const e = engineCube(id)
        if (!e) return { text: 'Not in the laser setup', cls: 'is-warn' }
        if (!e.ip) return { text: 'No address', cls: 'is-warn' }
        if (e.stop && !(S.engine && S.engine.sim)) return { text: 'Stopped', cls: 'is-warn' }
        if (e.armed) return { text: 'On', cls: 'is-armed' }
        if (e.connected === false) return { text: 'Off · not answering', cls: 'is-warn' }
        return { text: 'Off', cls: '' }
    }
    const renderLaser = () => {
        const note = $('laserNote')
        const ids = S.desk ? cubeIds() : []
        const why = !S.desk ? `The laser desk did not answer (${S.deskErr}). The laser shows here when it does.`
            : !ids.length ? 'No cubes are set up. Add them on the Laser desk (Setup).'
            : !S.engine ? `The laser engine did not answer (${S.engineErr}).` : ''
        note.hidden = !why
        setText(note, why)
        if (!S.desk) return
        putFader($('laserMaster'), 'laser-master', Number(S.desk.master))
        setText($('laserMasterVal'), pct(held('laser-master') ? $('laserMaster').value : S.desk.master, 1))
        const look = liveLook()
        setText($('lookName'), `${look ? `Look: ${look.name}` : 'No look on the cubes'}${S.desk.blackout ? ' · blackout on' : ''}`)
        const sig = JSON.stringify(ids)
        if (sig !== cubeSig) {
            cubeSig = sig
            cubeCards.clear()
            $('lasers').replaceChildren(...ids.map((id, index) => {
                const key = `size:${id}`
                const parts = {
                    name: el('b'),
                    state: el('span', { class: 'cubestate' }),
                    on: el('button', { type: 'button', class: 'cubeon', onclick: () => pressArm(id, true) }, 'On'),
                    off: el('button', { type: 'button', class: 'cubeoff', onclick: () => pressArm(id, false) }, 'Off'),
                    stop: el('p', { class: 'stopline', hidden: true }),
                    size: el('input', { type: 'range', class: 'vfader', min: '0.3', max: '3', step: '0.01', 'data-midi': `size:${index}`, 'aria-label': `Size of ${id}` }),
                    sizeVal: el('b'),
                    canvas: el('canvas', { 'aria-label': `What ${id} draws now` })
                }
                bindFader(parts.size, key, (v) => post(DESK + 'cube', { id, size: v }), (v) => setText(parts.sizeVal, `×${v.toFixed(2)}`))
                cubeCards.set(id, parts)
                return el('div', { class: 'cubecard', 'data-id': id },
                    el('div', { class: 'strip sizestrip' }, el('span', { class: 'striphead' }, el('b', { text: 'Size' })), parts.size, parts.sizeVal),
                    el('div', { class: 'controls' },
                        el('div', { class: 'cubename' }, parts.name, parts.state),
                        el('div', { class: 'preview' }, parts.canvas, el('span', { class: 'cap', text: 'What it draws now' })),
                        parts.stop,
                        el('div', { class: 'onoff' }, parts.on, parts.off)))
            }))
        }
        for (const id of ids) {
            const p = cubeCards.get(id)
            if (!p) continue
            const e = engineCube(id)
            const st = cubeState(id)
            setText(p.name, cubeName(id))
            setText(p.state, st.text)
            setClass(p.state, `cubestate ${st.cls}`.trim())
            p.on.disabled = !(e && e.ip)
            p.on.title = e && e.ip ? 'Turn this cube On (a person\'s press, every time)' : 'No address: set it up on the Laser desk (Setup)'
            p.on.classList.toggle('danger', Boolean(e && e.armed))
            p.off.title = 'This cube\'s output off. One press, always.'
            p.off.classList.toggle('is-on', !(e && e.armed))
            const stopText = e && e.stop && !(S.engine && S.engine.sim) ? `${e.stop.text || e.stop.reason}. A guard stopped it; lift it on the Laser desk.` : ''
            p.stop.hidden = !stopText
            setText(p.stop, stopText)
            const dc = deskCube(id)
            const size = dc && Number.isFinite(Number(dc.size)) ? Number(dc.size) : null
            if (size !== null) {
                putFader(p.size, `size:${id}`, size)
                if (!held(`size:${id}`)) setText(p.sizeVal, `×${size.toFixed(2)}`)
            }
        }
    }
    const pressArm = async (id, on) => {
        const r = await post(LASER + 'arm', { armed: on, cube: id, out: OUT })
        const name = cubeName(id)
        if (on && r.needsPhrase) say(`${name}: the first On of this run asks for the laser safety officer's phrase. Press On on the Laser desk.`, 'error')
        else if (!r.ok) say(`${name} did not turn ${on ? 'On' : 'Off'}: ${r.error}.`, 'error')
        else say(on ? `${name} is On.` : `${name} is Off.`, 'ok')
        await tick()
    }

    // ---- the live strip: the look that is live on the laser, under the fingers. Every move is the laser desk's own
    // looks/edit for the look live NOW (laser/ui/desk.js edit()): a fader sends its field at most every LIVE_SEND_MS, the
    // last value always; a pad sends one looks/edit per press. Nothing is sent while no look is live.
    let litScene = null // the light scene last lit: the lighting desk forgets its active scene once a lamp is changed by hand
    let lampsEdited = false
    const liveInputs = new Map()
    const liveVals = new Map()
    const lastDepth = new Map() // look:field → the depth an effect had before a tap turned it off
    const litSceneOf = () => (litScene ? scenesOf().find((s) => s.id === litScene) || null : null)
    const liveLookFull = () => {
        if (!S.desk || !S.desk.liveId) return null
        const l = (Array.isArray(S.desk.looks) ? S.desk.looks : []).find((x) => x && x.id === S.desk.liveId)
        return { ...(S.desk.live && typeof S.desk.live === 'object' ? S.desk.live : {}), ...(l || {}), id: S.desk.liveId }
    }
    const fmtLive = (k, v) => (LIVE[k].pct ? `${Math.round(v * 100)}%` : LIVE[k].step >= 1 ? String(Math.round(v)) : v.toFixed(2))
    const noLook = () => say('No look is live: press a scene.', 'error')
    const keepLocal = (fields) => {
        const l = S.desk && (Array.isArray(S.desk.looks) ? S.desk.looks : []).find((x) => x && x.id === S.desk.liveId)
        if (l) Object.assign(l, fields)
        if (S.desk && S.desk.live && typeof S.desk.live === 'object') Object.assign(S.desk.live, fields)
    }
    const liveSenders = new Map()
    const sendLive = (field, value) => {
        const look = liveLook()
        if (!look) { noLook(); return }
        const s = liveSenders.get(field) || { timer: null, last: 0, value: null, id: null }
        liveSenders.set(field, s)
        s.value = value
        s.id = look.id
        keepLocal({ [field]: value })
        if (s.timer) return
        s.timer = setTimeout(async () => {
            s.timer = null
            s.last = Date.now()
            if (!S.desk || S.desk.liveId !== s.id) return // that look is no longer live: nothing goes to it
            const r = await post(DESK + 'looks/edit', { id: s.id, [field]: s.value })
            if (!r.ok) say(`The live look did not change: ${r.error}.`, 'error')
        }, Math.max(0, s.last + LIVE_SEND_MS - Date.now()))
    }
    const editLive = async (fields) => {
        const look = liveLook()
        if (!look) { noLook(); return }
        keepLocal(fields)
        renderLive()
        const r = await post(DESK + 'looks/edit', { id: look.id, ...fields })
        if (!r.ok) say(`The live look did not change: ${r.error}.`, 'error')
        await tick()
    }
    const pressEffect = (k) => {
        const look = liveLookFull()
        if (!look) { noLook(); return }
        const cur = Number(look[k]) || 0
        const mem = `${look.id}:${k}`
        if (cur !== 0) {
            lastDepth.set(mem, cur)
            editLive({ [k]: 0 })
        } else editLive({ [k]: lastDepth.get(mem) || LIVE[k].on })
    }
    const toggleLive = (k) => { const l = liveLookFull(); if (l) editLive({ [k]: !l[k] }); else noLook() }
    const liveFader = (k, box) => {
        const key = `live:${k}`
        const input = el('input', { type: 'range', min: String(LIVE[k].min), max: String(LIVE[k].max), step: String(LIVE[k].step), 'data-midi': key, 'aria-label': `${LIVE[k].label} of the live look`, disabled: true })
        const val = el('b', { class: 'val' })
        input.addEventListener('input', () => {
            touch(key)
            const v = LIVE[k].step >= 1 ? Math.round(Number(input.value)) : Number(input.value)
            setText(val, fmtLive(k, v))
            sendLive(k, v)
            if (k === 'x' || k === 'height') drawXY()
        })
        input.addEventListener('pointerdown', () => { dragging.add(key); touch(key) })
        for (const ev of ['pointerup', 'pointercancel', 'blur', 'change']) input.addEventListener(ev, () => { dragging.delete(key); touch(key) })
        liveInputs.set(k, input)
        liveVals.set(k, val)
        if (box) box.append(el('label', { class: 'hfader' }, el('span', { text: LIVE[k].label }), input, val))
        return input
    }
    // The XY pad: x across, height up, the finger is the beam's place; both through the same throttled looks/edit.
    const drawXY = () => {
        const dot = $('xyDot')
        const x = Number(liveInputs.get('x').value)
        const h = Number(liveInputs.get('height').value)
        dot.style.left = `${((x + 1) / 2) * 100}%`
        dot.style.top = `${(1 - (h + 1) / 2) * 100}%`
    }
    const bindXY = () => {
        const pad = $('xyPad')
        let down = false
        const move = (e) => {
            const r = pad.getBoundingClientRect()
            const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)))
            const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1)))
            for (const [k, v] of [['x', fx * 2 - 1], ['height', 1 - fy * 2]]) {
                const input = liveInputs.get(k)
                input.value = String(Math.round(v * 100) / 100)
                input.dispatchEvent(new Event('input'))
            }
        }
        const up = () => {
            down = false
            for (const k of ['live:x', 'live:height']) { dragging.delete(k); touch(k) }
        }
        pad.addEventListener('pointerdown', (e) => {
            if (!liveLook()) { noLook(); return }
            down = true
            dragging.add('live:x')
            dragging.add('live:height')
            try { if (pad.setPointerCapture && e.pointerId !== undefined) pad.setPointerCapture(e.pointerId) } catch { /* a synthetic press has no pointer to hold */ }
            move(e)
        })
        pad.addEventListener('pointermove', (e) => { if (down) move(e) })
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, up)
    }
    const buildLive = () => {
        $('liveColours').append(...SWATCHES.map((c) => el('button', { type: 'button', class: 'pad colourpad', 'data-colour': c, style: `background:${c}`, title: `Colour ${c}`, 'aria-label': `Colour ${c}`, disabled: true, onclick: () => editLive({ colour: c, rainbow: false }) })),
            el('button', { type: 'button', class: 'pad togglepad', id: 'liveRainbow', 'aria-pressed': 'false', disabled: true, onclick: () => toggleLive('rainbow') }, 'Rainbow'))
        for (const k of EFFECTS) {
            const input = liveFader(k, null)
            $('liveEffects').append(el('div', { class: 'effect' },
                el('button', { type: 'button', class: 'pad effectpad', 'data-effect': k, 'aria-pressed': 'false', disabled: true, title: `${LIVE[k].label}: a tap turns it off, a tap again on at its last depth`, onclick: () => pressEffect(k) },
                    el('span', { text: LIVE[k].label }), liveVals.get(k)), input))
        }
        $('liveEffects').append(el('button', { type: 'button', class: 'pad effectpad', id: 'liveMirror', 'aria-pressed': 'false', disabled: true, onclick: () => toggleLive('mirror') }, 'Mirror'))
        for (const k of ROW_A) liveFader(k, $('liveRowA'))
        for (const k of ROW_B) liveFader(k, $('liveRowB'))
        for (const k of ['x', 'height']) { const input = liveFader(k, null); input.hidden = true; input.classList.add('xyval'); $('xyPad').append(input) }
        bindXY()
    }
    let shapeSig = null
    const renderLive = () => {
        const look = liveLookFull()
        const on = Boolean(look)
        setText($('liveName'), !S.desk ? `Laser: no answer (${S.deskErr})` : look ? `Live: ${look.name || look.id}` : 'No look is live: press a scene')
        $('live').classList.toggle('is-idle', !on)
        for (const [k, input] of liveInputs) {
            input.disabled = !on
            const v = look ? Number(look[k]) : NaN
            if (Number.isFinite(v)) {
                putFader(input, `live:${k}`, v)
                if (!held(`live:${k}`)) setText(liveVals.get(k), fmtLive(k, v))
            } else if (!on) setText(liveVals.get(k), '')
        }
        const shapes = S.desk && Array.isArray(S.desk.shapes) && S.desk.shapes.length ? S.desk.shapes : SHAPES
        const order = shapes.includes('spots') ? ['spots', ...shapes.filter((s) => s !== 'spots')] : shapes
        if (order.join() !== shapeSig) {
            shapeSig = order.join()
            $('liveShapes').replaceChildren(...order.map((s) => el('button', { type: 'button', class: 'pad shapepad', 'data-shape': s, 'aria-pressed': 'false', onclick: () => editLive({ shape: s }) }, s === 'spots' ? 'spots · dots' : s)))
        }
        const mark = (b, p) => {
            b.disabled = !on
            b.classList.toggle('is-on', p)
            if (b.getAttribute('aria-pressed') !== null) b.setAttribute('aria-pressed', p ? 'true' : 'false')
        }
        for (const b of $('liveShapes').children) mark(b, Boolean(look && look.shape === b.dataset.shape))
        for (const b of $('liveColours').querySelectorAll('.colourpad')) mark(b, Boolean(look && !look.rainbow && String(look.colour || '').toLowerCase() === b.dataset.colour))
        mark($('liveRainbow'), Boolean(look && look.rainbow))
        mark($('liveMirror'), Boolean(look && look.mirror))
        for (const b of $('liveEffects').querySelectorAll('[data-effect]')) mark(b, Boolean(look && Number(look[b.dataset.effect])))
        if (S.desk && Number.isFinite(Number(S.desk.bpm))) {
            putFader($('bpm'), 'bpm', Number(S.desk.bpm))
            if (!held('bpm')) setText($('bpmVal'), String(Math.round(Number(S.desk.bpm))))
        }
        drawXY()
    }
    const renderSave = () => {
        const laser = Boolean(S.desk && S.desk.unsaved)
        const n = $('saveState')
        setText(n, `${laser || lampsEdited ? 'unsaved changes' : 'no unsaved changes'} · laser: ${S.desk ? (laser ? 'unsaved' : 'saved') : 'no answer'} · lamps: saved on Save scene`)
        n.classList.toggle('is-unsaved', laser || lampsEdited)
    }
    // Save scene: the lamps as they are now into the lit light scene (the lighting desk's scenes/update with restage, its
    // own Update), and the live look into its own tile on the laser desk (desk/api/store {id, look}: same id, name and
    // follows; desk/api/save would copy a changed look to "<name> 2" and move the live look off the scene's link).
    const pressSave = async () => {
        const scene = litSceneOf()
        const st = await get(DESK + 'state')
        const liveId = st.ok && typeof st.liveId === 'string' && st.liveId ? st.liveId : null
        const look = liveId ? (Array.isArray(st.looks) ? st.looks : []).find((l) => l && l.id === liveId) || (st.live && typeof st.live === 'object' ? st.live : null) : null
        const [lights, laser] = await Promise.all([
            scene ? post(LIGHT + 'scenes/update', { id: scene.id, restage: true }) : Promise.resolve(null),
            liveId && look ? post(DESK + 'store', { id: liveId, look }) : Promise.resolve(null)
        ])
        if (lights && lights.ok) lampsEdited = false
        const words = [
            !scene ? 'No light scene is lit, so no light scene was written.' : lights.ok ? `${scene.name || scene.id}: the lamps as they are now are written into it.` : `The light scene was not written: ${lights.error}.`,
            !laser ? (st.ok ? 'No look is live on the laser, so no look was written.' : `The laser desk did not answer (${st.error}).`) : laser.ok ? `Laser look ${look.name || liveId} is written as it plays now.` : `The laser look was not written: ${laser.error}.`
        ]
        say(words.join(' '), (lights && !lights.ok) || (laser && !laser.ok) || !st.ok ? 'error' : 'ok')
        await tick()
    }
    // Undo: the laser desk's own Undo (one step of its history), then the lit light scene recalled as it was written.
    const pressUndo = async () => {
        const laser = S.desk ? await post(DESK + 'undo', {}) : null
        const scene = litSceneOf()
        const lights = scene ? await post(LIGHT + 'scenes/recall', { id: scene.id }) : null
        if (lights && lights.ok) lampsEdited = false
        const words = [
            !laser ? '' : laser.ok ? 'Laser: the last change is undone.' : `Laser: nothing undone (${laser.error}).`,
            !scene ? '' : lights.ok ? `Lights: ${scene.name || scene.id} recalled as it was written.` : `Lights did not change: ${lights.error}.`
        ].filter(Boolean)
        say(words.join(' ') || 'Nothing to undo.', (laser && !laser.ok) || (lights && !lights.ok) ? 'error' : 'ok')
        await tick()
    }

    // ---- MIDI (the W3C Web MIDI API, in this page). A controller's faders and pots move the faders above with pick-up (soft
    // takeover: a control moves nothing until it passes the value on the screen, so nothing jumps); relative encoders step
    // from the screen's value; buttons press scene keys and Blackout all (dark only). The map is data: the default is the
    // Xone:K2's (midi/xone-k2.json, from its maker's guide: channel 15, 14 on the wire); Learn changes it in this browser only.
    // On, Off, the lifts, Undo, Save and Release are never a target: MIDI_OK names every target there is, and a stored map is
    // read through it. The lighting desk has its own MIDI page as well (its own map, its own controls).
    const MIDI_KEY = 'diShowDesk.midiMap.v1'
    const K2 = 14
    const MIDI_OK = /^(lamp:\d{1,3}|size:\d{1,3}|scene:\d{1,3}|live:(level|size|height|x|copies|rotation|spin|pulse|sweep|cycle|phase|pulseBeats|sweepBeats|points)|light-master|laser-master|blackout|spare)$/
    const PRESS = /^(scene:\d{1,3}|blackout)$/
    const SCENE_NOTES = [36, 37, 38, 39, 32, 33, 34, 35, 28, 29] // the K2's matrix A to J
    const MIDI_DEFAULT = [
        ...[16, 17, 18].map((num, i) => ({ kind: 'cc', ch: K2, num, target: `lamp:${i}` })),
        { kind: 'cc', ch: K2, num: 19, target: 'spare' }, // fader 4 is dead on the owner's K2 (2026-10-31): never mapped
        ...['level', 'size', 'height', 'copies'].map((k, i) => ({ kind: 'cc', ch: K2, num: 4 + i, target: `live:${k}` })),
        ...['spin', 'pulse', 'sweep'].map((k, i) => ({ kind: 'cc', ch: K2, num: 8 + i, target: `live:${k}` })),
        { kind: 'cc', ch: K2, num: 11, target: 'laser-master' },
        { kind: 'cc', ch: K2, num: 12, target: 'size:0' },
        { kind: 'cc', ch: K2, num: 15, target: 'light-master' }, // pot 12, right above the dead fader 4
        ...[13, 14].map((num) => ({ kind: 'cc', ch: K2, num, target: 'spare' })),
        ...['rotation', 'x', 'cycle', 'phase'].map((k, i) => ({ kind: 'cc', ch: K2, num: i, target: `live:${k}`, relative: true })),
        ...SCENE_NOTES.map((num, i) => ({ kind: 'note', ch: K2, num, target: `scene:${i}` })),
        { kind: 'note', ch: K2, num: 27, target: 'blackout' } // matrix P: the far corner, away from the scene keys
    ]
    const midiValid = (m) => Boolean(m && (m.kind === 'cc' || m.kind === 'note') && Number.isInteger(m.ch) && m.ch >= 0 && m.ch < 16
        && Number.isInteger(m.num) && m.num >= 0 && m.num < 128 && typeof m.target === 'string' && MIDI_OK.test(m.target)
        && (m.target === 'spare' || PRESS.test(m.target) === (m.kind === 'note')))
    const midiLoad = () => {
        try {
            const saved = JSON.parse(window.localStorage.getItem(MIDI_KEY) || 'null')
            if (Array.isArray(saved)) return saved.filter(midiValid).map((m) => ({ kind: m.kind, ch: m.ch, num: m.num, target: m.target, ...(m.relative === true ? { relative: true } : {}) }))
        } catch { /* nothing stored, or no storage here: the default map */ }
        return MIDI_DEFAULT.map((m) => ({ ...m }))
    }
    let midiMap = midiLoad()
    let midiNames = null
    let midiWhy = 'asking'
    let learning = null
    const pickup = new Map()
    const midiLine = (note = '') => {
        const base = midiNames && midiNames.length ? `MIDI: ${midiNames.join(', ')}` : `MIDI: ${midiNames ? 'none seen' : midiWhy}`
        const learn = !learning ? '' : learning.target ? ` · Learn: move one control for ${learning.target}` : ' · Learn: tap a fader, a scene key or Blackout all'
        setText($('midiLine'), `${base}${learn}${note ? ` · ${note}` : ''}`)
        $('midiLearn').classList.toggle('is-on', Boolean(learning))
        $('midiLearn').setAttribute('aria-pressed', learning ? 'true' : 'false')
    }
    const midiInput = (target) => {
        const [kind, rest] = target.split(':')
        if (kind === 'lamp') { const f = fixturesOf()[Number(rest)]; return f && lampRows.get(f.id) ? lampRows.get(f.id).input : null }
        if (kind === 'size') { const id = cubeIds()[Number(rest)]; return id && cubeCards.get(id) ? cubeCards.get(id).size : null }
        if (kind === 'live') return liveInputs.get(rest) || null
        if (target === 'light-master') return $('lightMaster')
        if (target === 'laser-master') return $('laserMaster')
        return null
    }
    const midiMove = (m, raw) => {
        const input = midiInput(m.target)
        if (!input || input.disabled) return
        const min = Number(input.min)
        const max = Number(input.max)
        const span = max - min
        const cur = Number(input.value)
        let next
        if (m.relative) next = cur + ((raw < 64 ? raw : raw - 128) * span) / 200 // two's complement steps from the screen's value
        else {
            const t = min + (raw / 127) * span
            const tol = span / 50
            const p = pickup.get(m.target) || { last: null, own: false, set: null }
            if (p.own && p.set !== null && Math.abs(cur - p.set) > tol) p.own = false // the screen moved under it: pick up again
            if (!p.own && (Math.abs(t - cur) <= tol || (p.last !== null && (p.last - cur) * (t - cur) <= 0))) p.own = true
            p.last = t
            pickup.set(m.target, p)
            if (!p.own) { midiLine(`${m.target} waits until it passes the screen`); return }
            next = t
        }
        const step = Number(input.step) || 0
        const places = (String(input.step).split('.')[1] || '').length
        const stepped = step > 0 ? Number((Math.round((next - min) / step) * step + min).toFixed(places)) : next
        input.value = String(Math.min(max, Math.max(min, stepped)))
        if (!m.relative) pickup.get(m.target).set = Number(input.value)
        input.dispatchEvent(new Event('input'))
    }
    const midiPress = (m) => {
        if (m.target === 'blackout') { pressBlackout(); return }
        const item = sceneItems()[Number(m.target.split(':')[1])]
        if (item) pressScene(item.id)
    }
    const midiLearnSet = (ctl) => {
        const target = learning.target
        const want = PRESS.test(target) ? 'note' : 'cc'
        if (ctl.kind !== want) { midiLine(`${target} takes a ${want === 'note' ? 'button' : 'fader or a knob'}`); return }
        const known = MIDI_DEFAULT.find((d) => d.kind === ctl.kind && d.ch === ctl.ch && d.num === ctl.num)
        midiMap = midiMap.filter((m) => m.target !== target && !(m.kind === ctl.kind && m.ch === ctl.ch && m.num === ctl.num))
        midiMap.push({ ...ctl, target, ...(known && known.relative ? { relative: true } : {}) })
        try { window.localStorage.setItem(MIDI_KEY, JSON.stringify(midiMap)) } catch { /* this browser keeps nothing: the map lasts until a reload */ }
        learning = null
        pickup.delete(target)
        midiLine(`learned: ${target}`)
    }
    const onMidi = (e) => {
        const d = e && e.data
        if (!d || d.length < 3) return
        const type = d[0] & 0xf0
        const kind = type === 0xb0 ? 'cc' : type === 0x90 && d[2] > 0 ? 'note' : null
        if (!kind) return
        const ctl = { kind, ch: d[0] & 0x0f, num: d[1] }
        // The panic button comes first: while Learn waits for a control, the Blackout button still blacks out and is
        // never learned onto something else (review 2026-10-31 M1).
        if (kind === 'note' && midiMap.some((x) => x.target === 'blackout' && x.kind === 'note' && x.ch === ctl.ch && x.num === ctl.num)) { pressBlackout(); return }
        if (learning && learning.target) { midiLearnSet(ctl); return }
        const m = midiMap.find((x) => x.kind === ctl.kind && x.ch === ctl.ch && x.num === ctl.num)
        if (!m || !midiValid(m) || m.target === 'spare') return
        if (kind === 'cc') midiMove(m, d[2])
        else midiPress(m)
    }
    const startMidi = async () => {
        const nav = window.navigator
        if (!nav || typeof nav.requestMIDIAccess !== 'function') { midiWhy = 'not in this browser'; midiLine(); return }
        try {
            const access = await nav.requestMIDIAccess({ sysex: false })
            const hook = () => {
                const names = []
                for (const input of access.inputs.values()) { input.onmidimessage = onMidi; names.push(input.name || 'a device') }
                midiNames = names
                midiLine()
            }
            access.onstatechange = hook
            hook()
        } catch (error) { midiWhy = `refused (${(error && error.name) || 'no answer'})`; midiLine() }
    }

    // ---- one read of each desk a second, paused while the page is hidden
    let ticking = null
    const render = () => {
        renderTop()
        renderScenes()
        renderLights()
        renderLaser()
        renderLive()
        renderSave()
    }
    const tick = () => {
        if (ticking) return ticking
        ticking = (async () => {
            const wantFollows = S.polls % FOLLOWS_EVERY === 0
            const [light, desk, engine, follows] = await Promise.all([
                get(LIGHT + 'state'), get(DESK + 'state'), get(LASER + 'state'), wantFollows ? get(DESK + 'follows') : Promise.resolve(null)
            ])
            S.light = light.ok ? light : null
            if (S.light && typeof S.light.activeScene === 'string' && S.light.activeScene) litScene = S.light.activeScene
            S.lightErr = light.ok ? '' : light.error
            S.desk = desk.ok ? desk : null
            S.deskErr = desk.ok ? '' : desk.error
            S.engine = engine.ok ? engine : null
            S.engineErr = engine.ok ? '' : engine.error
            if (follows && follows.ok) S.table = follows.table && typeof follows.table === 'object' ? follows.table : {}
            else if (follows && !S.desk) S.table = {}
            S.polls += 1
            render()
        })().finally(() => { ticking = null })
        return ticking
    }
    let pollTimer = null
    let viewTimer = null
    const schedulePoll = () => {
        clearTimeout(pollTimer)
        pollTimer = document.hidden ? null : setTimeout(async () => { await tick(); schedulePoll() }, POLL_MS)
    }
    const scheduleView = () => {
        clearTimeout(viewTimer)
        viewTimer = document.hidden ? null : setTimeout(async () => { await readView(); scheduleView() }, cubesArmed().length ? VIEW_ARMED_MS : VIEW_IDLE_MS)
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { clearTimeout(pollTimer); clearTimeout(viewTimer); pollTimer = null; viewTimer = null } else { tick().then(schedulePoll); scheduleView() }
    })

    // ---- the fixed controls
    $('blackoutAll').addEventListener('click', pressBlackout)
    $('liftLights').addEventListener('click', () => pressLift(['lights']))
    $('liftLaser').addEventListener('click', () => pressLift(['laser']))
    // The panic key, as on the laser desk (desk.js): B is Blackout all, dark only, both desks; Shift+B lifts each desk that
    // answered and is dark (the same rules as the Lift buttons). A text field keeps its keys (a slider or a checkbox does
    // not); a held key does not repeat; the gap guards the lift only, so a B retry always goes dark.
    const typing = (n) => Boolean(n && typeof n.closest === 'function' && n.closest('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=color])'))
    document.addEventListener('keydown', (e) => {
        const key = typeof e.key === 'string' && e.key.length === 1 ? e.key.toLowerCase() : e.key
        if (key !== 'b' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
        e.preventDefault()
        if (e.repeat) return
        if (e.shiftKey) pressLift(['lights', 'laser'])
        else pressBlackout()
    })
    $('releaseHolds').addEventListener('click', () => pressRelease(false))
    $('releaseAllHolds').addEventListener('click', () => pressRelease(true))
    bindFader($('lightMaster'), 'light-master', (v) => post(LIGHT + 'master', { master: v }), (v) => setText($('lightMasterVal'), pct(v, 255)))
    bindFader($('laserMaster'), 'laser-master', (v) => post(DESK + 'master', { level: v }), (v) => setText($('laserMasterVal'), pct(v, 1)))

    bindFader($('bpm'), 'bpm', (v) => post(DESK + 'bpm', { bpm: v }), (v) => setText($('bpmVal'), String(Math.round(v))))
    $('tapBtn').addEventListener('click', async () => {
        const r = await post(DESK + 'bpm', { tap: true })
        if (!r.ok) say(`Tap did not reach the laser desk: ${r.error}.`, 'error')
        await tick()
    })
    $('saveScene').addEventListener('click', pressSave)
    $('undoBtn').addEventListener('click', pressUndo)
    $('midiLearn').addEventListener('click', () => { learning = learning ? null : { target: null }; midiLine() })
    $('midiExport').addEventListener('click', () => {
        const box = $('midiMapText')
        box.hidden = !box.hidden
        if (!box.hidden) { box.value = JSON.stringify(midiMap, null, 1); box.select() }
    })
    // Learn: a tap on a fader, a scene key or Blackout all picks what the next control moved is mapped to. Blackout all still
    // goes dark on that tap (a stop always works); a scene key in Learn only picks.
    document.addEventListener('pointerdown', (e) => {
        if (!learning) return
        const n = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-midi]') : null
        if (n && MIDI_OK.test(n.dataset.midi)) { learning.target = n.dataset.midi; midiLine() }
    }, true)

    // Density (the owner, 2026-10-31 20:5x, at the stage Mac, a laptop screen with a mouse: "fix the UI, it is huge … it's
    // not the touch screen"): Touch keeps the sizes for a hand; Compact is a block of smaller tokens in show.css. Only
    // body[data-density] changes: no route, no press, no size in code. The choice is kept per browser; until one is made,
    // a fine pointer and no coarse one means Compact, anything else Touch.
    const DENSITY_KEY = 'diShowDesk.density.v1'
    const pickDensity = (stored, matchMedia) => {
        if (stored === 'touch' || stored === 'compact') return stored
        const has = (query) => { try { return typeof matchMedia === 'function' && Boolean(matchMedia(query).matches) } catch { return false } }
        return has('(pointer: fine)') && !has('(any-pointer: coarse)') ? 'compact' : 'touch'
    }
    const densityButtons = [...$('density').querySelectorAll('button[data-density]')]
    const showDensity = (mode) => {
        document.body.dataset.density = mode
        for (const b of densityButtons) b.setAttribute('aria-pressed', String(b.dataset.density === mode))
    }
    let storedDensity = null
    try { storedDensity = window.localStorage.getItem(DENSITY_KEY) } catch { /* this browser keeps nothing: the pointer decides */ }
    showDensity(pickDensity(storedDensity, typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null))
    for (const b of densityButtons) {
        b.addEventListener('click', () => {
            showDensity(b.dataset.density)
            try { window.localStorage.setItem(DENSITY_KEY, b.dataset.density) } catch { /* this browser keeps nothing: the choice lasts until a reload */ }
        })
    }

    // The scene row is labelled just Scenes; its explainer is the row's title (the owner, 21:1x: the top part "uses the
    // space badly"). The words stay in #scenesNote for screen readers.
    const scenesNote = $('scenesNote')
    const noteToTitle = () => { scenesNote.closest('.showscenes').title = scenesNote.textContent }
    noteToTitle()
    new MutationObserver(noteToTitle).observe(scenesNote, { childList: true, characterData: true, subtree: true })

    // For the page's tests and a person at the console: read-only views and one refresh. Nothing here sends a press.
    window.DiShowDesk = { refresh: tick, holdsOf, blackoutState, state: S, midiMap: () => midiMap.map((m) => ({ ...m })), pickDensity }
    buildLive()
    midiLine()
    startMidi()
    tick().then(() => { schedulePoll(); scheduleView() })
})()

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
    const HOLD_MS = 1500
    const SEND_MS = 50 // a fader sends at most this often; the last value always goes
    const BLACKOUT_GAP_MS = 600 // a second lift of the same half inside this is ignored; going dark is never gapped (a panic retry always goes)
    const TIMEOUT_MS = 4000 // a desk that does not answer is said so; nothing waits on it for good
    const NOTE_MS = 12000 // how long the words about a press stay
    const MAX_DOTS = 12
    const EMITTERS = ['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime']

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
        setText($('nowScene'), S.light ? (activeSceneName() || 'No scene') : 'Lights: no answer')
        const look = liveLook()
        setText($('nowLook'), S.desk ? (look ? look.name : 'No laser look') : 'Laser: no answer')
        const armed = cubesArmed().length
        const sim = Boolean(S.engine && S.engine.sim)
        setText($('nowLaser'), armed ? `Laser On${sim ? ' · simulated' : ''}${S.desk && S.desk.blackout ? ' · blackout' : ''}` : 'Laser Off')
        setClass($('nowLaser'), `pill nowlaser${armed ? (sim ? ' is-sim' : ' is-armed') : ''}`)
        const bo = blackoutState()
        const btn = $('blackoutAll')
        // The button only ever says "Blackout all": it has no lift. Its sub-line says what is dark and where the lifts are.
        const sub = bo.lights && bo.laser ? 'On · lift it under Lights or Laser' : bo.lights ? 'The lights blackout is on' : bo.laser ? 'The laser blackout is on' : ''
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
        say(bad.length ? `Blackout did not reach ${bad.join('; ')}.` : 'Blackout: lights and laser are dark. Lift each under Lights or Laser.', bad.length ? 'error' : 'ok')
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
            $('scenes').replaceChildren(...items.map((i) => {
                const parts = {
                    nameText: el('span', { class: 'scenetext' }),
                    lookText: el('span', { class: 'scenetext' }),
                    liveTag: el('b', { class: 'tag', text: 'LIVE', hidden: true }),
                    dots: el('span', { class: 'scenedots', 'aria-hidden': 'true' }),
                    dotSig: null
                }
                parts.btn = el('button', { type: 'button', class: 'scenebtn', 'data-id': i.id, 'aria-pressed': 'false', onclick: () => pressScene(i.id) },
                    el('span', { class: 'scenename' }, parts.nameText), el('span', { class: 'scenelook' }, parts.lookText, parts.liveTag), parts.dots)
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
            setClass(p.btn, `scenebtn${i.lights ? ' is-lights' : ''}${i.laser ? ' is-laser' : ''}${sceneBusy === i.id ? ' is-busy' : ''}`)
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
            $('lamps').replaceChildren(...fixtures.map((f) => {
                const key = `lamp:${f.id}`
                const parts = {
                    swatch: el('span', { class: 'swatch', 'aria-hidden': 'true' }),
                    name: el('b'),
                    where: el('span'),
                    input: el('input', { type: 'range', min: '0', max: '255', step: '1', 'aria-label': `Level of ${f.name || f.id}` }),
                    val: el('b', { class: 'val' })
                }
                bindFader(parts.input, key, (v) => post(LIGHT + 'fixture', { id: f.id, values: { dimmer: v }, on: true }), (v) => setText(parts.val, pct(v, 255)))
                lampRows.set(f.id, parts)
                return el('div', { class: 'lamp', 'data-id': f.id }, parts.swatch, el('span', { class: 'who' }, parts.name, parts.where), parts.input, parts.val)
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
            $('lasers').replaceChildren(...ids.map((id) => {
                const key = `size:${id}`
                const parts = {
                    name: el('b'),
                    state: el('span', { class: 'cubestate' }),
                    on: el('button', { type: 'button', class: 'cubeon', onclick: () => pressArm(id, true) }, 'On'),
                    off: el('button', { type: 'button', class: 'cubeoff', onclick: () => pressArm(id, false) }, 'Off'),
                    stop: el('p', { class: 'stopline', hidden: true }),
                    size: el('input', { type: 'range', min: '0.3', max: '3', step: '0.01', 'aria-label': `Size of ${id}` }),
                    sizeVal: el('b'),
                    canvas: el('canvas', { 'aria-label': `What ${id} draws now` })
                }
                bindFader(parts.size, key, (v) => post(DESK + 'cube', { id, size: v }), (v) => setText(parts.sizeVal, `×${v.toFixed(2)}`))
                cubeCards.set(id, parts)
                return el('div', { class: 'cubecard', 'data-id': id },
                    el('div', { class: 'controls' },
                        el('div', { class: 'cubename' }, parts.name, parts.state),
                        el('div', { class: 'onoff' }, parts.on, parts.off),
                        parts.stop,
                        el('label', { class: 'fader' }, el('span', { class: 'muted', text: 'Size' }), parts.size, parts.sizeVal)),
                    el('div', { class: 'preview' }, parts.canvas, el('span', { class: 'cap', text: 'What it draws now' })))
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

    // ---- one read of each desk a second, paused while the page is hidden
    let ticking = null
    const render = () => {
        renderTop()
        renderScenes()
        renderLights()
        renderLaser()
    }
    const tick = () => {
        if (ticking) return ticking
        ticking = (async () => {
            const wantFollows = S.polls % FOLLOWS_EVERY === 0
            const [light, desk, engine, follows] = await Promise.all([
                get(LIGHT + 'state'), get(DESK + 'state'), get(LASER + 'state'), wantFollows ? get(DESK + 'follows') : Promise.resolve(null)
            ])
            S.light = light.ok ? light : null
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

    // For the page's tests and a person at the console: read-only views and one refresh. Nothing here sends a press.
    window.DiShowDesk = { refresh: tick, holdsOf, blackoutState, state: S }
    tick().then(() => { schedulePoll(); scheduleView() })
})()

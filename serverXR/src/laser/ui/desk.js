// The laser desk's page (serverXR/src/laser/laserDesk.js is the desk; this page only edits it).
// Addresses are relative to /laser/: api/… is the laser engine, desk/api/… the desk.
//
// The light desk's hardest lesson, kept here from the start: a poll must never overwrite a value under the person's
// hand. Every field remembers when it was last touched, and the poll leaves it alone for HOLD_MS after.
'use strict'
;(() => {
    const HOLD_MS = 1500
    const SEND_MS = 50
    const POLL_DESK_MS = 500
    const POLL_ENGINE_MS = 1000
    const VIEW_MS = 80
    // The desk's colours (2026-10-31, the owner: "on colos add color paleete and have new colors there as well"): the hue
    // wheel a laser draws well, full colours, then two whites. Green is here to pick; it is no seed look's colour.
    const SWATCHES = [
        ['#ff2030', 'Red'], ['#ff6a00', 'Orange'], ['#ffb020', 'Amber'], ['#ffe600', 'Yellow'], ['#a8ff00', 'Lime'],
        ['#20ff60', 'Green'], ['#00ffb0', 'Mint'], ['#20d8ff', 'Cyan'], ['#0090ff', 'Sky'], ['#3050ff', 'Blue'],
        ['#5a2dff', 'Indigo'], ['#8040ff', 'Violet'], ['#c000ff', 'Purple'], ['#ff30c0', 'Magenta'], ['#ff5080', 'Pink'],
        ['#ffffff', 'White'], ['#ffd8a8', 'Warm white']
    ]
    const OUT = 'desk'
    // look|cube pairs a Go was pressed for while stopped; cleared when the cube runs again. Stopped still after that Go = the look's own.
const stillGone = new Set()
const BLACKOUT_GAP_MS = 400 // a second B inside this is ignored (audit rows 30, 31)
    const WHEEL_MS = 400 // a slider value that moves within this of a wheel tick is the wheel's, and is undone (rows 2, 7)

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

    let desk = null // GET desk/api/state
    let engine = null // GET api/state
    let thumbs = {}
    let page = 'control'
    const touched = new Map() // field → when the person last moved it

    // The look open in Edit (2026-10-29, the owner: "like in resolume when we will click on the down part of pattern look
    // like in name its will be preview when on the shape its will go to laser and keep changes for each scene"). A tile is
    // a clip: its NAME opens the look here, on the Preview; its PICTURE sends it to the laser. An edit changes that look in
    // the bank (each look keeps its own changes); when it is the one on the laser, the laser shows it at once. Save writes
    // the bank to disk.
    let selected = null // the id of the look open in Edit
    let firstState = true // the first answer from the desk: Edit opens the look on the laser, once
    const editing = () => desk?.looks.find((l) => l.id === selected) || null

    // ---- talking to the server
    const notice = (text) => {
        const n = $('notice')
        n.hidden = !text
        n.textContent = text || ''
    }
    const get = async (url) => {
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) throw new Error(`${url}: ${r.status}`)
        return r.json()
    }
    const post = async (url, body = {}) => {
        let r
        try {
            r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        } catch (error) {
            notice(`The desk did not answer (${error.message}). Is di running?`)
            return { ok: false, error: error.message }
        }
        const out = await r.json().catch(() => ({ ok: false, error: `${r.status}` }))
        if (!r.ok || out.ok === false) {
            // A refused stop or a refused arm must be seen, not swallowed.
            if (!out.needsPhrase) notice(out.error || `Refused (${r.status})`)
        } else notice('')
        return { status: r.status, ...out }
    }

    // ---- drawing a frame: lit stretches as flat lines, blank moves not drawn
    // `box` [x0, x1, y0, y1] frames the picture on a fixed part of the field (a playing tile: DiLaser.lookBox); `fit`
    // frames it on what is lit now (a still picture).
    const drawFrame = (canvas, points, { zone = null, dim = false, fit = false, box = null } = {}) => {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        const g = canvas.getContext('2d')
        g.clearRect(0, 0, w, h)
        let s = Math.min(w, h) / 2 * 0.94
        let cx = 0
        let cy = 0
        const lit = (points || []).filter((p) => p[2] > 0 || p[3] > 0 || p[4] > 0)
        if (box) {
            const [x0, x1, y0, y1] = box
            cx = (x0 + x1) / 2
            cy = (y0 + y1) / 2
            s = Math.min(w / Math.max(0.05, x1 - x0), h / Math.max(0.05, y1 - y0)) * 0.92
        } else if (fit && lit.length) {
            const xs = lit.map((p) => p[0])
            const ys = lit.map((p) => p[1])
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
            cx = (x0 + x1) / 2
            cy = (y0 + y1) / 2
            s = Math.min(w / Math.max(0.05, x1 - x0), h / Math.max(0.05, y1 - y0)) * 0.8
        }
        const X = (x) => w / 2 + (x - cx) * s
        const Y = (y) => h / 2 - (y - cy) * s
        // The field's square, and what the keep-in zone never draws, shaded.
        g.strokeStyle = '#1f1f23'
        g.lineWidth = 1
        if (!fit) g.strokeRect(X(-1), Y(1), 2 * s, 2 * s)
        if (zone) {
            g.fillStyle = 'rgba(255,255,255,0.035)'
            const shade = (x0, y0, x1, y1) => { if (x1 > x0 && y1 > y0) g.fillRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s) }
            shade(-1, -1, 1, zone.yMin)
            shade(-1, zone.yMax, 1, 1)
            shade(-1, zone.yMin, zone.xMin, zone.yMax)
            shade(zone.xMax, zone.yMin, 1, zone.yMax)
        }
        if (!points || points.length < 2) return
        g.lineWidth = Math.max(1, 1.4 * dpr)
        g.lineCap = 'round'
        g.lineJoin = 'round'
        g.globalAlpha = dim ? 0.45 : 1
        window.DiLaserDraw.strokeLitRuns(g, points, X, Y)
        g.globalAlpha = 1
    }

    // ---- the top bar
    const renderTop = () => {
        if (!desk) return
        // One cube (a small event): mirror, chase, the cube picker and the order step aside — they need two.
        document.body.classList.toggle('one-cube', desk.cubes.length <= 1)
        renderSaveState()
        renderCubeNote()
        const bpm = $('bpm')
        if (document.activeElement !== bpm && !held('bpm')) bpm.value = desk.bpm
        const master = $('master')
        if (!held('master')) master.value = desk.master
        $('masterVal').textContent = Math.round(Number(master.value) * 100) + '%'
        $('blackoutBtn').classList.toggle('is-on', desk.blackout)
        if ($('blackoutKeepsArm') && !held('keepArm')) $('blackoutKeepsArm').checked = Boolean(desk.blackoutKeepsArm)
        $('releaseBtn').disabled = !desk.live && !desk.blackout
        // Setup > Safety says the engine's two modes in plain words (the setting names belong in the wiki, not on the operator's screen).
        const signOffLine = $('safetySignOff'), darkLine = $('safetyDark')
        if (engine && signOffLine) signOffLine.textContent = engine.signOff === 'phrase' ? "on (the laser safety officer's phrase is asked)" : 'off (On is one click)'
        if (engine && darkLine) darkLine.textContent = engine.darkOff === 'never' ? 'off (On stays on until Off)' : 'on (it switches itself off after 5 s)'
        const pill = $('safetyPill')
        pill.className = 'pill'
        if (!engine) { pill.textContent = 'Laser engine: no answer'; pill.classList.add('is-warn'); return }
        const armed = engine.cubes.filter((c) => c.armed).length
        const stopped = engine.cubes.filter((c) => c.stop).length
        if (engine.sim) {
            pill.textContent = 'Simulated · no cube addresses'
            pill.classList.add('is-sim')
        } else if (armed) {
            pill.textContent = `${armed} of ${engine.cubes.length} on`
            pill.classList.add('is-armed')
        } else {
            pill.textContent = `Disarmed · ${engine.cubes.length} cube${engine.cubes.length === 1 ? '' : 's'}`
        }
        if (stopped && !engine.sim) { pill.textContent += ` · ${stopped} stopped`; pill.classList.add('is-warn') }
    }
    const held = (field) => Date.now() - (touched.get(field) || 0) < HOLD_MS

    $('bpm').addEventListener('change', (e) => { touched.set('bpm', Date.now()); post('desk/api/bpm', { bpm: Number(e.target.value) }).then(refreshDesk) })
    $('tapBtn').addEventListener('click', () => post('desk/api/bpm', { tap: true }).then(refreshDesk))
    let masterTimer = null
    $('master').addEventListener('input', (e) => {
        touched.set('master', Date.now())
        $('masterVal').textContent = Math.round(Number(e.target.value) * 100) + '%'
        clearTimeout(masterTimer)
        masterTimer = setTimeout(() => post('desk/api/master', { level: Number(e.target.value) }), SEND_MS)
    })
    // The button only ever turns blackout ON, so a second click (a panic double-click) never relights the cubes; lifting it
    // is Release or Shift+B (audit row 30).
    $('blackoutBtn').addEventListener('click', () => post('desk/api/blackout', { on: true }).then(refreshDesk))
    $('releaseBtn').addEventListener('click', () => post('desk/api/release').then(refreshDesk))
    // "Blackout keeps the arm": the older desk blackout (dark, armed kept, Shift+B brings it back). Off = Blackout disarms.
    const keepBox = $('blackoutKeepsArm')
    if (keepBox) keepBox.addEventListener('change', () => post('desk/api/setting', { blackoutKeepsArm: keepBox.checked }).then(refreshDesk))
    $('disarmBtn').addEventListener('click', () => post('api/arm', { armed: false }).then(refreshEngine))

    // ---- pages
    for (const tab of document.querySelectorAll('.page-tab')) {
        tab.addEventListener('click', () => {
            page = tab.dataset.page
            for (const t of document.querySelectorAll('.page-tab')) t.classList.toggle('is-active', t === tab)
            $('page-control').hidden = page !== 'control'
            $('page-setup').hidden = page !== 'setup'
            if (page === 'setup') renderSetup()
            else renderStage(true)
        })
    }

    // ---- the bank
    let dragId = null
    const renderTiles = () => {
        const box = $('tiles')
        const ids = desk.looks.map((l) => l.id).join(',')
        if (box.dataset.ids !== ids || box.dataset.thumbs !== String(thumbsAt)) {
            box.dataset.ids = ids
            box.dataset.thumbs = String(thumbsAt)
            tileCanvases.clear()
            tilesOnScreen.clear()
            tileWatch?.disconnect()
            box.replaceChildren(...desk.looks.map((look, i) => {
                const canvas = el('canvas')
                tileCanvases.set(look.id, canvas)
                tileWatch?.observe(canvas)
                const pic = el('button', {
                    class: 'pic', title: `Send ${look.name} to the laser${i < 9 ? ` (key ${i + 1})` : ''}`,
                    onclick: () => sendLook(look.id)
                }, canvas)
                const name = el('button', { class: 'name', text: look.name, title: `Open ${look.name} in Edit (preview)`, onclick: () => selectLook(look.id) })
                const tile = el('div', {
                    class: 'tile', draggable: 'true', 'data-id': look.id,
                    ondragstart: (e) => { dragId = look.id; tile.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move' },
                    ondragend: () => { dragId = null; tile.classList.remove('is-drag') },
                    ondragover: (e) => { if (dragId && dragId !== look.id) { e.preventDefault(); tile.classList.add('is-over') } },
                    ondragleave: () => tile.classList.remove('is-over'),
                    ondrop: (e) => {
                        e.preventDefault()
                        tile.classList.remove('is-over')
                        const order = desk.looks.map((l) => l.id).filter((id) => id !== dragId)
                        order.splice(order.indexOf(look.id), 0, dragId)
                        post('desk/api/looks/order', { ids: order }).then(refreshDesk)
                    }
                }, pic, name)
                if (!window.DiLaser) requestAnimationFrame(() => drawFrame(canvas, thumbs[look.id], { fit: true }))
                return tile
            }))
        }
        for (const tile of box.children) {
            tile.classList.toggle('is-live', tile.dataset.id === desk.liveId)
            tile.classList.toggle('is-selected', tile.dataset.id === selected)
            tile.classList.toggle('is-changed', [...(desk.changed || []), ...(desk.added || [])].includes(tile.dataset.id))
            const look = desk.looks.find((l) => l.id === tile.dataset.id)
            const name = tile.querySelector('.name')
            if (look && name && name.textContent !== look.name) name.textContent = look.name
        }
        const live = desk.live
        const where = desk.cubes.length <= 1 ? 'laser' : 'cubes'
        $('liveName').textContent = live
            ? `On the ${where}: ${live.name}${desk.blackout ? ' · blackout' : ''}`
            : `Nothing on the ${where}. Click a picture to send it; click a name to edit it.`
    }
    // The tiles PLAY their looks (2026-10-29, the owner: "cant see animations"), drawn here with the desk's own code
    // (lib/laser.js: shared/laserLook.cjs) on the desk's clock, as often as the desk draws the cubes. A page whose
    // lib/laser.js did not load keeps the server's still pictures.
    const TILE_MS = 50
    const tileCanvases = new Map() // look id → its tile's canvas
    // Only the tiles on screen are drawn (a tile scrolled back into view plays at once); without IntersectionObserver
    // (old browsers, tests) every tile counts as on screen.
    const tilesOnScreen = new Set()
    const tileWatch = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => { for (const e of entries) (e.isIntersecting ? tilesOnScreen.add(e.target) : tilesOnScreen.delete(e.target)) })
        : null
    const tileClock = { bpm: 120, zero: Date.now() }
    // The desk's beat as the server counted it at the last poll; a correction under 30 ms is the poll's own lag.
    const syncTileClock = () => {
        const zero = Date.now() - (desk.beat * 60000) / desk.bpm
        if (tileClock.bpm !== desk.bpm || Math.abs(zero - tileClock.zero) > 30) { tileClock.bpm = desk.bpm; tileClock.zero = zero }
    }
    let tilesDrawnAt = 0

    // ---- calm drawing (2026-10-31; the rules and the why are in drawCalm.js). calm is the default: a tile is a still picture,
    // drawn again only when its look, its size or the beat changes; the tile on the laser, the tile open in Edit and the tile
    // under the pointer play. full keeps the older motion exactly (every tile on screen plays). The choice is kept per browser.
    const calm = window.DiLaserCalm || null // a page that did not load drawCalm.js keeps the older motion
    const MOTION_KEY = 'diLaserDeskMotion'
    const storedMotion = () => { try { return window.localStorage.getItem(MOTION_KEY) } catch { return null } }
    let motion = calm ? calm.normaliseMode(storedMotion()) : 'full'
    let paintedKey = new WeakMap() // canvas → what its picture was last drawn from; the same picture is not drawn again
    let hoverId = null // the tile under the pointer
    let stillsChecked = { at: 0, key: '' }
    let previewDrawnAt = 0
    const sizeKey = (canvas) => `${canvas.clientWidth}x${canvas.clientHeight}@${Math.min(2, window.devicePixelRatio || 1)}`
    // A moving picture (a playing tile, the Preview, a stage cube): drawn unless its points, size, box and zone are what the canvas shows.
    const paintMoving = (canvas, points, opts) => {
        const key = `m|${calm.frameHash(points)}|${sizeKey(canvas)}|${calm.zoneKey(opts.zone)}|${opts.box ? opts.box.join(',') : ''}`
        if (paintedKey.get(canvas) === key) return
        paintedKey.set(canvas, key)
        drawFrame(canvas, points, opts)
    }
    // A still tile: the look at beat 0, drawn only when the look, the beat or the tile's size changed since.
    const paintStill = (canvas, look) => {
        const key = `s|${JSON.stringify(look)}|${tileClock.bpm}|${sizeKey(canvas)}`
        if (paintedKey.get(canvas) === key) return
        paintedKey.set(canvas, key)
        const points = window.DiLaser.lookPointsAt({ ...look, points: Math.min(look.points, 240) }, { t: tileClock.zero, clock: tileClock })
        drawFrame(canvas, points, { box: window.DiLaser.lookBox(look) })
    }
    const playCalm = (now) => {
        const state = { liveId: desk.liveId, selected, hoverId }
        const key = `${state.liveId}|${state.selected}|${state.hoverId}`
        const playDue = now - tilesDrawnAt >= calm.PLAY_MS
        const stillsDue = key !== stillsChecked.key || now - stillsChecked.at >= calm.STILL_CHECK_MS
        if (playDue || stillsDue) {
            if (playDue) tilesDrawnAt = now
            if (stillsDue) stillsChecked = { at: now, key }
            const t = Date.now()
            for (const look of desk.looks) {
                const canvas = tileCanvases.get(look.id)
                if (!canvas || (tileWatch && !tilesOnScreen.has(canvas))) continue
                const plays = calm.tilePlays('calm', look.id, state)
                const tile = canvas.closest('.tile')
                if (tile && tile.classList.contains('is-playing') !== plays) tile.classList.toggle('is-playing', plays)
                if (plays) {
                    if (playDue) paintMoving(canvas, window.DiLaser.lookPointsAt({ ...look, points: Math.min(look.points, 240) }, { t, clock: tileClock }), { box: window.DiLaser.lookBox(look) })
                } else if (stillsDue || !paintedKey.has(canvas)) paintStill(canvas, look)
            }
        }
        const look = editing()
        const preview = $('preview')
        if (look && preview.offsetParent && now - previewDrawnAt >= calm.PREVIEW_MS) {
            previewDrawnAt = now
            paintMoving(preview, window.DiLaser.lookPointsAt(look, { t: Date.now(), clock: tileClock, index: 0, cube: desk.cubes[0] }), { zone: engine?.zone })
        }
    }
    // The Preview counts as in use while a look is open in Edit and the Edit pane is on screen.
    const previewInUse = () => Boolean(editing()) && Boolean($('preview').offsetParent)
    const stageMs = () => (calm
        ? calm.stageIntervalMs({ mode: motion, armed: Boolean(engine?.cubes.some((c) => c.armed)), previewInUse: previewInUse() })
        : VIEW_MS)
    const motionButtons = new Map()
    const applyMotion = () => {
        document.body.dataset.motion = motion
        paintedKey = new WeakMap() // whatever the other mode drew is not trusted
        stillsChecked = { at: 0, key: '' }
        for (const [m, b] of motionButtons) { b.classList.toggle('is-on', m === motion); b.setAttribute('aria-pressed', String(m === motion)) }
        if (motion === 'full') for (const tile of $('tiles').children) tile.classList.remove('is-playing')
    }
    const setMotion = (next) => {
        motion = calm ? calm.normaliseMode(next) : 'full'
        try { window.localStorage.setItem(MOTION_KEY, motion) } catch { /* this browser keeps no setting: the choice lasts until the page reloads */ }
        applyMotion()
    }
    if (calm) {
        const box = el('div', { class: 'chips motion', role: 'group', 'aria-label': 'Motion', title: 'calm: pictures hold still except the look on the laser, the look open in Edit and the one under the pointer. full: every picture moves all the time (heavier on the computer).' },
            el('span', { class: 'muted', text: 'Motion' }))
        for (const m of calm.MODES) {
            const b = el('button', { class: 'chip', type: 'button', text: m, title: m === 'calm' ? 'Pictures hold still, except the look on the laser, the look open in Edit and the one under the pointer' : 'Every picture moves all the time', onclick: () => setMotion(m) })
            // As tall as the header's own line, so the control costs the tile bank no row (desk.css is not touched; CSSOM, never a style attribute).
            Object.assign(b.style, { minHeight: '0', padding: '0 6px', lineHeight: '14px', fontSize: '11px' })
            motionButtons.set(m, b)
            box.append(b)
        }
        $('liveName').after(box)
        $('tiles').addEventListener('pointerover', (e) => { hoverId = e.target.closest?.('.tile')?.dataset.id ?? null })
        $('tiles').addEventListener('pointerleave', () => { hoverId = null })
    }
    applyMotion()

    const playTiles = (now) => {
        // calm asks for a frame about every 33 ms, not 60 times a second; full asks as it always did.
        if (calm && motion === 'calm') setTimeout(() => requestAnimationFrame(playTiles), calm.TICK_MS)
        else requestAnimationFrame(playTiles)
        if (!window.DiLaser || !desk || page !== 'control' || document.hidden) return
        if (calm && motion === 'calm') { playCalm(now); return }
        if (now - tilesDrawnAt < TILE_MS) return
        tilesDrawnAt = now
        const t = Date.now()
        for (const look of desk.looks) {
            const canvas = tileCanvases.get(look.id)
            if (!canvas || (tileWatch && !tilesOnScreen.has(canvas))) continue
            const points = window.DiLaser.lookPointsAt({ ...look, points: Math.min(look.points, 240) }, { t, clock: tileClock })
            drawFrame(canvas, points, { box: window.DiLaser.lookBox(look) })
        }
        // The Preview: the look being edited on the first cube's field, its keep-in zone shaded, as the Stage draws.
        const look = editing()
        const preview = $('preview')
        if (look && preview.offsetParent) {
            drawFrame(preview, window.DiLaser.lookPointsAt(look, { t, clock: tileClock, index: 0, cube: desk.cubes[0] }), { zone: engine?.zone })
        }
    }

    let thumbsAt = 0
    const refreshThumbs = async () => {
        try { thumbs = await get('desk/api/thumbs'); thumbsAt += 1 } catch { /* the next poll tries again */ }
        if (desk) renderTiles()
    }

    // ---- the live look's editor
    const PICTURE = [
        { key: 'size', label: 'Size', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
        { key: 'height', label: 'Height', min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
        { key: 'x', label: 'Across', min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
        { key: 'rotation', label: 'Rotation', min: -0.5, max: 0.5, step: 1 / 360, fmt: (v) => Math.round(v * 360) + '°' },
        { key: 'copies', label: 'Copies', min: 0, max: 24, step: 1, fmt: (v) => (v ? String(v) : 'own') },
        { key: 'points', label: 'Points', min: 16, max: 1992, step: 8, fmt: (v) => String(v) },
        { key: 'level', label: 'Level', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' }
    ]
    const MOVES = [
        { key: 'spin', label: 'Spin', min: -1, max: 1, step: 1 / 64, fmt: (v) => (v ? `${+v.toFixed(3)}/b` : 'off'), title: 'Turns per beat' },
        { key: 'pulse', label: 'Pulse', min: 0, max: 1, step: 0.01, fmt: (v) => (v ? Math.round(v * 100) + '%' : 'off'), title: 'The size breathes down by this much' },
        { key: 'pulseBeats', label: 'Pulse every', min: 0.25, max: 16, step: 0.25, fmt: (v) => `${v} b` },
        { key: 'sweep', label: 'Sweep', min: 0, max: 1, step: 0.01, fmt: (v) => (v ? v.toFixed(2) : 'off'), title: 'The picture swings across the field' },
        { key: 'sweepBeats', label: 'Sweep every', min: 0.25, max: 16, step: 0.25, fmt: (v) => `${v} b` },
        { key: 'phase', label: 'Chase', min: 0, max: 4, step: 0.125, fmt: (v) => (v ? `${v} b` : 'off'), title: 'Beats each cube runs behind the one before it', multi: true }
    ]
    const CYCLE = { key: 'cycle', label: 'Each shape', min: 0.5, max: 32, step: 0.5, fmt: (v) => `${v} b` }

    // Changes are gathered and sent at most every SEND_MS: a dragged slider is one request per step, not per pixel.
    // An edit changes the look open in Edit, in the bank (the laser shows it when that look is on it).
    let pending = {}
    let sendTimer = null
    const edit = (fields) => {
        const look = editing()
        if (!look) return
        for (const k of Object.keys(fields)) touched.set(k, Date.now())
        if (pending.id && pending.id !== look.id) flush()
        Object.assign(pending, fields, { id: look.id })
        Object.assign(look, fields)
        if (desk.liveId === look.id && desk.live) Object.assign(desk.live, fields)
        desk.unsaved = true
        renderSaveState()
        if (!sendTimer) sendTimer = setTimeout(flush, SEND_MS)
    }

    const fieldRow = (spec, parent) => {
        const range = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, id: 'f-' + spec.key, 'aria-label': spec.label })
        const out = el('output', { title: 'Click to type' })
        const row = el('div', { class: 'field' + (spec.multi ? ' multi' : ''), title: spec.title || '' }, el('label', { for: 'f-' + spec.key, text: spec.label }), range, out)
        const show = () => { out.textContent = spec.fmt(Number(range.value)) }
        range.addEventListener('input', () => { show(); edit({ [spec.key]: Number(range.value) }) })
        // The wheel over a slider scrolls the pane and changes nothing (audit row 7). Alt+wheel nudges one step (Shift+Alt
        // ten), the light desk's scrub kept as a deliberate gesture.
        range.addEventListener('wheel', (e) => {
            if (!e.altKey) return
            e.preventDefault()
            const step = Number(spec.step) * (e.shiftKey ? 10 : 1)
            range.value = String(Math.min(spec.max, Math.max(spec.min, Number(range.value) + (e.deltaY < 0 ? step : -step))))
            show()
            edit({ [spec.key]: Number(range.value) })
        }, { passive: false })
        // Click the readout to type a value.
        out.addEventListener('click', () => {
            const num = el('input', { class: 'num', type: 'number', min: spec.min, max: spec.max, step: spec.step, value: range.value })
            const done = (keep) => {
                if (keep && num.value !== '') { range.value = num.value; edit({ [spec.key]: Number(num.value) }) }
                num.replaceWith(out)
                show()
            }
            num.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) })
            num.addEventListener('blur', () => done(true))
            out.replaceWith(num)
            num.focus()
            num.select()
        })
        parent.append(row)
        return { set: (v, force = false) => { if (force || (!held(spec.key) && document.activeElement !== range)) { range.value = String(v); show() } } }
    }

    const fields = {}
    for (const spec of PICTURE) fields[spec.key] = fieldRow(spec, $('pictureFields'))
    for (const spec of MOVES) fields[spec.key] = fieldRow(spec, $('moveFields'))
    fields.cycle = fieldRow(CYCLE, $('cycleField'))

    $('cycleMode').addEventListener('change', (e) => {
        touched.set('shape', Date.now())
        $('cycleField').hidden = !e.target.checked
        if (!editing()) return
        const first = editing().shape.split(',')[0]
        edit(e.target.checked ? { cycle: editing().cycle || 4 } : { shape: first, cycle: 0 })
        renderEditor()
    })
    $('rainbow').addEventListener('change', (e) => edit({ rainbow: e.target.checked }))
    $('mirror').addEventListener('change', (e) => edit({ mirror: e.target.checked }))
    $('lookName').addEventListener('input', (e) => edit({ name: e.target.value }))

    // The chips and swatches are built ONCE and only their state changes on a poll: rebuilt twice a second, a button
    // could be swapped out between the press and the release, and the press went nowhere (the light desk's dead-click
    // bug class). Each click reads the live look as it is at that moment.
    const renderShapes = () => {
        const box = $('shapes')
        if (!box.children.length) {
            box.append(...desk.shapes.map((s) => el('button', {
                class: 'chip', 'data-shape': s, text: s[0].toUpperCase() + s.slice(1),
                onclick: () => {
                    const picked = editing() ? editing().shape.split(',') : []
                    let next = [s]
                    if ($('cycleMode').checked) {
                        next = picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s]
                        if (!next.length) next = [s]
                    }
                    edit({ shape: next.join(',') })
                    renderShapes()
                }
            })))
        }
        const picked = editing() ? editing().shape.split(',') : []
        for (const chip of box.children) chip.classList.toggle('is-on', picked.includes(chip.dataset.shape))
    }
    const pickColour = (c) => { edit({ colour: c, rainbow: false }); $('rainbow').checked = false; renderSwatches() }
    const renderSwatches = () => {
        const box = $('swatches')
        if (!box.children.length) {
            const picker = el('input', { type: 'color', id: 'colourPicker', title: 'Any colour (+ under it keeps it in My colours)', 'aria-label': 'Any colour' })
            picker.addEventListener('input', () => pickColour(picker.value))
            box.append(...SWATCHES.map(([c, name]) => el('button', {
                class: 'swatch', 'data-colour': c, style: `background:${c}`, title: name, 'aria-label': name,
                onclick: () => pickColour(c)
            })), picker)
        }
        const live = editing()
        for (const b of box.querySelectorAll('.swatch')) b.classList.toggle('is-on', Boolean(live && !live.rainbow && live.colour === b.dataset.colour))
        const picker = $('colourPicker')
        if (live && document.activeElement !== picker) picker.value = live.colour
        renderMyColours()
    }
    // The palette + opens (2026-10-31, the owner: "no i eed paleet choose from colors paleet show me color pallet when +"):
    // twelve hues round the wheel, each from pale to deep, then whites and greys. A colour chosen is kept in My colours.
    const hsv = (h, s, v) => {
        const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
        return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
    }
    const CHOOSER = [
        ...[[0.3, 1], [0.6, 1], [1, 1], [1, 0.7], [1, 0.45]].flatMap(([s, v]) => Array.from({ length: 12 }, (_, i) => hsv(i * 30, s, v))),
        '#ffffff', '#fff2e0', '#ffd8a8', '#ffc080', '#e8f2ff', '#c8dcff', '#e0e0e0', '#c0c0c0', '#a0a0a0', '#808080', '#606060', '#404040'
    ]
    const hexOf = (text) => {
        const t = String(text || '').trim().replace(/^#/, '')
        const full = /^[0-9a-f]{3}$/i.test(t) ? t.split('').map((c) => c + c).join('') : t
        return /^[0-9a-f]{6}$/i.test(full) ? '#' + full.toLowerCase() : null
    }
    const keepColour = (c) => {
        const list = desk?.palette || []
        if (c && !list.includes(c)) savePalette([...list, c])
        showChooser(false)
    }
    const renderChooser = () => {
        const grid = $('chooserGrid')
        if (!grid.children.length) {
            grid.append(...CHOOSER.map((c) => el('button', { class: 'swatch', 'data-colour': c, style: `background:${c}`, title: c, 'aria-label': `Keep ${c}`, onclick: () => keepColour(c) })))
        }
        const kept = desk?.palette || []
        for (const b of grid.children) b.classList.toggle('is-on', kept.includes(b.dataset.colour))
    }
    const showChooser = (on) => {
        $('colourChooser').hidden = !on
        $('myColours').querySelector('.addcolour')?.classList.toggle('is-on', on)
        if (on) {
            renderChooser()
            const c = editing()?.colour
            if (c) { $('chooserPicker').value = c; $('chooserHex').value = c }
        }
    }
    $('chooserClose').addEventListener('click', () => showChooser(false))
    $('chooserPicker').addEventListener('input', (e) => { $('chooserHex').value = e.target.value })
    $('chooserHex').addEventListener('input', (e) => { const c = hexOf(e.target.value); if (c) $('chooserPicker').value = c })
    $('chooserHex').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('chooserAdd').click() } })
    $('chooserAdd').addEventListener('click', () => keepColour(hexOf($('chooserHex').value) || $('chooserPicker').value))

    // My colours: kept by the desk (desk.json), so every page and the next show have them.
    const savePalette = (colours) => {
        desk.palette = colours
        renderMyColours()
        post('desk/api/palette', { colours })
    }
    const renderMyColours = () => {
        const box = $('myColours')
        const list = desk?.palette || []
        if (box.dataset.key !== list.join(',')) {
            box.dataset.key = list.join(',')
            box.replaceChildren(
                ...list.map((c) => el('span', { class: 'mine' },
                    el('button', { class: 'swatch', 'data-colour': c, style: `background:${c}`, title: c, 'aria-label': `Colour ${c}`, onclick: () => pickColour(c) }),
                    el('button', { class: 'del', text: '×', title: `Take ${c} out of My colours`, 'aria-label': `Take ${c} out of My colours`, onclick: () => savePalette(list.filter((x) => x !== c)) }))),
                el('button', {
                    class: 'addcolour', text: '+', title: 'Choose a colour from the palette to keep in My colours', 'aria-label': 'Choose a colour to keep',
                    onclick: () => showChooser($('colourChooser').hidden)
                }))
            $('myColours').querySelector('.addcolour').classList.toggle('is-on', !$('colourChooser').hidden)
            $('myColoursHint').hidden = list.length > 0
        }
        const live = editing()
        for (const b of box.querySelectorAll('.swatch')) b.classList.toggle('is-on', Boolean(live && !live.rainbow && live.colour === b.dataset.colour))
    }
    const renderLookCubes = () => {
        const box = $('lookCubes')
        const ids = desk.cubes.map((c) => c.id)
        if (box.dataset.ids !== ids.join(',')) {
            box.dataset.ids = ids.join(',')
            const pick = (id) => {
                const cur = editing()?.cubes
                const all = cur === 'all'
                const picked = all ? [] : (cur || [])
                let next = id === null ? 'all' : all ? [id] : picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
                if (next !== 'all' && (!next.length || next.length === ids.length)) next = 'all'
                edit({ cubes: next })
                renderLookCubes()
            }
            box.replaceChildren(
                el('button', { class: 'chip', 'data-cube': '', text: 'All', onclick: () => pick(null) }),
                ...ids.map((id) => el('button', { class: 'chip', 'data-cube': id, text: nameOf(id), onclick: () => pick(id) }))
            )
        }
        const cur = editing()?.cubes
        for (const chip of box.children) {
            const id = chip.dataset.cube
            chip.classList.toggle('is-on', id === '' ? cur === 'all' : Array.isArray(cur) && cur.includes(id))
        }
    }
    const renderSaveState = () => {
        $('undoBtn').disabled = !desk?.canUndo
        $('redoBtn').disabled = !desk?.canRedo
        const b = $('saveBtn')
        const unsaved = Boolean(desk?.unsaved)
        b.classList.toggle('is-unsaved', unsaved)
        b.textContent = unsaved ? 'Save' : 'Saved'
        b.title = unsaved ? 'Save (Ctrl+S): every changed look becomes a new scene, the saved looks stay as they were' : 'Everything is saved'
    }
    const renderEditor = (force = false) => {
        const live = editing()
        const box = $('page-control').querySelector('.editor')
        box.classList.toggle('is-empty', !live)
        const onLaser = Boolean(live && desk.live && desk.liveId === live.id)
        const note = $('previewNote')
        note.classList.toggle('is-live', onLaser)
        const changed = Boolean(live && (desk.changed || []).includes(live.id))
        note.textContent = (onLaser
            ? 'On the laser: your changes show there at once'
            : 'Preview only. Click the look’s picture to send it to the laser')
            + (changed ? `. Save keeps your changes as a new scene; the saved ${live.name} stays as it was` : '')
        if (!live) return
        if (!held('name') && document.activeElement !== $('lookName')) $('lookName').value = live.name
        if (!held('shape')) $('cycleMode').checked = live.shape.includes(',') || live.cycle > 0
        $('cycleField').hidden = !$('cycleMode').checked
        if (!held('rainbow')) $('rainbow').checked = live.rainbow
        if (!held('mirror')) $('mirror').checked = live.mirror
        for (const [k, f] of Object.entries(fields)) f.set(live[k], force)
        if (!held('shape')) renderShapes()
        if (!held('colour')) renderSwatches()
        if (!held('cubes')) renderLookCubes()
    }

    // A tile's NAME: the look into Edit and the Preview (the laser keeps what it has).
    const selectLook = async (id) => {
        await flush()
        selected = id
        touched.clear()
        renderTiles()
        renderEditor()
    }
    // A tile's PICTURE: the look, with its kept changes, onto the laser.
    const sendLook = async (id) => {
        await flush()
        await post('desk/api/go', { look: id })
        await refreshDesk()
    }
    // Save: each changed look becomes a new scene and the look goes back as it was saved; Edit follows the new scene.
    const saveAll = async () => {
        await flush()
        const out = await post('desk/api/save')
        const moved = (out.created || []).find((c) => c.from === selected)
        if (moved) selected = moved.id
        await refreshDesk()
        renderEditor()
        return out
    }
    $('saveBtn').addEventListener('click', saveAll)
    $('copyBtn').addEventListener('click', async () => {
        if (!selected) return
        await flush()
        const out = await post('desk/api/looks/copy', { id: selected })
        if (out.ok) selected = out.id
        await refreshDesk()
        renderEditor()
    })
    // One click, as the Delete key: Ctrl+Z brings it back.
    $('deleteBtn').addEventListener('click', () => deleteSelected())
    // The edits gathered so far, to the server (at most every SEND_MS while a slider moves).
    const flush = async () => {
        clearTimeout(sendTimer)
        sendTimer = null
        if (!pending.id) return
        const body = pending
        pending = {}
        await post('desk/api/looks/edit', body)
    }

    // ---- the stage
    const nameOf = (id) => engine?.cubes.find((c) => c.id === id)?.name || id
    // The engine's dark rule (R2), said where the operator looks (N1585): a cube On with nothing to draw counts down to
    // its own Off; a cube the engine switched off says why until its next On. The engine's numbers and words, not the page's.
    // Only in the engine's darkOff 'auto' (DI_LASER_DARK_OFF=auto); an engine that does not say its mode is the older 'auto'.
    // In 'never' (the default, N1591) nothing counts down: the cube stays On and dark, and its card says so (idleHint).
    const darkAuto = () => engine?.darkOff !== 'never'
    const darkNote = (e) => {
        if (!e || !engine || engine.sim) return null
        if (darkAuto() && e.armed && e.darkOffInMs != null) return `On with nothing to draw: it switches itself off in ${Math.ceil(e.darkOffInMs / 1000)} s.${desk?.live ? '' : ' Pick a look.'}`
        if (!e.armed && e.offBy && (darkAuto() || e.offBy.reason !== 'dark-idle')) return `${e.offBy.text}. ${e.offBy.reason === 'dark-idle' && !desk?.live ? 'Pick a look, then On.' : 'Press On to use it again.'}`
        return null
    }
    // darkOff 'never': a plain hint on the cube's card while it is On with nothing to draw (no countdown, no Off). A cube
    // the desk holds with nothing live has nothing to draw too, though the desk keeps a Release's blank frame fresh.
    const idleHint = (e) => (e && engine && !engine.sim && !darkAuto() && e.armed && !e.stop && (e.nothingToDraw || (e.claimedBy === OUT && !desk?.live)) ? `On, nothing to draw.${desk?.live ? '' : ' Pick a look.'}` : null)
    const renderCubeNote = () => {
        const notes = (engine?.cubes || []).map((e) => [e, darkNote(e)]).filter(([, text]) => text)
        $('cubeNote').hidden = notes.length === 0
        $('cubeNote').textContent = notes.map(([e, text]) => (engine.cubes.length > 1 ? `${nameOf(e.id)}: ${text}` : text)).join(' · ')
    }
    const stageCanvases = new Map()
    const renderStage = (force = false) => {
        if (!desk) return
        const box = $('stage')
        const ids = desk.cubes.map((c) => c.id).join(',')
        if (force || box.dataset.ids !== ids) {
            box.dataset.ids = ids
            stageCanvases.clear()
            box.replaceChildren(...desk.cubes.map((c) => {
                const canvas = el('canvas')
                const state = el('span', { class: 'state' })
                const cut = el('span', { class: 'warn cut', hidden: true })
                const name = el('b')
                stageCanvases.set(c.id, { canvas, state, name, cut, card: null })
                const card = el('div', { class: 'cube' }, canvas, el('div', { class: 'cap' }, name, state, cut))
                stageCanvases.get(c.id).card = card
                return card
            }))
        }
        for (const c of desk.cubes) {
            const view = stageCanvases.get(c.id)
            if (!view) continue
            const e = engine?.cubes.find((x) => x.id === c.id)
            view.name.textContent = nameOf(c.id)
            view.card.classList.toggle('is-off', !c.on)
            let text = 'disarmed'
            let cls = ''
            if (!c.on) text = 'not on the desk'
            else if (c.held) { text = 'held by another Out'; cls = 'is-held' }
            else if (e?.stop && !engine.sim) { text = 'stopped'; cls = 'is-held' }
            else if (e?.armed) { text = 'on'; cls = 'is-armed' }
            else if (engine?.sim) text = 'simulated'
            view.state.textContent = text
            view.state.className = 'state ' + cls
            view.state.title = c.held || e?.stop?.text || ''
            // A picture cut by the field's edge or the keep-in zone says so; a dark cube is not shown as "on" (rows 19, 23, 24).
            if (c.dark && c.on && !c.held && !desk.blackout && text === 'on') view.state.textContent = 'on · dark'
            const note = c.on && !c.held ? darkNote(e) : null
            if (note) {
                view.state.textContent = e.armed ? `on · nothing to draw · off in ${Math.ceil(e.darkOffInMs / 1000)} s` : e.offBy.reason === 'dark-idle' ? 'off · had nothing to draw' : 'off · its Out stopped'
                view.state.className = 'state is-held'
                view.state.title = note
            }
            const hint = c.on && !c.held && !note ? idleHint(e) : null
            if (hint) {
                view.state.textContent = hint
                view.state.title = hint
            }
            view.cut.hidden = !(c.offPercent > 0)
            view.cut.textContent = c.offPercent > 0 ? `${c.offPercent} % of this look is off the field` : ''
            view.cut.title = `${c.offField || 0} lit points pushed off the field, ${c.blanked || 0} outside the keep-in zone; the cube does not draw them`
        }
    }
    let viewBusy = false
    const pollView = async () => {
        if (page === 'control' && !document.hidden && !viewBusy && stageCanvases.size) {
            viewBusy = true
            try {
                const v = await get('desk/api/view')
                for (const [id, { canvas }] of stageCanvases) {
                    // calm: a cube whose picture did not change since the last answer is not drawn again.
                    if (calm && motion === 'calm') paintMoving(canvas, v.cubes[id], { zone: engine?.zone })
                    else drawFrame(canvas, v.cubes[id], { zone: engine?.zone })
                }
            } catch { /* the stage waits for the server */ }
            viewBusy = false
        }
        setTimeout(pollView, stageMs())
    }

    // ---- setup
    // Click mode (engine.signOff 'click', the default): On is the yes, nothing to type. Phrase mode: one cube asks the
    // phrase only on the first On of a run (the engine says needsPhrase); all cubes: always the phrase.
    const arm = async (cube) => {
        const body = cube ? { armed: true, cube, out: OUT } : { armed: true }
        let out = (cube || engine?.signOff === 'click') ? await post('api/arm', body) : { needsPhrase: true }
        if (out.needsPhrase) {
            const phrase = await askPhrase()
            if (phrase === null) return
            out = await post('api/arm', { ...body, confirm: phrase })
            if (out.needsPhrase || /phrase/.test(out.error || '')) notice(out.error)
        }
        refreshEngine()
    }
    const askPhrase = () => new Promise((resolve) => {
        const modal = $('phraseModal')
        const input = $('phraseInput')
        input.value = ''
        $('phraseError').hidden = true
        modal.hidden = false
        input.focus()
        const finish = (value) => {
            modal.hidden = true
            $('phraseForm').onsubmit = null
            $('phraseCancel').onclick = null
            input.value = ''
            resolve(value)
        }
        $('phraseForm').onsubmit = (e) => { e.preventDefault(); finish(input.value) }
        $('phraseCancel').onclick = () => finish(null)
    })

    const setCube = (id, fields) => post('desk/api/cube', { id, ...fields }).then(refreshDesk)
    const renderSetup = () => {
        if (!desk || !engine) return
        $('simNote').textContent = engine.sim
            ? 'Simulated: laser.json gives no cube an address, so nothing is sent anywhere. Find cubes, then Use these.'
            : `Keep-in zone x ${engine.zone.xMin}…${engine.zone.xMax}, y ${engine.zone.yMin}…${engine.zone.yMax}`
        const rows = desk.cubes.map((c, i) => {
            const e = engine.cubes.find((x) => x.id === c.id) || {}
            const move = (d) => {
                const ids = desk.cubes.map((x) => x.id)
                const j = i + d
                if (j < 0 || j >= ids.length) return
                ;[ids[i], ids[j]] = [ids[j], ids[i]]
                Promise.all(ids.map((id, k) => post('desk/api/cube', { id, order: k }))).then(refreshDesk)
            }
            // A placement slider shows its number and sends ONE change when the hand lets go (pointer up, or a key up on the
            // arrows). A wheel or trackpad scroll over it changes nothing: that value is put back (audit rows 2, 7, 55).
            const slider = (key, min, max, step) => {
                const r = el('input', { type: 'range', min, max, step, value: c[key], 'aria-label': key })
                const out = el('output', { class: 'num', text: Number(c[key]).toFixed(2) })
                let moved = false
                let wheelAt = 0
                r.addEventListener('wheel', () => { wheelAt = Date.now() }, { passive: true })
                const undoWheel = () => { r.value = String(c[key]); out.textContent = Number(c[key]).toFixed(2); moved = false }
                r.addEventListener('input', () => {
                    if (Date.now() - wheelAt < WHEEL_MS) return undoWheel()
                    out.textContent = Number(r.value).toFixed(2)
                    moved = true
                })
                const commit = () => { if (!moved) return; moved = false; setCube(c.id, { [key]: Number(r.value) }) }
                r.addEventListener('pointerup', commit)
                r.addEventListener('keyup', commit)
                r.addEventListener('change', () => { if (Date.now() - wheelAt < WHEEL_MS) undoWheel(); else commit() })
                return el('div', { class: 'slide' }, r, out)
            }
            const check = (key) => {
                const box = el('input', { type: 'checkbox' })
                box.checked = Boolean(c[key])
                box.addEventListener('change', () => setCube(c.id, { [key]: box.checked }))
                return box
            }
            const link = engine.sim ? el('span', { class: 'muted', text: 'sim' })
                : e.connected ? el('span', { class: 'ok', text: 'answering' })
                    : el('span', { class: 'bad', text: e.ip ? 'no answer' : 'no address' })
            // A look that is itself a still beam trips again on every Go: say so, rather than a button that does nothing (R7).
            const stillKey = `${desk.liveId}|${c.id}`
            if (!e.stop) stillGone.delete(stillKey)
            const holdsStill = e.stop?.reason === 'still-beam' && stillGone.has(stillKey)
            const output = e.armed && e.stop && !engine.sim && desk.live
                ? el('button', { class: 'danger', text: holdsStill ? 'This look holds a still beam: pick another look' : 'Stopped · press Go', title: 'Press a look (Go): the cube lights again on its next new picture that passes the guards', onclick: () => { if (desk.liveId) { stillGone.add(stillKey); post('desk/api/go', { look: desk.liveId }).then(refreshDesk) } } })
                : e.armed
                ? el('button', { class: 'danger', text: 'On · turn off', onclick: () => post('api/arm', { armed: false, cube: c.id, out: OUT }).then(refreshEngine) })
                : el('button', { text: 'On', disabled: !e.ip, title: e.ip ? 'Arm this cube (in phrase mode the first On of a run asks for the phrase)' : 'No address: Find cubes, then Use these', onclick: () => arm(c.id) })
            const now = c.held ? el('span', { class: 'warn', text: 'held by another Out', title: c.held })
                : e.stop && !engine.sim ? el('span', { class: 'warn', text: `${e.stop.text || e.stop.reason}${e.armed && desk.live ? ' — press Go' : ''}` })
                    : darkNote(e) ? el('span', { class: 'warn', text: darkNote(e) })
                    : c.driving ? el('span', { text: `${c.lit} lit points` })
                        : c.dark ? el('span', { class: 'warn', text: desk.blackout ? 'dark · blackout' : c.offPercent > 0 ? `dark · ${c.offPercent} % off the field` : 'dark' })
                            : el('span', { class: 'muted', text: '—' })
            return el('tr', {},
                el('td', { class: 'order multi' }, el('button', { text: '◀', title: 'Earlier', onclick: () => move(-1) }), ' ', el('button', { text: '▶', title: 'Later', onclick: () => move(1) })),
                el('td', {}, el('b', { text: nameOf(c.id) }), el('div', { class: 'muted', text: c.id })),
                el('td', { class: 'mono' }, e.ip || '—', el('div', { class: 'muted', text: e.serial || '' })),
                el('td', {}, link),
                el('td', {}, output),
                el('td', {}, check('on')),
                el('td', {}, check('flipX')),
                el('td', {}, slider('size', 0.3, 3, 0.05)),
                el('td', {}, slider('x', -1, 1, 0.01)),
                el('td', {}, slider('y', -1, 1, 0.01)),
                el('td', {}, now)
            )
        })
        $('cubeRows').replaceChildren(...rows)
    }
    $('allOnBtn').addEventListener('click', () => arm(null))
    let found = []
    $('findBtn').addEventListener('click', async () => {
        const b = $('findBtn')
        b.disabled = true
        b.textContent = 'Searching…'
        const out = await post('api/find')
        b.disabled = false
        b.textContent = 'Find cubes'
        found = Array.isArray(out.cubes) ? out.cubes : []
        $('found').hidden = false
        $('foundList').replaceChildren(...(found.length
            ? found.map((c) => el('li', { text: `${c.modelName || 'LaserCube'} · ${c.serial} · ${c.ip}` }))
            : [el('li', { class: 'muted', text: out.error || `No cube answered${out.networks ? ` on ${out.networks.join(', ')}` : ''}.` })]))
        $('useFoundBtn').disabled = !found.length
    })
    $('useFoundBtn').addEventListener('click', async () => {
        if (!found.length) return
        await post('api/config', { cubes: found.map((c, i) => ({ serial: c.serial, ip: c.ip, name: `Cube ${i + 1}` })) })
        await refreshEngine()
        await refreshDesk()
        renderSetup()
    })

    // ---- keys (2026-10-30, the owner: "add delete ctl z ctrl v ctrl c and other shortkeys"), as Resolume and most
    // editors have them; the list is behind ? (index.html #keysHelp). Undo and redo are the desk's own (server), so they
    // reach every page and a look on the laser follows them.
    const undo = async () => { await flush(); await post('desk/api/undo'); touched.clear(); await refreshDesk(); renderEditor(true) }
    const redo = async () => { await flush(); await post('desk/api/redo'); touched.clear(); await refreshDesk(); renderEditor(true) }
    $('undoBtn').addEventListener('click', undo)
    $('redoBtn').addEventListener('click', redo)
    const showKeys = (on) => { $('keysHelp').hidden = !on; if (on) $('keysClose').focus() }
    $('keysBtn').addEventListener('click', () => showKeys(true))
    $('keysClose').addEventListener('click', () => showKeys(false))
    $('keysHelp').addEventListener('click', (e) => { if (e.target === $('keysHelp')) showKeys(false) })

    // Copy and paste carry a look as text, so a look copied here pastes into another tab or another machine's desk.
    const CLIP = 'di-laser-look'
    let clipboard = null // the last look copied on this page (when the system clipboard cannot be read)
    const lookOfText = (text) => {
        try {
            const v = JSON.parse(text)
            return v && v.kind === CLIP && v.look && typeof v.look === 'object' ? v.look : null
        } catch { return null }
    }
    const pasteLook = async (look) => {
        if (!look) return
        await flush()
        const out = await post('desk/api/looks/paste', { look, after: selected })
        if (out.ok) selected = out.id
        await refreshDesk()
        renderEditor()
    }
    const deleteSelected = async () => {
        if (!selected) return
        await flush()
        const at = desk.looks.findIndex((l) => l.id === selected)
        await post('desk/api/looks/delete', { id: selected })
        await refreshDesk()
        // Edit moves to the look that took its place, as a list does.
        selected = desk.looks[Math.min(at, desk.looks.length - 1)]?.id ?? null
        renderTiles()
        renderEditor()
    }
    const duplicateSelected = () => $('copyBtn').click()

    // ---- A link can propose removals (2026-10-31, ledger N1586): the page opens with ?remove=<id>,<id>,... and a person is asked.
    // Scripts and agents cannot delete looks (the laser routes answer only this page), so this is how they ask. The link is a
    // proposal, never a command: nothing is sent until Remove is tapped; the page decides what may go (the look on the laser
    // never goes); what goes is the Edit pane's own delete, one look at a time, then the page's own Save. Undo steps exactly
    // that back through the desk's undo and Saves again. The block: parseRemoveLink, planRemoval, paintRemoveAsk, showRemoveAsk,
    // confirmRemoval, undoRemoval, keepRemoveAsk, startRemoveAsk (called once at the end), and one line in refreshDesk.
    const REMOVE_MAX = 200 // ids in one link
    const REMOVE_ID = /^[A-Za-z0-9_-]{1,40}$/ // the desk's own look-id alphabet and length (laserDesk.js idOf)
    // phase: none | wait (the link is read, the desk has not answered yet) | ask | busy | done | undone | refused
    const removeAsk = { phase: 'none', ids: [], plan: null, title: '', note: '', rows: [], removed: [], undoSteps: 0, after: null }
    const refusedAnswer = (out) => out.ok === false || (out.status ?? 200) >= 400

    // The ids a link proposes, or why it cannot be read: { ids } or { error }; null when the link has no ?remove.
    const parseRemoveLink = (search) => {
        const params = new URLSearchParams(search)
        if (!params.has('remove')) return null
        const parts = params.getAll('remove').join(',').split(',').filter((s) => s !== '')
        if (!parts.length) return { error: 'The link names no looks.' }
        if (parts.length > REMOVE_MAX) return { error: `The link names ${parts.length} looks. One link may name at most ${REMOVE_MAX}.` }
        const bad = parts.filter((s) => !REMOVE_ID.test(s))
        if (bad.length) {
            const shown = bad.slice(0, 3).map((s) => `"${s.slice(0, 40)}"`).join(', ')
            return { error: `The link has ${bad.length === 1 ? 'an id' : 'ids'} that no look can have: ${shown}${bad.length > 3 ? ' ...' : ''}. A look id is letters, digits, - and _ only.` }
        }
        return { ids: [...new Set(parts)] }
    }

    // What a tap would do with the bank as it is now: the looks that go, the one that stays because it is on the laser,
    // and the ids that are not in the bank.
    const planRemoval = (ids) => {
        const byId = new Map(desk.looks.map((l) => [l.id, l]))
        const rows = ids.map((id) => {
            const look = byId.get(id)
            if (!look) return { id, name: id, state: 'missing' }
            return { id, name: look.name || id, state: id === desk.liveId ? 'live' : 'go' }
        })
        return { rows, go: rows.filter((r) => r.state === 'go').map((r) => r.id) }
    }

    const paintRemoveAsk = () => {
        const a = removeAsk
        const box = $('removeAsk')
        box.hidden = a.phase === 'none' || a.phase === 'wait'
        box.dataset.phase = a.phase
        $('removeTitle').textContent = a.title
        $('removeNote').textContent = a.note
        const list = $('removeList')
        list.textContent = ''
        for (const r of a.rows) {
            const li = document.createElement('li')
            li.className = `is-${r.state}`
            li.append(r.name) // a text node: a look's name is never read as markup
            if (r.state !== 'go') {
                const tag = document.createElement('span')
                tag.className = 'tag'
                tag.textContent = r.state === 'live' ? 'kept: it is on the laser' : 'not found'
                li.append(tag)
            }
            list.append(li)
        }
        list.hidden = !a.rows.length
        const going = a.plan ? a.plan.go.length : 0
        const asking = a.phase === 'ask' && going > 0
        const busy = a.phase === 'busy'
        $('removeGo').hidden = !(asking || (busy && a.rows.length > 0))
        $('removeGo').textContent = `Remove ${going}`
        $('removeGo').disabled = busy
        $('removeUndo').hidden = !(a.phase === 'done' && a.undoSteps > 0)
        $('removeKeep').textContent = asking || (busy && a.rows.length > 0) ? 'Keep them' : 'Close'
        $('removeKeep').disabled = busy
    }
    const sayRemoveAsk = (phase, title, note = '', rows = []) => {
        Object.assign(removeAsk, { phase, title, note, rows })
        paintRemoveAsk()
    }
    const dropRemoveQuery = () => {
        try {
            const url = new URL(location.href)
            if (!url.searchParams.has('remove')) return
            url.searchParams.delete('remove')
            history.replaceState(history.state, '', url.pathname + url.search + url.hash)
        } catch { /* a page that cannot rewrite its address keeps the link; the panel is closed either way */ }
    }

    // The question, asked on the first answer from the desk (only then are the looks' names known) and again if the bank moved.
    const showRemoveAsk = (changed = false) => {
        const plan = planRemoval(removeAsk.ids)
        removeAsk.plan = plan
        const n = plan.go.length
        const title = n === 0 ? 'Nothing to remove.' : n === 1 ? 'Remove this look from the bank?' : `Remove these ${n} looks from the bank?`
        const note = [
            changed ? 'The bank changed while this was open. Check the list, then tap again.' : '',
            n && desk.unsaved ? 'The bank has other changes that are not saved yet. Remove saves them too.' : ''
        ].filter(Boolean).join(' ')
        sayRemoveAsk('ask', title, note, plan.rows)
        $('removeKeep').focus() // the safe answer has the focus: Enter alone removes nothing
    }

    const confirmRemoval = async () => {
        if (removeAsk.phase !== 'ask' || !removeAsk.plan.go.length) return // one tap, one removal
        const asked = removeAsk.plan.go
        sayRemoveAsk('busy', `Removing ${asked.length === 1 ? '1 look' : `${asked.length} looks`}...`, '', removeAsk.plan.rows)
        await flush()
        await refreshDesk()
        // What was confirmed is what goes: if the bank moved since the question (another look went live, one was deleted), ask again.
        const now = planRemoval(removeAsk.ids)
        if (now.go.join() !== asked.join()) { showRemoveAsk(true); return }
        const gone = []
        let stopped = ''
        let unsaved = ''
        let steps = 0
        try {
            for (const id of asked) {
                const out = await post('desk/api/looks/delete', { id })
                if (refusedAnswer(out)) { stopped = out.error || `refused (${out.status})`; break }
                gone.push(id)
            }
            steps = gone.length
            if (gone.length && !stopped) {
                const out = await saveAll() // the page's own Save
                if (!out || refusedAnswer(out)) unsaved = (out && out.error) || 'the desk did not answer'
                else if ((out.created || []).length) steps += 1 // a Save that also made scenes from other edits is one more step
            } else await refreshDesk()
        } catch (error) {
            stopped = stopped || error.message
        }
        removeAsk.removed = gone
        removeAsk.undoSteps = gone.length ? steps : 0
        removeAsk.after = { ids: desk.looks.map((l) => l.id), unsaved: Boolean(desk.unsaved) }
        const extra = []
        if (now.rows.some((r) => r.state === 'live')) extra.push('1 kept: it is on the laser')
        const missing = now.rows.filter((r) => r.state === 'missing').length
        if (missing) extra.push(`${missing} not found`)
        const head = stopped ? [`Stopped: ${stopped}`, 'not saved'] : unsaved ? [`Not saved: ${unsaved}`] : ['Saved']
        dropRemoveQuery()
        sayRemoveAsk('done', stopped ? `Removed ${gone.length} of ${asked.length}` : `Removed ${gone.length}`, [...head, ...extra].join(' · '))
    }

    const undoRemoval = async () => {
        if (removeAsk.phase !== 'done' || !removeAsk.undoSteps) return
        const { removed, undoSteps, after, title } = removeAsk
        sayRemoveAsk('busy', 'Bringing them back...')
        await flush()
        await refreshDesk()
        // Undo here steps back exactly this removal: if the bank moved after it, a step back would take that change instead.
        if (desk.looks.map((l) => l.id).join() !== after.ids.join() || Boolean(desk.unsaved) !== after.unsaved) {
            removeAsk.undoSteps = 0
            sayRemoveAsk('done', title, 'The bank changed after this, so Undo here would take that change back too. Use Undo in the top bar, one step at a time.')
            return
        }
        for (let i = 0; i < undoSteps; i += 1) {
            const out = await post('desk/api/undo')
            if (refusedAnswer(out) || out.undone === false) break
        }
        await refreshDesk()
        const back = removed.filter((id) => desk.looks.some((l) => l.id === id)).length
        let note = ''
        if (back) {
            const out = await saveAll() // the removal was saved, so its undo is saved too
            note = !out || refusedAnswer(out) ? `Not saved: ${(out && out.error) || 'the desk did not answer'}` : 'Saved'
        }
        sayRemoveAsk('undone', back === removed.length ? `Brought back ${back}` : `Brought back ${back} of ${removed.length}`, note)
    }

    const keepRemoveAsk = () => {
        if (removeAsk.phase === 'busy') return
        sayRemoveAsk('none', '', '')
        dropRemoveQuery()
    }

    const startRemoveAsk = () => {
        $('removeGo').addEventListener('click', confirmRemoval)
        $('removeUndo').addEventListener('click', undoRemoval)
        $('removeKeep').addEventListener('click', keepRemoveAsk)
        const link = parseRemoveLink(location.search)
        if (!link) return
        if (link.error) { sayRemoveAsk('refused', 'Nothing was removed.', link.error); return }
        removeAsk.ids = link.ids
        removeAsk.phase = 'wait'
    }

    // ---- A link can propose a look set (2026-10-31): the page opens with ?set=<name> and a person is asked. A set is a file
    // shipped with the page, ui/sets/<name>.json = { set, about, looks: [whole looks] }, its looks carrying the ids of the
    // bank's looks. The link is a proposal, never a command: nothing is sent until Apply is tapped. Then each look of the set
    // that is in the bank gets the Edit pane's own edit (desk/api/looks/edit with every field but id and follows, so a look
    // keeps its scene link; the look on the laser redraws at once), a look the bank lacks is made by the page's own paste
    // (desk/api/looks/paste: the desk names it and gives its id), and ONE Store of the last of them writes the bank in place.
    // Not Save: Save keeps every saved look whose picture changed and adds the change as a NEW look ("... 2", a new id, no
    // scene link), so a set would double the bank and the scenes would still recall the old looks (laserDesk.js saveBank).
    // Store writes the bank as it is, so the set waits while the bank has other changes that are not saved (Store would write
    // those in place too). Undo steps the edits and pastes back through the desk's undo and Stores again. The block:
    // parseSetLink, loadSet, planSet, setRow, drawSetPics, paintSetAsk, showSetAsk, confirmSet, undoSet, keepSetAsk,
    // startSetAsk (called once at the end), and one line in refreshDesk.
    const SET_NAME = /^[a-z0-9-]{1,60}$/ // the file sets/<name>.json
    const SET_SKIP = new Set(['id', 'follows']) // the desk's edit takes every look field but these (laserDesk.js editLook)
    const SET_TAGS = { live: 'on the laser: changes at once', new: 'new: will be created' }
    // phase: none | load (the set's file is on its way) | wait (the desk has not answered yet) | ask | busy | done | undone | refused
    const setAsk = { phase: 'none', name: '', set: null, plan: null, held: false, title: '', note: '', rows: [], applied: [], undoSteps: 0, after: null }
    const setFields = (look) => Object.fromEntries(Object.entries(look).filter(([k]) => !SET_SKIP.has(k)))

    // The set a link names, or why it cannot be read: { name } or { error }; null when the link has no ?set.
    const parseSetLink = (search) => {
        const params = new URLSearchParams(search)
        if (!params.has('set')) return null
        const names = params.getAll('set')
        if (names.length > 1) return { error: 'The link names more than one set. One link, one set.' }
        if (!names[0]) return { error: 'The link names no set.' }
        if (!SET_NAME.test(names[0])) return { error: `"${names[0].slice(0, 60)}" cannot be a set name. A set name is a-z, 0-9 and - only, at most 60.` }
        return { name: names[0] }
    }

    // The set's file as data: { set } or { error } in plain words. Every id must be one a look can have, each once.
    const loadSet = async (name) => {
        let r
        try {
            r = await fetch(`sets/${name}.json`, { cache: 'no-store' })
        } catch (error) {
            return { error: `The set "${name}" could not be read (${error.message}).` }
        }
        const set = r.ok ? await r.json().catch(() => null) : null
        if (r.status === 404 || (r.ok && (!set || typeof set !== 'object'))) return { error: `No set named "${name}".` }
        if (!r.ok) return { error: `The set "${name}" could not be read (${r.status}).` }
        const looks = Array.isArray(set.looks) ? set.looks.filter((l) => l && typeof l === 'object' && !Array.isArray(l)) : []
        if (!looks.length || looks.length !== set.looks.length) return { error: `The set "${name}" has no looks the desk can read.` }
        if (looks.length > REMOVE_MAX) return { error: `The set "${name}" has ${looks.length} looks. A set may have at most ${REMOVE_MAX}.` }
        const ids = looks.map((l) => String(l.id ?? ''))
        const bad = ids.filter((id) => !REMOVE_ID.test(id))
        if (bad.length) return { error: `The set "${name}" has ${bad.length === 1 ? 'a look' : `${bad.length} looks`} without a good id. A look id is letters, digits, - and _ only.` }
        const twice = ids.find((id, i) => ids.indexOf(id) !== i)
        if (twice) return { error: `The set "${name}" names the look "${twice}" twice.` }
        const about = (Array.isArray(set.about) ? set.about : String(set.about ?? '').split('\n'))
            .map((line) => String(line).replace(/^#+\s*/, '').trim()).filter(Boolean).slice(0, 6)
        return { set: { name, about, looks } }
    }

    // What a tap would do with the bank as it is now: each look of the set that is in the bank changes (now → new; the one on
    // the laser at once), a look the bank lacks is made new. `key` is what a person confirmed: the fields the set changes as
    // the bank holds them now, and which look is live.
    const planSet = (looks) => {
        const byId = new Map(desk.looks.map((l) => [l.id, l]))
        const rows = looks.map((look) => {
            const now = byId.get(look.id)
            const keys = Object.keys(setFields(look))
            if (!now) return { id: look.id, name: String(look.name || look.id), state: 'new', look, keys, changes: keys }
            const changes = keys.filter((k) => JSON.stringify(look[k]) !== JSON.stringify(now[k]))
            return { id: look.id, name: String(now.name || look.id), state: look.id === desk.liveId ? 'live' : 'go', now, look, keys, changes }
        })
        const key = JSON.stringify(rows.map((r) => [r.id, r.state, r.now ? r.keys.map((k) => r.now[k] ?? null) : null]))
        return { rows, go: rows.map((r) => r.id), key }
    }

    // A look in words: its shape and its colour, with a square of the colour.
    const lookSide = (look) => {
        const span = document.createElement('span')
        const swatch = document.createElement('i')
        swatch.className = 'swatch'
        if (!look.rainbow && /^#[0-9a-f]{6}$/i.test(String(look.colour))) swatch.style.background = look.colour
        span.append(swatch, `${look.shape} ${look.rainbow ? 'rainbow' : look.colour}`) // text: never read as markup
        return span
    }
    const setRow = (r) => {
        const li = document.createElement('li')
        li.className = `is-${r.state}`
        li.dataset.id = r.id
        const pic = document.createElement('canvas')
        pic.className = 'setpic'
        pic.title = `${r.name}: the new look`
        const head = document.createElement('div')
        head.className = 'sethead'
        const name = document.createElement('b')
        name.textContent = r.name
        const id = document.createElement('span')
        id.className = 'setid'
        id.textContent = r.id
        head.append(name, id)
        if (SET_TAGS[r.state]) {
            const tag = document.createElement('span')
            tag.className = 'tag'
            tag.textContent = SET_TAGS[r.state]
            head.append(tag)
        }
        const change = document.createElement('div')
        change.className = 'setchange'
        if (r.now) change.append(lookSide(r.now), ' → ', lookSide(r.look))
        else change.append(lookSide(r.look))
        const more = r.now ? r.changes.filter((k) => k !== 'shape' && k !== 'colour') : []
        if (r.now && !r.changes.length) change.append(' · no change')
        else if (more.length) change.append(` · also ${more.join(', ')}`)
        li.append(pic, head, change)
        return li
    }

    // The new look's picture, drawn by the desk's own tile drawing (DiLaser, loaded beside the page) from the set's look alone.
    const drawSetPics = (tries = 0) => {
        if (setAsk.phase !== 'ask' && setAsk.phase !== 'busy') return
        if (!window.DiLaser) { if (tries < 40) requestAnimationFrame(() => drawSetPics(tries + 1)); return }
        for (const li of $('setList').children) {
            const row = setAsk.rows.find((r) => r.id === li.dataset.id)
            const canvas = li.querySelector('canvas')
            if (!row || !canvas) continue
            try {
                const look = { ...row.look, points: Math.min(Number(row.look.points) || 240, 240) }
                drawFrame(canvas, window.DiLaser.lookPointsAt(look, { t: tileClock.zero, clock: tileClock }), { box: window.DiLaser.lookBox(look) })
            } catch { /* a look the drawing cannot read keeps a dark picture; the words still say what changes */ }
        }
    }

    const paintSetAsk = () => {
        const a = setAsk
        const box = $('setAsk')
        box.hidden = a.phase === 'none' || a.phase === 'load' || a.phase === 'wait'
        box.dataset.phase = a.phase
        $('setTitle').textContent = a.title
        const about = $('setAbout')
        about.textContent = ''
        const lines = (a.phase === 'ask' || a.phase === 'busy') && a.set ? a.set.about : []
        for (const line of lines) {
            const p = document.createElement('p')
            p.textContent = line
            about.append(p)
        }
        about.hidden = !lines.length
        $('setNote').textContent = a.note
        const list = $('setList')
        list.textContent = ''
        for (const r of a.rows) list.append(setRow(r))
        list.hidden = !a.rows.length
        const going = a.plan ? a.plan.go.length : 0
        const asking = a.phase === 'ask' && going > 0 && !a.held
        const busy = a.phase === 'busy'
        $('setGo').hidden = !(asking || (busy && a.rows.length > 0))
        $('setGo').textContent = `Apply ${going}`
        $('setGo').disabled = busy
        $('setUndo').hidden = !(a.phase === 'done' && a.undoSteps > 0)
        $('setKeep').textContent = a.phase === 'ask' || (busy && a.rows.length > 0) ? 'Keep as is' : 'Close'
        $('setKeep').disabled = busy
        drawSetPics()
    }
    const saySetAsk = (phase, title, note = '', rows = []) => {
        Object.assign(setAsk, { phase, title, note, rows })
        paintSetAsk()
    }
    const dropSetQuery = () => {
        try {
            const url = new URL(location.href)
            if (!url.searchParams.has('set')) return
            url.searchParams.delete('set')
            history.replaceState(history.state, '', url.pathname + url.search + url.hash)
        } catch { /* a page that cannot rewrite its address keeps the link; the panel is closed either way */ }
    }

    // The question, asked once the set's file and the bank are both known, again if the bank moved, and again when other
    // unsaved changes come or go (Apply waits for them).
    const showSetAsk = (changed = false) => {
        const plan = planSet(setAsk.set.looks)
        setAsk.plan = plan
        setAsk.held = Boolean(desk.unsaved)
        const live = plan.rows.find((r) => r.state === 'live')
        const made = plan.rows.filter((r) => r.state === 'new').length
        const note = [
            changed ? 'The bank changed while this was open. Check the list, then tap again.' : '',
            setAsk.held ? 'The bank has other changes that are not saved yet. Save or undo them first: Apply writes the bank in place, so it would write them too.' : '',
            live ? `The live look changes at once: ${live.name} is on the laser.` : '',
            made ? `${made === 1 ? '1 look is' : `${made} looks are`} not in the bank yet: Apply makes ${made === 1 ? 'it' : 'them'}.` : ''
        ].filter(Boolean).join(' ')
        saySetAsk('ask', `Apply the look set ${setAsk.name}?`, note, plan.rows)
        $('setKeep').focus() // the safe answer has the focus: Enter alone applies nothing
    }

    const confirmSet = async () => {
        if (setAsk.phase !== 'ask' || setAsk.held || !setAsk.plan.go.length) return // one tap, one set
        const asked = setAsk.plan
        saySetAsk('busy', `Applying ${asked.go.length === 1 ? '1 look' : `${asked.go.length} looks`}...`, '', asked.rows)
        await flush()
        await refreshDesk()
        // What was confirmed is what is sent: if the bank moved since the question (a look edited, made, deleted or put on the
        // laser, or other changes not saved), nothing is sent and the question is asked again.
        const now = planSet(setAsk.set.looks)
        if (now.key !== asked.key || desk.unsaved) { showSetAsk(true); return }
        // The look open in Edit goes last, so its edit never joins a slider drag that the desk's undo holds as one step.
        const order = [...now.rows].sort((x, y) => (x.id === selected) - (y.id === selected))
        const madeAs = new Map() // a set's id → the id the desk gave the look it made
        const applied = []
        let last = null // the last look written: its Store writes the bank in place
        let stopped = ''
        let unsaved = ''
        try {
            for (const r of order) {
                const fields = setFields(r.look)
                let out
                if (r.state === 'new') {
                    // Made after the look before it in the set, so the bank keeps the set's order.
                    const prev = now.rows.slice(0, now.rows.indexOf(r)).reverse().find((p) => p.state !== 'new' || madeAs.has(p.id))
                    out = await post('desk/api/looks/paste', { look: fields, after: prev ? madeAs.get(prev.id) || prev.id : null })
                    if (!refusedAnswer(out)) madeAs.set(r.id, out.id)
                } else out = await post('desk/api/looks/edit', { id: r.id, ...fields })
                if (refusedAnswer(out)) { stopped = out.error || `refused (${out.status})`; break }
                applied.push(r.id)
                last = { id: madeAs.get(r.id) || r.id, look: fields }
            }
            if (last && !stopped) {
                const out = await post('desk/api/store', last) // in place: not Save (see above)
                if (refusedAnswer(out)) unsaved = out.error || `refused (${out.status})`
            }
        } catch (error) {
            stopped = stopped || error.message
        }
        await refreshDesk()
        setAsk.applied = applied.map((id) => madeAs.get(id) || id)
        setAsk.undoSteps = applied.length // one desk undo step per edit and per paste; Store adds none
        setAsk.after = { ids: desk.looks.map((l) => l.id).join(), key: planSet(setAsk.set.looks).key, unsaved: Boolean(desk.unsaved) }
        const extra = []
        if (now.rows.some((r) => r.state === 'live' && applied.includes(r.id))) extra.push('the live look changed at once')
        if (madeAs.size) extra.push(`${madeAs.size} made new`)
        for (const [id, as] of madeAs) if (as !== id) extra.push(`${id} was made as ${as}`)
        const head = stopped ? [`Stopped: ${stopped}`, 'not saved'] : unsaved ? [`Not saved: ${unsaved}`] : ['Saved in place']
        dropSetQuery()
        saySetAsk('done', stopped ? `Applied ${applied.length} of ${asked.go.length}` : `Applied ${applied.length}`, [...head, ...extra].join(' · '))
    }

    const undoSet = async () => {
        if (setAsk.phase !== 'done' || !setAsk.undoSteps) return
        const { applied, undoSteps, after, title } = setAsk
        saySetAsk('busy', 'Putting the looks back...')
        await flush()
        await refreshDesk()
        // Undo here steps back exactly this set: if the bank moved after it, a step back would take that change instead.
        if (desk.looks.map((l) => l.id).join() !== after.ids || planSet(setAsk.set.looks).key !== after.key || Boolean(desk.unsaved) !== after.unsaved) {
            setAsk.undoSteps = 0
            saySetAsk('done', title, 'The bank changed after this, so Undo here would take that change back too. Use Undo in the top bar, one step at a time.')
            return
        }
        let back = 0
        for (let i = 0; i < undoSteps; i += 1) {
            const out = await post('desk/api/undo')
            if (refusedAnswer(out) || out.undone === false) break
            back += 1
        }
        await refreshDesk()
        let note = ''
        const keep = back ? desk.looks.find((l) => applied.includes(l.id)) || desk.looks[0] : null
        if (keep) {
            const out = await post('desk/api/store', { id: keep.id, look: setFields(keep) }) // the set was written in place, so its undo is too
            note = refusedAnswer(out) ? `Not saved: ${out.error || `refused (${out.status})`}` : 'Saved in place'
            await refreshDesk()
        }
        saySetAsk('undone', back === undoSteps ? `Put back ${undoSteps}` : `Put back ${back} of ${undoSteps}`, note)
    }

    const keepSetAsk = () => {
        if (setAsk.phase === 'busy') return
        saySetAsk('none', '', '')
        dropSetQuery()
    }

    const startSetAsk = () => {
        $('setGo').addEventListener('click', confirmSet)
        $('setUndo').addEventListener('click', undoSet)
        $('setKeep').addEventListener('click', keepSetAsk)
        const link = parseSetLink(location.search)
        if (!link) return
        if (link.error) { saySetAsk('refused', 'No look set was applied.', link.error); return }
        setAsk.name = link.name
        setAsk.phase = 'load'
        loadSet(link.name).then((out) => {
            if (out.error) { saySetAsk('refused', 'No look set was applied.', out.error); return }
            setAsk.set = out.set
            if (desk) showSetAsk() // the desk has answered: ask now; else its first answer asks (refreshDesk)
            else setAsk.phase = 'wait'
        })
    }
    // Arrows walk the bank as it is laid out: left/right one look, up/down one row.
    const moveSelection = (key) => {
        const tiles = [...$('tiles').children]
        if (!tiles.length) return
        const at = tiles.findIndex((t) => t.dataset.id === selected)
        const cols = Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length)
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key]
        const next = at < 0 ? 0 : Math.min(tiles.length - 1, Math.max(0, at + step))
        selectLook(tiles[next].dataset.id)
        // The keyboard's focus goes with the selection, so Enter and the next arrow start from the look in Edit.
        tiles[next].querySelector('.name')?.focus({ preventScroll: true })
        tiles[next].scrollIntoView({ block: 'nearest' })
    }
    // Typing: a text field keeps its own keys (its own undo, copy, arrows). A slider or a checkbox keeps only arrows.
    const typing = (el) => Boolean(el.closest('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=color])'))
    const inField = (el) => Boolean(el.closest('input, textarea, select'))
    document.addEventListener('copy', (e) => {
        if (!desk || typing(e.target) || String(window.getSelection())) return
        const look = editing()
        if (!look) return
        clipboard = JSON.parse(JSON.stringify(look))
        e.clipboardData.setData('text/plain', JSON.stringify({ kind: CLIP, look: clipboard }))
        e.preventDefault()
        notice(`Copied ${look.name}. Ctrl+V pastes it as a new look.`)
    })
    document.addEventListener('paste', (e) => {
        if (!desk || typing(e.target)) return
        const look = lookOfText(e.clipboardData?.getData('text/plain') || '') || clipboard
        if (!look) return
        e.preventDefault()
        pasteLook(look)
    })
    let blackoutKeyAt = 0
    document.addEventListener('keydown', (e) => {
        if (!desk) return
        const mod = e.ctrlKey || e.metaKey
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
        if (!$('keysHelp').hidden) { if (key === 'Escape' || key === '?') { e.preventDefault(); showKeys(false) } return }
        if (key === 'Escape' && !$('colourChooser').hidden) { e.preventDefault(); showChooser(false); return }
        if (mod && key === 's') { e.preventDefault(); saveAll(); return }
        // Esc leaves a text field (a second Esc closes Edit); every other key there is the field's own.
        if (typing(e.target)) { if (key === 'Escape') e.target.blur(); return }
        // B is the panic key: it works on every page and with focus on a slider or a checkbox, only a text field keeps it.
        // Held down it does not repeat, and a second B within BLACKOUT_GAP_MS is ignored (audit rows 6, 14, 30, 31).
        if (key === 'b' && !mod && !e.altKey) {
            e.preventDefault()
            const t = Date.now()
            if (e.repeat) return
            // The gap guards the lift only: a panic retry of B (dark) is never dropped (review D4).
            if (e.shiftKey && t - blackoutKeyAt < BLACKOUT_GAP_MS) return
            if (e.shiftKey) blackoutKeyAt = t
            // B only ever goes dark; Shift+B lifts it, so a second press never lights the cubes (review 1218 M1).
            post('desk/api/blackout', { on: !e.shiftKey }).then(refreshDesk)
            return
        }
        // A held key does not repeat a look-changing action (Backspace deleting looks, T climbing to 300 BPM); the arrows walk.
        if (e.repeat && !/^Arrow/.test(key)) return
        // The keys below act on the Control page only: on Setup they would change looks nobody can see (audit row 3).
        const control = page === 'control'
        if (key === 'F2' && !mod) {
            if (selected && control) { e.preventDefault(); $('lookName').focus(); $('lookName').select() }
            return
        }
        if (mod && !e.altKey) {
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
            else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
            else if (key === 'd' && control) { e.preventDefault(); duplicateSelected() }
            return // Ctrl+C and Ctrl+V arrive as copy and paste (above)
        }
        if (e.altKey) return
        if (key === '?') { e.preventDefault(); showKeys(true); return }
        if (key === 'Escape') {
            if (selected) { selected = null; renderTiles(); renderEditor() }
            return
        }
        if (inField(e.target)) return // a slider's arrows move the slider
        if (key === 't') { $('tapBtn').click(); return }
        if (!control) return
        if (/^[1-9]$/.test(key)) {
            const look = desk.looks[Number(key) - 1]
            if (look) sendLook(look.id)
        } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
            e.preventDefault()
            moveSelection(key)
        } else if (key === 'Enter') {
            // A tile's own buttons send the look in Edit; any other focused button (Save, Blackout…) clicks itself.
            if (e.target.closest('button') && !e.target.closest('.tile')) return
            if (selected) { e.preventDefault(); sendLook(selected) }
        } else if (key === 'Delete' || key === 'Backspace') {
            if (selected) { e.preventDefault(); deleteSelected() }
        }
    })

    // ---- polling
    // ---- Follow light scenes (2026-10-31; serverXR/src/laser/sceneLink.js): the switch in the top bar, what it followed
    // last, and in Edit the light scene the open look follows. Its own block, called once from refreshDesk.
    const FOLLOW_WHY = { origin: 'not from di\'s own page', 'no look': 'no look follows it', 'no scene': 'no scene', off: 'off' }
    const followBox = $('followLight')
    const followPick = $('followsScene')
    const renderFollow = () => {
        const f = desk && desk.follow
        if (!f) return
        if (followBox && !held('followLight')) followBox.checked = Boolean(f.on)
        const status = $('followStatus')
        const last = f.on ? f.last : null
        let text = '', full = ''
        if (last) {
            const scene = last.scene.name || last.scene.id
            const why = FOLLOW_WHY[last.why] || last.why
            if (last.look) {
                const look = last.name || last.look
                text = look === scene ? `Followed ${scene}` : `Followed ${scene} → ${look}`
                full = `Last light scene followed: ${scene}. The laser look it put live: ${look}.`
            } else {
                text = `${scene}: not followed (${why})`
                full = `Last light scene: ${scene}. Not followed: ${why}.`
            }
        }
        if (status) { status.textContent = text; status.title = full }
        if (!followPick || held('follows') || document.activeElement === followPick) return
        const look = selected ? desk.looks.find((l) => l.id === selected) : null
        followPick.disabled = !look
        const scenes = Array.isArray(f.scenes) ? f.scenes : []
        const want = look && typeof look.follows === 'string' ? look.follows : ''
        const unset = Boolean(look && look.follows == null)
        const sig = JSON.stringify([scenes, want, unset])
        if (followPick.dataset.sig === sig) return
        followPick.dataset.sig = sig
        followPick.replaceChildren()
        const add = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; followPick.append(o) }
        add('', unset ? 'not set (matched by name)' : 'none')
        for (const s of scenes) add(s.id, s.name || s.id)
        if (want && !scenes.some((s) => s.id === want)) add(want, `(missing) ${want}`)
        followPick.value = want
    }
    if (followBox) followBox.addEventListener('change', () => { touched.set('followLight', Date.now()); post('desk/api/follow', { on: followBox.checked }).then(refreshDesk) })
    if (followPick) followPick.addEventListener('change', () => {
        touched.set('follows', Date.now())
        if (selected) post('desk/api/looks/follows', { id: selected, scene: followPick.value }).then(refreshDesk)
    })

    const refreshDesk = async () => {
        try {
            desk = await get('desk/api/state')
            if (desk.loadMessage) notice(desk.loadMessage)
            syncTileClock()
            // A page opened while a look plays opens that look in Edit; a look deleted elsewhere closes.
            if (firstState && selected === null && desk.liveId) selected = desk.liveId
            firstState = false
            if (selected && !desk.looks.some((l) => l.id === selected)) selected = null
            // Edits still on their way: the server's answer must not jump the sliders back.
            const mine = desk.looks.find((l) => l.id === pending.id)
            if (mine) { Object.assign(mine, pending); desk.unsaved = true }
        } catch (error) {
            notice(`The laser desk did not answer (${error.message}).`)
            return
        }
        renderTop()
        renderTiles()
        renderEditor()
        renderFollow()
        renderStage()
        if (removeAsk.phase === 'wait') showRemoveAsk() // a link proposed removals: ask once the looks' names are known
        if (setAsk.phase === 'wait' || (setAsk.phase === 'ask' && setAsk.held !== Boolean(desk.unsaved))) showSetAsk() // a link proposed a set: ask once the bank is known, again when other unsaved changes come or go
        if (page === 'setup' && !setupHeld()) renderSetup()
    }
    const refreshEngine = async () => {
        try { engine = await get('api/state') } catch { engine = null }
        renderTop()
        if (desk) renderStage()
        if (page === 'setup' && !setupHeld()) renderSetup()
    }
    // The setup table is rebuilt by the polls, except while a hand is on it (a slider mid-drag, a box just ticked).
    // Held also while a pointer is down anywhere, and while a slider or a typed box in the table has focus: the table is
    // never rebuilt under the hand (audit rows 22, 2).
    let setupTouchedAt = 0
    let pointerDown = false
    for (const type of ['pointerdown', 'input', 'keydown']) $('page-setup').addEventListener(type, () => { setupTouchedAt = Date.now() })
    document.addEventListener('pointerdown', () => { pointerDown = true }, true)
    for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => { pointerDown = false }, true)
    const setupHeld = () => pointerDown || Date.now() - setupTouchedAt < HOLD_MS
        || Boolean(document.activeElement?.closest?.('#cubeRows') && document.activeElement.matches('input[type=range], input[type=number], input[type=text], select'))
    const loop = (fn, ms) => { const run = async () => { if (!document.hidden) await fn(); setTimeout(run, ms) }; run() }

    // The pinned bar's height, for scroll-padding-top (it wraps to three rows on a phone).
    const bar = document.querySelector('.topbar')
    const barHeight = () => document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px')
    new ResizeObserver(barHeight).observe(bar)
    barHeight()

    // ---- Scenes row (2026-10-31, N1612; the rules are in sceneRow.js). One button per light-desk scene, in the light desk's own
    // order. A press recalls the scene on the light desk (../light/api/scenes/recall) and puts the look that follows it on the
    // cubes with this desk's own Go (desk/api/go, the route a tile's picture click uses), whatever "Follow light scenes" says.
    // It sends nothing else: no arm, no Blackout, no Master, no BPM. Its own block: it reads the two desks with its own poll
    // (once a second; not while the page is hidden or on Setup) and is drawn in place, so a poll never swaps a button under a hand.
    const sceneApi = window.DiSceneRow
    const sceneBox = $('sceneRow')
    const sceneGrid = $('sceneGrid')
    const sceneNote = $('sceneNote')
    if (sceneApi && sceneBox && sceneGrid && sceneNote) {
        const sr = { list: [], active: null, table: {}, lightOk: null, lightBlackout: false, polls: 0, say: null, busy: false, btns: new Map(), listSig: null }
        const sceneGet = async (url) => {
            const ctl = new AbortController()
            const timer = setTimeout(() => ctl.abort(), sceneApi.LIGHT_TIMEOUT_MS)
            try {
                const r = await fetch(url, { cache: 'no-store', signal: ctl.signal })
                if (!r.ok) throw new Error(`${url}: ${r.status}`)
                return await r.json()
            } finally { clearTimeout(timer) }
        }
        // POST under the light desk's routes. Answers { ok, status?, error?, down?, timeout?, gone? } and never throws.
        const lightPost = async (path, body) => {
            const ctl = new AbortController()
            const timer = setTimeout(() => ctl.abort(), sceneApi.LIGHT_TIMEOUT_MS)
            try {
                const r = await fetch(sceneApi.LIGHT_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
                const out = await r.json().catch(() => ({}))
                if (!r.ok) return { ok: false, status: r.status, error: out.error || '' }
                if (out.ok === false || out.error) return { ok: false, error: out.error || '', gone: !out.error }
                return { ok: true, ...out }
            } catch (error) {
                return { ok: false, down: true, timeout: Boolean(error && error.name === 'AbortError') }
            } finally { clearTimeout(timer) }
        }
        // The same steps as a tile's picture (sendLook): send what is still pending, Go, read the desk again.
        const goSceneLook = async (lookId) => {
            await flush()
            const out = await post(sceneApi.GO_PATH, { look: lookId })
            await refreshDesk()
            return { ok: out.ok === true, error: out.error }
        }
        const setText = (node, value) => { if (node.textContent !== value) node.textContent = value }
        const paintSceneRow = () => {
            const items = sceneApi.sceneItems({ scenes: sr.list, activeScene: sr.active, table: sr.table, liveId: desk ? desk.liveId : null })
            const listSig = JSON.stringify(items.map((i) => [i.id, i.name]))
            if (listSig !== sr.listSig) { // the buttons are built again only when the list of scenes changes
                sr.listSig = listSig
                sr.btns.clear()
                sceneGrid.replaceChildren(...items.map((i) => {
                    const parts = {
                        nameText: el('span', { class: 'scenetext' }),
                        lookText: el('span', { class: 'scenetext' }),
                        liveTag: el('b', { class: 'tag', text: 'LIVE', hidden: true })
                    }
                    parts.btn = el('button', { type: 'button', class: 'scenebtn', 'data-id': i.id, 'aria-pressed': 'false', onclick: () => pressSceneBtn(i.id) },
                        el('span', { class: 'scenename' }, parts.nameText), el('span', { class: 'scenelook' }, parts.lookText, parts.liveTag))
                    sr.btns.set(i.id, parts)
                    return parts.btn
                }))
            }
            for (const i of items) { // marks and words in place
                const p = sr.btns.get(i.id)
                setText(p.nameText, i.name)
                setText(p.lookText, sceneApi.lookLine(i))
                p.liveTag.hidden = !i.laser
                const cls = 'scenebtn' + (i.lights ? ' is-lights' : '') + (i.laser ? ' is-laser' : '')
                if (p.btn.className !== cls) p.btn.className = cls
                const pressed = i.lights ? 'true' : 'false'
                if (p.btn.getAttribute('aria-pressed') !== pressed) p.btn.setAttribute('aria-pressed', pressed)
                const title = sceneApi.titleOf(i)
                if (p.btn.title !== title) p.btn.title = title
            }
            if (sr.say && Date.now() - sr.say.at > sceneApi.NOTE_MS) sr.say = null
            let words = ''
            let bad = false
            if (sr.say) { words = sr.say.text; bad = sr.say.kind === 'error' }
            else if (sr.lightOk === false) { bad = true; words = items.length ? 'The light desk is not answering. The marks are from its last answer.' : 'The light desk is not answering, so there are no scenes to show.' }
            else if (sr.lightOk === true) { // the scene the lights are on, in words (the button is marked too: border, bar, aria-pressed)
                const on = items.find((i) => i.lights)
                words = !items.length ? 'The light desk has no scenes.' : on ? `Lights on: ${on.name}.` : 'No light scene is on yet.'
            }
            setText(sceneNote, words)
            sceneNote.className = bad ? 'muted is-error' : 'muted'
        }
        const pollScenes = async () => {
            if (page !== 'control') return
            sr.polls += 1
            const [light, map] = await Promise.allSettled([sceneGet(sceneApi.LIGHT_API + 'summary'), sceneGet('desk/api/follows')])
            if (light.status === 'fulfilled') {
                const sum = light.value || {}
                sr.lightOk = true
                sr.active = typeof sum.activeScene === 'string' ? sum.activeScene : null
                sr.lightBlackout = sum.blackout === true
                const count = Number(sum.scenes)
                if (sr.polls === 1 || (Number.isFinite(count) && count !== sr.list.length) || sr.polls % sceneApi.LIST_EVERY === 0) {
                    try {
                        const j = await sceneGet(sceneApi.LIGHT_API + 'scenes/summary')
                        if (Array.isArray(j.scenes)) sr.list = j.scenes.map((s) => ({ id: s.id, name: s.name }))
                    } catch { /* the next poll tries again */ }
                }
            } else sr.lightOk = false
            if (map.status === 'fulfilled' && map.value) sr.table = map.value.table || map.value.links || {}
            paintSceneRow()
        }
        const pressSceneBtn = async (id) => {
            if (sr.busy) return // a second press while the first is on its way is the same press
            const item = sceneApi.sceneItems({ scenes: sr.list, table: sr.table }).find((i) => i.id === id)
            if (!item) return
            sr.busy = true
            try {
                const out = await sceneApi.pressScene({
                    scene: { id: item.id, name: item.name },
                    link: item.look ? { look: item.look.id, name: item.look.name } : null,
                    lightPost,
                    goLook: goSceneLook,
                    blackout: { laser: Boolean(desk && desk.blackout), light: sr.lightBlackout }
                })
                sr.say = { text: out.text, kind: out.kind, at: Date.now() }
            } finally { sr.busy = false }
            await pollScenes() // the light desk's active scene as it is now; paints the row
        }
        sceneBox.title = "One press recalls the scene on the light desk and puts the laser look that follows it on the cubes. The scene the lights are on has a bright border; the look on the cubes says LIVE."
        sceneBox.hidden = false
        loop(pollScenes, sceneApi.POLL_MS)
    }

    startRemoveAsk()
    startSetAsk()
    refreshThumbs()
    loop(refreshEngine, POLL_ENGINE_MS)
    loop(refreshDesk, POLL_DESK_MS)
    pollView()
    requestAnimationFrame(playTiles)
    window.addEventListener('resize', () => { if (desk) { const box = $('tiles'); box.dataset.ids = ''; renderTiles() } })
})()

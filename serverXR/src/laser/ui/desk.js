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
    const SWATCHES = ['#ff2030', '#ffb020', '#ffffff', '#20d8ff', '#3050ff', '#8040ff', '#ff30c0', '#20ff60']
    const OUT = 'desk'

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
        for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1]
            const b = points[i]
            if (!(b[2] > 0 || b[3] > 0 || b[4] > 0)) continue
            g.strokeStyle = `rgb(${Math.round(b[2] * 255)},${Math.round(b[3] * 255)},${Math.round(b[4] * 255)})`
            g.beginPath()
            g.moveTo(X(a[0]), Y(a[1]))
            g.lineTo(X(b[0]), Y(b[1]))
            g.stroke()
        }
        g.globalAlpha = 1
    }

    // ---- the top bar
    const renderTop = () => {
        if (!desk) return
        // One cube (a small event): mirror, chase, the cube picker and the order step aside — they need two.
        document.body.classList.toggle('one-cube', desk.cubes.length <= 1)
        const bpm = $('bpm')
        if (document.activeElement !== bpm && !held('bpm')) bpm.value = desk.bpm
        const master = $('master')
        if (!held('master')) master.value = desk.master
        $('masterVal').textContent = Math.round(Number(master.value) * 100) + '%'
        $('blackoutBtn').classList.toggle('is-on', desk.blackout)
        $('releaseBtn').disabled = !desk.live
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
    $('blackoutBtn').addEventListener('click', () => post('desk/api/blackout', { on: !desk?.blackout }).then(refreshDesk))
    $('releaseBtn').addEventListener('click', () => post('desk/api/release').then(refreshDesk))
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
            box.replaceChildren(...desk.looks.map((look, i) => {
                const canvas = el('canvas')
                tileCanvases.set(look.id, canvas)
                const tile = el('button', {
                    class: 'tile', draggable: 'true', 'data-id': look.id, title: `${look.name}${i < 9 ? ` (key ${i + 1})` : ''}`,
                    onclick: () => post('desk/api/go', { look: look.id }).then(refreshDesk),
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
                }, canvas, el('span', { text: look.name }))
                if (!window.DiLaser) requestAnimationFrame(() => drawFrame(canvas, thumbs[look.id], { fit: true }))
                return tile
            }))
        }
        for (const tile of box.children) tile.classList.toggle('is-live', tile.dataset.id === desk.liveId)
        const live = desk.live
        const where = desk.cubes.length <= 1 ? 'laser' : 'cubes'
        $('liveName').textContent = live
            ? `On the ${where}: ${live.name}${desk.liveId ? '' : ' (edited, not stored)'}${desk.blackout ? ' · blackout' : ''}`
            : `Nothing on the ${where}. Press a look.`
    }
    // The tiles PLAY their looks (2026-10-29, the owner: "cant see animations"), drawn here with the desk's own code
    // (lib/laser.js: shared/laserLook.cjs) on the desk's clock, as often as the desk draws the cubes. A page whose
    // lib/laser.js did not load keeps the server's still pictures.
    const TILE_MS = 50
    const tileCanvases = new Map() // look id → its tile's canvas
    const tileClock = { bpm: 120, zero: Date.now() }
    // The desk's beat as the server counted it at the last poll; a correction under 30 ms is the poll's own lag.
    const syncTileClock = () => {
        const zero = Date.now() - (desk.beat * 60000) / desk.bpm
        if (tileClock.bpm !== desk.bpm || Math.abs(zero - tileClock.zero) > 30) { tileClock.bpm = desk.bpm; tileClock.zero = zero }
    }
    let tilesDrawnAt = 0
    const playTiles = (now) => {
        requestAnimationFrame(playTiles)
        if (!window.DiLaser || !desk || page !== 'control' || document.hidden || now - tilesDrawnAt < TILE_MS) return
        tilesDrawnAt = now
        const t = Date.now()
        for (const look of desk.looks) {
            const canvas = tileCanvases.get(look.id)
            if (!canvas) continue
            const points = window.DiLaser.lookPointsAt({ ...look, points: Math.min(look.points, 240) }, { t, clock: tileClock })
            drawFrame(canvas, points, { box: window.DiLaser.lookBox(look) })
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
    let pending = {}
    let sendTimer = null
    const edit = (fields) => {
        for (const k of Object.keys(fields)) touched.set(k, Date.now())
        Object.assign(pending, fields)
        if (desk?.live) Object.assign(desk.live, fields)
        if (!sendTimer) {
            sendTimer = setTimeout(async () => {
                const body = pending
                pending = {}
                sendTimer = null
                await post('desk/api/live', body)
            }, SEND_MS)
        }
    }

    const fieldRow = (spec, parent) => {
        const range = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, id: 'f-' + spec.key, 'aria-label': spec.label })
        const out = el('output', { title: 'Click to type' })
        const row = el('div', { class: 'field' + (spec.multi ? ' multi' : ''), title: spec.title || '' }, el('label', { for: 'f-' + spec.key, text: spec.label }), range, out)
        const show = () => { out.textContent = spec.fmt(Number(range.value)) }
        range.addEventListener('input', () => { show(); edit({ [spec.key]: Number(range.value) }) })
        // The wheel nudges a slider one step (the light desk's scrub), only while the pointer is on it.
        range.addEventListener('wheel', (e) => {
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
        return { set: (v) => { if (!held(spec.key) && document.activeElement !== range) { range.value = String(v); show() } } }
    }

    const fields = {}
    for (const spec of PICTURE) fields[spec.key] = fieldRow(spec, $('pictureFields'))
    for (const spec of MOVES) fields[spec.key] = fieldRow(spec, $('moveFields'))
    fields.cycle = fieldRow(CYCLE, $('cycleField'))

    $('cycleMode').addEventListener('change', (e) => {
        touched.set('shape', Date.now())
        $('cycleField').hidden = !e.target.checked
        if (!desk?.live) return
        const first = desk.live.shape.split(',')[0]
        edit(e.target.checked ? { cycle: desk.live.cycle || 4 } : { shape: first, cycle: 0 })
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
                    const picked = desk.live ? desk.live.shape.split(',') : []
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
        const picked = desk.live ? desk.live.shape.split(',') : []
        for (const chip of box.children) chip.classList.toggle('is-on', picked.includes(chip.dataset.shape))
    }
    const renderSwatches = () => {
        const box = $('swatches')
        if (!box.children.length) {
            const picker = el('input', { type: 'color', id: 'colourPicker', title: 'Any colour', 'aria-label': 'Any colour' })
            picker.addEventListener('input', () => { edit({ colour: picker.value, rainbow: false }); $('rainbow').checked = false; renderSwatches() })
            box.append(...SWATCHES.map((c) => el('button', {
                class: 'swatch', 'data-colour': c, style: `background:${c}`, title: c, 'aria-label': `Colour ${c}`,
                onclick: () => { edit({ colour: c, rainbow: false }); $('rainbow').checked = false; renderSwatches() }
            })), picker)
        }
        const live = desk.live
        for (const b of box.querySelectorAll('.swatch')) b.classList.toggle('is-on', Boolean(live && !live.rainbow && live.colour === b.dataset.colour))
        const picker = $('colourPicker')
        if (live && document.activeElement !== picker) picker.value = live.colour
    }
    const renderLookCubes = () => {
        const box = $('lookCubes')
        const ids = desk.cubes.map((c) => c.id)
        if (box.dataset.ids !== ids.join(',')) {
            box.dataset.ids = ids.join(',')
            const pick = (id) => {
                const cur = desk.live?.cubes
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
        const cur = desk.live?.cubes
        for (const chip of box.children) {
            const id = chip.dataset.cube
            chip.classList.toggle('is-on', id === '' ? cur === 'all' : Array.isArray(cur) && cur.includes(id))
        }
    }
    const renderEditor = () => {
        const live = desk.live
        $('page-control').querySelector('.editor').classList.toggle('is-empty', !live)
        if (!live) return
        if (!held('name') && document.activeElement !== $('lookName')) $('lookName').value = live.name
        if (!held('shape')) $('cycleMode').checked = live.shape.includes(',') || live.cycle > 0
        $('cycleField').hidden = !$('cycleMode').checked
        if (!held('rainbow')) $('rainbow').checked = live.rainbow
        if (!held('mirror')) $('mirror').checked = live.mirror
        for (const [k, f] of Object.entries(fields)) f.set(live[k])
        if (!held('shape')) renderShapes()
        if (!held('colour')) renderSwatches()
        if (!held('cubes')) renderLookCubes()
        $('storeBtn').disabled = !desk.liveId
        $('deleteBtn').disabled = !desk.liveId
    }

    $('storeBtn').addEventListener('click', async () => {
        if (!desk?.liveId) return
        await flush()
        await post('desk/api/store', { id: desk.liveId, name: $('lookName').value })
        await refreshDesk()
        refreshThumbs()
    })
    $('saveNewBtn').addEventListener('click', async () => {
        await flush()
        await post('desk/api/store', { name: $('lookName').value || 'Look' })
        await refreshDesk()
        refreshThumbs()
    })
    // Two clicks to delete: no browser dialog, and a slip of the hand does not lose a tile.
    let deleteArmedAt = 0
    $('deleteBtn').addEventListener('click', async () => {
        const b = $('deleteBtn')
        if (Date.now() - deleteArmedAt > 3000) {
            deleteArmedAt = Date.now()
            b.textContent = 'Delete? Click again'
            setTimeout(() => { b.textContent = 'Delete tile' }, 3000)
            return
        }
        deleteArmedAt = 0
        b.textContent = 'Delete tile'
        await post('desk/api/looks/delete', { id: desk.liveId })
        await refreshDesk()
        refreshThumbs()
    })
    const flush = async () => {
        if (!sendTimer) return
        clearTimeout(sendTimer)
        sendTimer = null
        const body = pending
        pending = {}
        await post('desk/api/live', body)
    }

    // ---- the stage
    const nameOf = (id) => engine?.cubes.find((c) => c.id === id)?.name || id
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
                const name = el('b')
                stageCanvases.set(c.id, { canvas, state, name, card: null })
                const card = el('div', { class: 'cube' }, canvas, el('div', { class: 'cap' }, name, state))
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
        }
    }
    let viewBusy = false
    const pollView = async () => {
        if (page === 'control' && !document.hidden && !viewBusy && stageCanvases.size) {
            viewBusy = true
            try {
                const v = await get('desk/api/view')
                for (const [id, { canvas }] of stageCanvases) drawFrame(canvas, v.cubes[id], { zone: engine?.zone })
            } catch { /* the stage waits for the server */ }
            viewBusy = false
        }
        setTimeout(pollView, VIEW_MS)
    }

    // ---- setup
    // One cube: the phrase only on the first On of a run (the engine says needsPhrase). All cubes: always the phrase.
    const arm = async (cube) => {
        const body = cube ? { armed: true, cube, out: OUT } : { armed: true }
        let out = cube ? await post('api/arm', body) : { needsPhrase: true }
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
            const slider = (key, min, max, step) => {
                const r = el('input', { type: 'range', min, max, step, value: c[key], 'aria-label': key })
                r.addEventListener('change', () => setCube(c.id, { [key]: Number(r.value) }))
                return r
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
            const output = e.armed
                ? el('button', { class: 'danger', text: 'On · turn off', onclick: () => post('api/arm', { armed: false, cube: c.id, out: OUT }).then(refreshEngine) })
                : el('button', { text: 'On', disabled: !e.ip, title: e.ip ? 'Arm this cube (the first On of a run asks for the phrase)' : 'No address: Find cubes, then Use these', onclick: () => arm(c.id) })
            const now = c.held ? el('span', { class: 'warn', text: 'held by another Out', title: c.held })
                : e.stop && !engine.sim ? el('span', { class: 'warn', text: e.stop.text || e.stop.reason })
                    : c.driving ? el('span', { text: `${c.points} points` }) : el('span', { class: 'muted', text: '—' })
            return el('tr', {},
                el('td', { class: 'order multi' }, el('button', { text: '◀', title: 'Earlier', onclick: () => move(-1) }), ' ', el('button', { text: '▶', title: 'Later', onclick: () => move(1) })),
                el('td', {}, el('b', { text: nameOf(c.id) }), el('div', { class: 'muted', text: c.id })),
                el('td', { class: 'mono' }, e.ip || '—', el('div', { class: 'muted', text: e.serial || '' })),
                el('td', {}, link),
                el('td', {}, output),
                el('td', {}, check('on')),
                el('td', {}, check('flipX')),
                el('td', {}, slider('size', 0, 2, 0.05)),
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

    // ---- keys: 1–9 a look, B blackout, T tap (never while typing)
    document.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || !desk) return
        if (/^[1-9]$/.test(e.key)) {
            const look = desk.looks[Number(e.key) - 1]
            if (look) post('desk/api/go', { look: look.id }).then(refreshDesk)
        } else if (e.key === 'b' || e.key === 'B') $('blackoutBtn').click()
        else if (e.key === 't' || e.key === 'T') $('tapBtn').click()
    })

    // ---- polling
    const refreshDesk = async () => {
        try {
            desk = await get('desk/api/state')
            if (desk.loadMessage) notice(desk.loadMessage)
            syncTileClock()
        } catch (error) {
            notice(`The laser desk did not answer (${error.message}).`)
            return
        }
        renderTop()
        renderTiles()
        renderEditor()
        renderStage()
        if (page === 'setup' && !setupHeld()) renderSetup()
    }
    const refreshEngine = async () => {
        try { engine = await get('api/state') } catch { engine = null }
        renderTop()
        if (desk) renderStage()
        if (page === 'setup' && !setupHeld()) renderSetup()
    }
    // The setup table is rebuilt by the polls, except while a hand is on it (a slider mid-drag, a box just ticked).
    let setupTouchedAt = 0
    for (const type of ['pointerdown', 'input', 'keydown']) $('page-setup').addEventListener(type, () => { setupTouchedAt = Date.now() })
    const setupHeld = () => Date.now() - setupTouchedAt < HOLD_MS || Boolean(document.querySelector('#page-setup input[type=range]:active'))
    const loop = (fn, ms) => { const run = async () => { if (!document.hidden) await fn(); setTimeout(run, ms) }; run() }

    // The pinned bar's height, for scroll-padding-top (it wraps to three rows on a phone).
    const bar = document.querySelector('.topbar')
    const barHeight = () => document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px')
    new ResizeObserver(barHeight).observe(bar)
    barHeight()

    refreshThumbs()
    loop(refreshEngine, POLL_ENGINE_MS)
    loop(refreshDesk, POLL_DESK_MS)
    pollView()
    requestAnimationFrame(playTiles)
    window.addEventListener('resize', () => { if (desk) { const box = $('tiles'); box.dataset.ids = ''; renderTiles() } })
})()

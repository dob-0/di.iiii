// Skeptic probe for the standard move (2026-10-13): try to make a wheel notch, a slide or a turn uneven. Sections (NAV_SECTIONS, default all):
//   base burst pad mods glide trunc jump pivot turn slide where fly   (notches, bursts, trackpad pixels and line/page deltas, Shift and Alt, gestures that
//   arrive mid-glide, truncated glides, one-frame jumps, the turning point after any history, slide and turn per direction, the pointer's place, flying)
// Every ROW line is one measurement against the design (the freeMove.js constants, checked first: see the DESIGN line); FLAG = off by more than 2 %.
// The camera poses come from the fixture (NAV_PLACES; fixtures/moxir-v1-1-places.json fits the project moxir-v1-1).
// NAV_URL=<studio or public viewer url> NAV_PLACES=<fixture> [NAV_KIND=studio|public] [NAV_TOOLS=Edit,Navigate] [NAV_SECTIONS=base,burst,...] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/break-move.cjs
// Options: NAV_MODES=Free,Inside (public viewer)  NAV_SETTLE_MS=10000  NAV_WATCHDOG_MS=1700000  NAV_TAG=<label of the row files>  NAV_OUT=<dir for the row files>
if (!process.env.NAV_URL) { console.log('usage: NAV_URL=<studio or public viewer url> NAV_PLACES=<fixture> [NAV_KIND=studio|public] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/break-move.cjs'); process.exit(2) }
const K = require('./lib/break-kit.cjs')
const { L, ctx, pg, POSES, pose, rest, setPose, mv, mvGoal, wheel, burst, unitsOfSeq, wheelLog, gapStats, slide, turn, zoomDrag, press, pivotAtTurn, mppFor, row, sleep, V, f, mean } = K
const KIND = process.env.NAV_KIND || 'studio'
const SECTIONS = (process.env.NAV_SECTIONS || 'base,burst,pad,mods,glide,trunc,jump,pivot,turn,slide,where,fly').split(',')
const TOOLS = KIND === 'studio' ? (process.env.NAV_TOOLS || 'Edit,Navigate').split(',') : ['public']
const MODES = KIND === 'public' ? (process.env.NAV_MODES || 'Free,Inside').split(',') : [null]
ctx.kind = KIND
L.watchdog(Number(process.env.NAV_WATCHDOG_MS || 1700000))
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rep = (n, e) => Array.from({ length: n }, () => (typeof e === 'object' ? { ...e } : e))

async function runBurst(sec, label, seq, gap, pn = 'B', extra = {}) {
    await setPose(POSES[pn]); await wheelLog(true)
    const a = await pose(); await burst(seq, gap); await rest(); const b = await pose()
    const w = await wheelLog(false)
    const m = mv(a, b), exp = unitsOfSeq(seq) * ctx.S
    return row(sec, label, exp, m.along, { lat: f(m.lat, 4), disp: f(m.disp, 3), gapEnd: f(m.gapEnd, 5), ...gapStats(w), ...extra })
}
async function synth(events, gap = 16) {
    await pg().evaluate(async ({ evs, gap, x, y }) => {
        const cv = window.__cc._domElement
        for (const e of evs) { cv.dispatchEvent(new WheelEvent('wheel', { deltaX: e.dx || 0, deltaY: e.dy || 0, deltaMode: e.mode || 0, shiftKey: !!e.shift, altKey: !!e.alt, ctrlKey: !!e.ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true, view: window })); if (gap) await new Promise((r) => setTimeout(r, gap)) }
    }, { evs: events, gap, x: ctx.C[0], y: ctx.C[1] })
}
const synthUnits = (e) => { const px = (v) => v * (e.mode === 1 ? 16 : e.mode === 2 ? 100 : 1); let n = -px(e.dy || 0) / 100; if (!n && e.shift) n = -px(e.dx || 0) / 100; return n * (e.shift && !e.alt ? 5 : e.alt && !e.shift ? 0.2 : 1) }
async function runSynth(sec, label, evs, gap = 16, pn = 'B') {
    await setPose(POSES[pn]); await wheelLog(true)
    const a = await pose(); await synth(evs, gap); await rest(); const b = await pose()
    const w = await wheelLog(false), m = mv(a, b), exp = evs.reduce((s, e) => s + synthUnits(e), 0) * ctx.S
    return row(sec, label, exp, m.along, { lat: f(m.lat, 4), n: evs.length, ...gapStats(w) })
}

async function secBase() {
    const S = ctx.S
    for (const pn of ['B', 'A', 'C']) {
        const noise = []
        for (let i = 0; i < 3; i++) { await setPose(POSES[pn]); const a = await pose(); await wheel(-100); await rest(); noise.push(mv(a, await pose())) }
        row('base', `one notch in, same pose ${pn}, 3 times (mean)`, S, mean(noise.map((m) => m.along)), { each: noise.map((m) => f(m.along, 4)), lat: f(Math.max(...noise.map((m) => m.lat)), 4) })
        await setPose(POSES[pn]); const start = await pose(), ins = [], outs = []
        for (let i = 0; i < 6; i++) { const a = await pose(); await wheel(-100); await rest(); ins.push(mv(a, await pose())) }
        for (let i = 0; i < 6; i++) { const a = await pose(); await wheel(100); await rest(); outs.push(mv(a, await pose())) }
        const end = await pose()
        row('base', `6 notches in, mean per notch, pose ${pn}`, S, mean(ins.map((m) => m.along)), { each: ins.map((m) => f(m.along, 3)) })
        row('base', `6 notches out, mean per notch, pose ${pn}`, -S, mean(outs.map((m) => m.along)), { each: outs.map((m) => f(m.along, 3)) })
        row('base', `out per notch / in per notch, pose ${pn}`, 1, Math.abs(mean(outs.map((m) => m.along))) / mean(ins.map((m) => m.along)))
        row('base', `6 in then 6 out: distance from the start, pose ${pn}`, 0, V.dist(start.p, end.p))
    }
}
async function secBurst() {
    const r = rng(835088540)
    await runBurst('burst', '20 in, 16 ms apart', rep(20, -100), 16)
    await runBurst('burst', '20 out, 16 ms apart', rep(20, 100), 16)
    await runBurst('burst', 'in/out alternating x20 events, 16 ms', Array.from({ length: 20 }, (_, i) => (i % 2 ? 100 : -100)), 16)
    await runBurst('burst', '60 mixed in/out (60% in), 16 ms', Array.from({ length: 60 }, () => (r() < 0.6 ? -100 : 100)), 16)
    await runBurst('burst', '12 mixed in/out, 300 ms (slow notches)', Array.from({ length: 12 }, () => (r() < 0.5 ? -100 : 100)), 300)
    await runBurst('burst', '8 in at 16 ms then 8 out at 400 ms', [...rep(7, -100), { dy: -100, gap: 400 }, ...rep(7, { dy: 100, gap: 400 }), 100], 16)
    await runBurst('burst', '6 pairs in+out, 16 ms inside a pair, 600 ms between', Array.from({ length: 12 }, (_, i) => ({ dy: i % 2 ? 100 : -100, gap: i % 2 ? 600 : 16 })), 16)
    await runBurst('burst', '40 mixed, random gaps 5-120 ms', Array.from({ length: 40 }, () => ({ dy: r() < 0.5 ? -100 : 100, gap: 5 + Math.floor(r() * 115) })), 16)
    await runBurst('burst', '30 in, 8 ms apart', rep(30, -100), 8)
    await runBurst('burst', '30 in at pose C (near the floor)', rep(30, -100), 16, 'C')
    await runBurst('burst', '20 in then 20 out at pose A', [...rep(20, -100), ...rep(20, 100)], 16, 'A')
}
async function secPad() {
    await runBurst('pad', '25 x 4 px in (= 1 notch), 16 ms', rep(25, -4), 16)
    await runBurst('pad', '25 x 4 px out (= 1 notch), 16 ms', rep(25, 4), 16)
    await runBurst('pad', '250 x 4 px in then 250 out, 16 ms', [...rep(250, -4), ...rep(250, 4)], 16)
    await runBurst('pad', '50 diagonal events dx +-3 dy -4 (a trackpad)', Array.from({ length: 50 }, (_, i) => ({ dx: i % 2 ? 3 : -3, dy: -4 })), 16)
    await runBurst('pad', '50 sideways-only events dx 4, dy 0 (no Shift)', rep(50, { dx: 4, dy: 0 }), 16, 'B', { note: 'design: ignored (0)' })
    await runBurst('pad', '25 x 4 px with Shift held (= 5 notches)', rep(25, { dy: -4, mods: ['Shift'] }), 16)
    await runBurst('pad', '25 x 4 px with Alt held (= 0.2 notch)', rep(25, { dy: -4, mods: ['Alt'] }), 16)
    await runBurst('pad', '100 x 1 px in', rep(100, -1), 16)
    await runBurst('pad', '10 x 0.5 px in', rep(10, -0.5), 16)
    await runSynth('pad', 'deltaMode 1: 1 line (16 px) x6', rep(6, { dy: -1, mode: 1 }))
    await runSynth('pad', 'deltaMode 1: 3 lines x1 (a Firefox notch)', [{ dy: -3, mode: 1 }], 0)
    await runSynth('pad', 'deltaMode 1: 3 lines x5 in, 5 out', [...rep(5, { dy: -3, mode: 1 }), ...rep(5, { dy: 3, mode: 1 })])
    await runSynth('pad', 'deltaMode 2: 1 page x2', rep(2, { dy: -1, mode: 2 }))
    await runSynth('pad', 'deltaMode 0 synthetic -100 x3 (control for the synthetic path)', rep(3, { dy: -100, mode: 0 }))
    await runSynth('pad', 'deltaMode 1 with shift, deltaX 3 lines x2', rep(2, { dx: -3, dy: 0, mode: 1, shift: true }))
}
async function secMods() {
    await runBurst('mods', 'Shift + one notch', [{ dy: -100, mods: ['Shift'] }], 0)
    await runBurst('mods', 'Alt + one notch', [{ dy: -100, mods: ['Alt'] }], 0)
    await runBurst('mods', 'Shift+Alt + one notch', [{ dy: -100, mods: ['Shift', 'Alt'] }], 0)
    await runBurst('mods', 'Shift + one notch OUT', [{ dy: 100, mods: ['Shift'] }], 0)
    const plain = (n, m = []) => rep(n, { dy: -100, mods: m })
    await runBurst('mods', '5 plain, 5 Shift, 5 plain (16 ms) = 35 notches', [...plain(5), ...plain(5, ['Shift']), ...plain(5)], 16)
    await runBurst('mods', '5 plain, 5 Alt, 5 plain (16 ms) = 11 notches', [...plain(5), ...plain(5, ['Alt']), ...plain(5)], 16)
    await runBurst('mods', '5 plain, 5 Shift, 5 plain (300 ms) = 35 notches', [...plain(5), ...plain(5, ['Shift']), ...plain(5)], 300)
    await runBurst('mods', '3 Alt, 3 Shift, 3 plain (16 ms) = 18.6', [...plain(3, ['Alt']), ...plain(3, ['Shift']), ...plain(3)], 16)
    await runBurst('mods', 'Shift mid-burst, in then out: 4 in, 4 Shift out, 4 in', [...plain(4), ...rep(4, { dy: 100, mods: ['Shift'] }), ...plain(4)], 16)
    await runBurst('mods', 'Shift down, 10 in, Shift up, 10 out (16 ms) = +50 - 10', [...plain(10, ['Shift']), ...rep(10, { dy: 100 })], 16)
    await runBurst('mods', 'Shift + 25 x 4 px then 25 x 4 px plain', [...rep(25, { dy: -4, mods: ['Shift'] }), ...rep(25, { dy: -4 })], 16)
    const w = await wheelLog(false); const sh = w.filter((x) => x[4]).slice(0, 2), al = w.filter((x) => x[5]).slice(0, 2)
    console.log('MODS wheel events with Shift (t,dx,dy,mode,shift,alt,ctrl,trusted,x,y,tag):', JSON.stringify(sh), 'with Alt:', JSON.stringify(al))
}
async function secGlide() {
    const S = ctx.S
    for (const g of [0, 30, 60, 120, 250, 500, 1000]) {
        await setPose(POSES.B); const a = await pose(); await wheel(-100); if (g) await sleep(g); await wheel(-100); await rest(); const b = await pose()
        row('glide', `2 notches in, ${g} ms apart`, 2 * S, mv(a, b).along, { lat: f(mv(a, b).lat, 4) })
    }
    for (const g of [0, 30, 120, 500]) {
        await setPose(POSES.B); const a = await pose(); await wheel(-100); if (g) await sleep(g); await wheel(100); await rest(); const b = await pose()
        row('glide', `notch in then notch out, ${g} ms apart`, 0, mv(a, b).disp)
    }
    for (const g of [0, 100, 400, 'rest']) {
        await setPose(POSES.B); const a = await pose(); await slide(200, 0); if (g === 'rest') await rest(); else if (g) await sleep(g); await wheel(-100); await rest(); const b = await pose(), m = mv(a, b)
        row('glide', `slide R 200 px, then a notch @${g}: forward part`, S, m.along)
        row('glide', `slide R 200 px, then a notch @${g}: sideways part`, 200 * mppFor(a.fov), Math.abs(m.right), { up: f(m.up, 4) })
    }
    for (const mode of ['point', 'place']) {
        await K.setTurnMode(mode)
        for (const g of [0, 100, 400, 'rest']) {
            await setPose(POSES.B2); await turn(200, 0); if (g === 'rest') await rest(); else if (g) await sleep(g)
            const a = await pose(); await wheel(-100); await rest(); const b = await pose(), m = mvGoal(a, b)
            row('glide', `turn R 200 px (${mode}), then a notch @${g}: along the goal axis`, S, m.along, { lat: f(m.lat, 4) })
        }
    }
    await K.setTurnMode('point')
    if (ctx.tool !== 'Edit') {
        for (const g of [0, 150, 'rest']) {
            await setPose(POSES.B2); await pg().mouse.dblclick(ctx.C[0], ctx.C[1]); if (g === 'rest') await rest(); else if (g) await sleep(g)
            const a = await pose(); await wheel(-100); await rest(); const b = await pose(), m = mvGoal(a, b)
            row('glide', `double-click focus, then a notch @${g}: along the goal axis`, S, m.along, { lat: f(m.lat, 4), r0: f(a.r, 3) })
            await pg().keyboard.press('Escape')
        }
    }
}
async function secTrunc() {
    const S = ctx.S
    const kinds = ['slide', 'zoom']
    for (const kind of kinds) for (const g of [0, 40, 80, 160, 320, 640, 1500]) {
        await setPose(POSES.B); const a = await pose(); await wheel(-100); if (g) await sleep(g); await press(kind); await rest(); const b = await pose()
        row('trunc', `one notch, then ${ctx.tool}'s ${kind} button pressed (no drag) after ${g} ms: camera moved`, S, mv(a, b).disp)
    }
    await K.setTurnMode('place')
    for (const g of [0, 80, 320]) {
        await setPose(POSES.B); const a = await pose(); await wheel(-100); if (g) await sleep(g); await turn(6, 0, { steps: 3, gap: 16 }); await rest(); const b = await pose()
        row('trunc', `one notch, then a 6 px turn drag (in place) after ${g} ms: camera moved`, S, mv(a, b).disp)
    }
    await K.setTurnMode('point')
    for (const g of [0, 50, 150, 400, 'rest']) {
        await setPose(POSES.B); const a = await pose(); await slide(200, 0); if (g === 'rest') await rest(); else if (g) await sleep(g); await slide(200, 0); await rest(); const b = await pose(), m = mv(a, b)
        row('trunc', `slide R 200 px, then another slide R 200 px after ${g} ms: sideways total`, 400 * mppFor(a.fov), Math.abs(m.right), { up: f(m.up, 4) })
    }
    for (const g of [0, 80, 400]) {
        await setPose(POSES.B); const a = await pose(); await zoomDrag(0, -100); if (g) await sleep(g); await wheel(-100); await rest(); const b = await pose()
        row('trunc', `zoom drag 100 px up (= 1 notch), then a notch after ${g} ms`, 2 * S, mv(a, b).along)
    }
    for (const g of [0, 80, 400]) {
        await setPose(POSES.B); const a = await pose(); await wheel(-100); if (g) await sleep(g); await slide(200, 0, { steps: 10, gap: 22 }); await rest(); const b = await pose(), m = mv(a, b)
        row('trunc', `a notch, then a real slide drag R 200 px after ${g} ms: forward part`, S, m.along, { right: f(m.right, 3) })
    }
}
async function secJump() {
    // the camera's biggest single-frame step while a notch glides, with and without a button pressed during the glide
    const S = ctx.S
    const cases = [['no press (control)', null, 0]]
    for (const kind of ['slide', 'zoom', 'turn']) for (const g of [60, 150, 400]) cases.push([`${kind} press after ${g} ms`, kind, g])
    for (const [label, kind, g] of cases) {
        await setPose(POSES.B); if (kind === 'turn') await K.setTurnMode('place')
        await K.startRec(); const a = await pose(); await sleep(120); await wheel(-100)
        if (kind) { await sleep(g); if (kind === 'turn') await turn(6, 0, { steps: 3, gap: 16 }); else await press(kind) }
        await sleep(1800); const d = await K.stopRec(); await rest(); const b = await pose()
        const steps = K.recSteps(d), mx = Math.max(...steps), m = mv(a, b)
        row('jump', `notch then ${label}: biggest one-frame step (m)`, 0, mx, { frames: d.length, finalMoved: f(m.disp, 3), absTol: 0.1 * S, note: `a notch alone glides at most about ${f(S * 8 / Math.E * 0.0167, 3)} m a frame` })
        if (kind === 'turn') await K.setTurnMode('point')
    }
}
async function secFly() {
    // flying (right button + W) is frame-driven: the step per frame is clamped to 1/15 s (useCameraNavigation.clampUpdateDt), so a slow page flies slower
    const S = ctx.S, client = await pg().context().newCDPSession(pg())
    for (const rate of [1, 4, 8]) {
        await client.send('Emulation.setCPUThrottlingRate', { rate })
        await setPose(POSES.B); await K.startRec(); const a = await pose()
        await pg().mouse.move(ctx.C[0], ctx.C[1]); await pg().mouse.down({ button: 'right' }); await pg().keyboard.down('KeyW'); await sleep(1000); await pg().keyboard.up('KeyW'); await pg().mouse.up({ button: 'right' })
        await sleep(300); const d = await K.stopRec(); await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await rest(); const b = await pose()
        const fps = d.length / Math.max(0.001, (d[d.length - 1][0] - d[0][0]) / 1000)
        row('fly', `fly forward 1 s (right button + W), page CPU slowed x${rate}, about ${fps.toFixed(0)} animation frames/s`, S, mv(a, b).along, { fps: f(fps, 1), note: 'emulated CPU slowdown, not a hardware measure' })
    }
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await client.detach().catch(() => {})
}
async function secPivot() {
    const S = ctx.S, want = { point: 10 * S, place: 0.001 }
    const HIST = {
        fresh: async () => {},
        'notch in x3': async () => { for (let i = 0; i < 3; i++) { await wheel(-100); await sleep(300) } },
        'notch out x3': async () => { for (let i = 0; i < 3; i++) { await wheel(100); await sleep(300) } },
        'Shift notch': async () => { await wheel(-100, ['Shift']) },
        'slide R 150': async () => { await slide(150, 0) },
        'zoom drag 100 up': async () => { await zoomDrag(0, -100) },
        'turn R 100 (previous turn)': async () => { await turn(100, 0) },
    }
    if (ctx.tool !== 'Edit') {
        HIST['double-click'] = async () => { await pg().mouse.dblclick(ctx.C[0], ctx.C[1]); await sleep(300); await pg().keyboard.press('Escape') }
        HIST['double-click, slide R 150'] = async () => { await HIST['double-click'](); await rest(); await slide(150, 0) }
        HIST['double-click, notch in'] = async () => { await HIST['double-click'](); await rest(); await wheel(-100) }
        HIST['double-click, zoom drag 100 up'] = async () => { await HIST['double-click'](); await rest(); await zoomDrag(0, -100) }
        HIST['double-click, turn R 100'] = async () => { await HIST['double-click'](); await rest(); await turn(100, 0) }
    }
    for (const mode of ['point', 'place']) {
        await K.setTurnMode(mode)
        for (const [name, fn] of Object.entries(HIST)) {
            await setPose(POSES.B2); await fn(); await rest()
            const r = await pivotAtTurn(); await rest()
            row('pivot', `turning point distance at the start of a turn (${mode}) after: ${name}`, want[mode], r.r, { tol: mode === 'place' ? 0.5 : 0.02 })
        }
    }
    await K.setTurnMode('point')
}
async function secTurn() {
    for (const mode of ['point', 'place']) {
        await K.setTurnMode(mode)
        for (const h of ['fresh', 'after 5 notches in', 'after slide R 150']) {
            for (const [lbl, dx, dy] of [['R', 200, 0], ['U', 0, -200]]) {
                await setPose(POSES.B2)
                if (h === 'after 5 notches in') { for (let i = 0; i < 5; i++) { await wheel(-100); await sleep(150) } } else if (h === 'after slide R 150') await slide(150, 0)
                await rest(); const a = await pose(); await turn(dx, dy); await rest(); const b = await pose(), m = mv(a, b)
                const R = 10 * ctx.S, chordExp = 2 * R * Math.sin((m.turnDeg * Math.PI) / 360)
                row('turn', `${mode} turn ${lbl} 200 px ${h}: view turned (deg)`, ctx.tool === 'Edit' ? (2 * Math.PI * (ctx.H / 900) * 200 / ctx.H) * 180 / Math.PI : (2 * Math.PI * 200 / ctx.H) * 180 / Math.PI, m.turnDeg, { tol: 0.04, note: 'design: 2pi*speed*px/H' })
                if (mode === 'point') row('turn', `point turn ${lbl} 200 px ${h}: camera swing (m) vs chord of the turn at R=10 steps`, chordExp, m.disp, { tol: 0.03 })
            }
        }
    }
    await K.setTurnMode('point')
}
async function secSlide() {
    const dirs = { R: [200, 0], L: [-200, 0], D: [0, 200], U: [0, -200], DR: [141.42, 141.42], UL: [-141.42, -141.42] }
    for (const pn of ['B', 'A', 'C']) {
        const per = {}
        for (const [k, [dx, dy]] of Object.entries(dirs)) {
            await setPose(POSES[pn]); const a = await pose(); await slide(dx, dy); await rest(); const b = await pose(), m = mv(a, b)
            const px = Math.hypot(dx, dy); per[k] = m.disp
            row('slide', `slide ${k} ${px.toFixed(0)} px, pose ${pn}`, px * mppFor(a.fov), m.disp, { right: f(m.right, 3), up: f(m.up, 3), along: f(m.along, 4), fov: f(a.fov, 2) })
        }
        const v = Object.values(per); row('slide', `slide: largest / smallest direction, pose ${pn}`, 1, Math.max(...v) / Math.min(...v))
    }
    for (const steps of [1, 2, 4, 10, 40, 100]) {
        await setPose(POSES.B); const a = await pose(); await slide(200, 0, { steps, gap: steps > 40 ? 4 : 22 }); await rest(); const b = await pose()
        row('slide', `slide R 200 px in ${steps} pointer events`, 200 * mppFor(a.fov), mv(a, b).disp)
    }
    for (const [name, fn] of Object.entries({ 'after 5 notches in': async () => { for (let i = 0; i < 5; i++) { await wheel(-100); await sleep(150) } }, 'after 5 notches out': async () => { for (let i = 0; i < 5; i++) { await wheel(100); await sleep(150) } }, 'after a turn R 200': async () => { await turn(200, 0) }, 'after a zoom drag': async () => { await zoomDrag(0, -150) } })) {
        await setPose(POSES.B); await fn(); await rest(); const a = await pose(); await slide(200, 0); await rest(); const b = await pose()
        row('slide', `slide R 200 px ${name}`, 200 * mppFor(a.fov), mv(a, b).disp)
    }
}
async function secWhere() {
    const S = ctx.S, rect = ctx.box
    for (const [fx, fy] of [[0.5, 0.5], [0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.06], [0.5, 0.94], [0.97, 0.5]]) {
        const x = rect.x + fx * rect.width, y = rect.y + fy * rect.height
        await setPose(POSES.B); await pg().mouse.move(x, y); await sleep(80)
        const top = await pg().evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? e.tagName + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '') : null }, [x, y])
        await wheelLog(true); const a = await pose(); await wheel(-100); await rest(); const b = await pose(); const w = await wheelLog(false)
        row('where', `one notch with the pointer at (${fx}, ${fy}) over ${top}`, S, mv(a, b).along, { atTag: w[0]?.[10] || null, tol: 0.02 })
    }
    await pg().mouse.move(ctx.C[0], ctx.C[1])
}

const RUN = { fly: secFly, jump: secJump, base: secBase, burst: secBurst, pad: secPad, mods: secMods, glide: secGlide, trunc: secTrunc, pivot: secPivot, turn: secTurn, slide: secSlide, where: secWhere }
;(async () => {
    await K.init(process.env.NAV_URL, { settle: Number(process.env.NAV_SETTLE_MS || 10000) })
    console.log('LOAD', JSON.stringify({ url: process.env.NAV_URL, kind: KIND, box: ctx.box, lane: process.env.DI_TEST_LANE, tag: ctx.tag }))
    for (const mode of MODES) {
        if (mode) { const shown = await K.setMode(mode); console.log('MODE', mode, 'button reads', shown); ctx.tool = 'public' }
        for (const tool of TOOLS) {
            if (KIND === 'studio') await K.setTool(tool); else ctx.tool = mode ? `public-${mode}` : 'public'
            const cal = await K.calibrate('B')
            console.log('CAL', JSON.stringify({ tool: ctx.tool, ...cal }))
            if (cal.trace && Math.abs(cal.meas / cal.trace - 1) > 0.005) console.log('FLAG calibration: measured notch', cal.meas, 'vs speed the app reports', cal.trace)
            for (const name of SECTIONS) {
                if (!RUN[name]) continue
                const t0 = Date.now(); const n0 = ctx.rows.length
                try { await RUN[name]() } catch (e) { console.log('ERR section', name, String(e).slice(0, 240)) }
                console.log(`SEC ${ctx.tool} ${name}: ${ctx.rows.length - n0} rows, ${ctx.rows.slice(n0).filter((r) => r.flag).length} flagged, ${Math.round((Date.now() - t0) / 1000)} s`)
                K.saveRows(`${KIND}-${(mode || 'x')}-${tool}`)
            }
            const S0 = ctx.S, cal2 = await K.calibrate('B')
            console.log('CAL end', JSON.stringify({ tool: ctx.tool, startSpeed: S0, ...cal2 }))
            if (S0 && Math.abs(cal2.S / S0 - 1) > 0.005) console.log('FLAG the design speed changed during the run:', S0, '->', cal2.S)
        }
    }
    await K.resetPrefs()
    const flagged = ctx.rows.filter((r) => r.flag)
    console.log('DONE rows', ctx.rows.length, 'flagged', flagged.length)
    await L.bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 400)); try { K.saveRows(`${KIND}-partial`) } catch {} await L.bye(3) })

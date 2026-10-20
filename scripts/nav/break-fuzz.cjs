// History fuzz (2026-10-13): random gestures (seeded), and after each one, once settled, a fixed set of probes: the turning point at the start of a turn,
// a notch in, a notch out, a 100 px slide. Every probe is compared with the design (the freeMove.js constants, checked first: see the DESIGN line).
// The camera poses come from the fixture (NAV_PLACES; fixtures/moxir-v1-1-places.json fits the project moxir-v1-1).
// NAV_URL=<studio or public viewer url> NAV_PLACES=<fixture> [NAV_STEPS=40] [NAV_SEED=835088540] [NAV_KIND=studio|public] [NAV_TOOLS=Edit,Navigate] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/break-fuzz.cjs
// Options: NAV_MODES=Free (public viewer)  NAV_WATCHDOG_MS=1500000  NAV_TAG=<label of the row files>  NAV_OUT=<dir for the row files>
if (!process.env.NAV_URL) { console.log('usage: NAV_URL=<studio or public viewer url> NAV_PLACES=<fixture> [NAV_STEPS=40] [NAV_SEED=835088540] NODE_PATH=<tree>/node_modules di-test-browser run scripts/nav/break-fuzz.cjs'); process.exit(2) }
const K = require('./lib/break-kit.cjs')
const { L, ctx, pg, POSES, pose, rest, setPose, mv, wheel, burst, slide, turn, zoomDrag, pivotAtTurn, mppFor, row, sleep, f } = K
const KIND = process.env.NAV_KIND || 'studio'; ctx.kind = KIND
L.watchdog(Number(process.env.NAV_WATCHDOG_MS || 1500000))
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rep = (n, e) => Array.from({ length: n }, () => (typeof e === 'object' ? { ...e } : e))
let mode = 'point'
const nav = () => ctx.tool !== 'Edit'
const G = {
    'notch in x2': async () => { await wheel(-100); await sleep(200); await wheel(-100) },
    'notch out x3': async () => { for (let i = 0; i < 3; i++) { await wheel(100); await sleep(120) } },
    'burst in 6 @16 ms': async () => burst(rep(6, -100), 16),
    'burst out 6 @16 ms': async () => burst(rep(6, 100), 16),
    'Shift notch in': async () => wheel(-100, ['Shift']),
    'Alt notch out': async () => wheel(100, ['Alt']),
    'trackpad 25 x 4 px in': async () => burst(rep(25, -4), 16),
    'slide R 150': async () => slide(150, 0), 'slide L 150': async () => slide(-150, 0), 'slide U 100': async () => slide(0, -100), 'slide D 100': async () => slide(0, 100),
    'turn R 120': async () => turn(120, 0), 'turn L 120': async () => turn(-120, 0), 'turn U 80': async () => turn(0, -80), 'turn D 80': async () => turn(0, 80),
    'zoom drag up 80': async () => zoomDrag(0, -80), 'zoom drag down 80': async () => zoomDrag(0, 80),
    'double-click': async () => { if (nav()) { await pg().mouse.dblclick(ctx.C[0], ctx.C[1]); await sleep(400); await pg().keyboard.press('Escape') } },
    'double-click then slide R 100': async () => { if (nav()) { await pg().mouse.dblclick(ctx.C[0], ctx.C[1]); await sleep(900); await pg().keyboard.press('Escape'); await slide(100, 0) } },
    'turn mode: in place': async () => { mode = 'place'; await K.setTurnMode('place') },
    'turn mode: around a point': async () => { mode = 'point'; await K.setTurnMode('point') },
    'pause 1.2 s': async () => sleep(1200),
}
;(async () => {
    await K.init(process.env.NAV_URL)
    const tools = KIND === 'studio' ? (process.env.NAV_TOOLS || 'Edit,Navigate').split(',') : ['public']
    for (const mname of (KIND === 'public' ? (process.env.NAV_MODES || 'Free').split(',') : [null])) {
        if (mname) await K.setMode(mname)
        for (const tool of tools) {
            if (KIND === 'studio') await K.setTool(tool); else ctx.tool = 'public-' + mname
            mode = 'point'; await K.setTurnMode('point')
            const cal = await K.calibrate('B'); console.log('CAL', JSON.stringify({ tool: ctx.tool, ...cal }))
            const S = ctx.S, r = rng(Number(process.env.NAV_SEED || 835088540)), names = Object.keys(G)
            const steps = Number(process.env.NAV_STEPS || 40)
            for (let i = 0; i < steps; i++) {
                const name = names[Math.floor(r() * names.length)]
                if (i % 8 === 7) await setPose(POSES[['B', 'A', 'C'][Math.floor(r() * 3)]])
                await G[name](); await rest()
                const pv = await pivotAtTurn(); await rest()
                row('fuzz', `#${i} after "${name}": turning point at the start of a turn (${mode})`, mode === 'point' ? 10 * S : 0.001, pv.r, { tol: mode === 'point' ? 0.02 : 0.5 })
                let a = await pose(); await wheel(-100); await rest(); let b = await pose(); const pin = mv(a, b)
                row('fuzz', `#${i} after "${name}": probe notch in`, S, pin.along, { lat: f(pin.lat, 4) })
                a = b; await wheel(100); await rest(); b = await pose(); const pout = mv(a, b)
                row('fuzz', `#${i} after "${name}": probe notch out`, -S, pout.along, { lat: f(pout.lat, 4) })
                a = b; await slide(100, 0); await rest(); b = await pose()
                row('fuzz', `#${i} after "${name}": probe slide R 100 px`, 100 * mppFor(a.fov), mv(a, b).disp)
            }
            K.saveRows(`fuzz-${tool}`)
        }
    }
    await K.resetPrefs()
    console.log('DONE rows', ctx.rows.length, 'flagged', ctx.rows.filter((r) => r.flag).length)
    await L.bye(0)
})().catch(async (e) => { console.log('ERR', String(e).slice(0, 400)); try { K.saveRows('fuzz-partial') } catch {} await L.bye(3) })

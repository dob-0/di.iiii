// Side by side of two runs of scripts/nav/probe-constant-speed.cjs (before / after: e.g. the build with the old speed model and the build with the standard move), as Markdown.
//   node scripts/nav/compare-speed.cjs before.out after.out > compare.md        (no browser, no playwright: it only reads the two outputs)
// It reads the HEADER, PLACE and G lines (one G per gesture) and computes everything again, so the two outputs need nothing else; the places are the ones the outputs name.
const fs = require('fs')
const [fb, fa] = process.argv.slice(2)
if (!fb || !fa) { console.error('usage: node scripts/nav/compare-speed.cjs before.out after.out > compare.md'); process.exit(2) }
const load = (f) => { const rows = [], places = {}; let header = null, auto = null; for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (l.startsWith('G ')) { try { rows.push(JSON.parse(l.slice(2))) } catch {} } else if (l.startsWith('HEADER ')) { try { header = JSON.parse(l.slice(7)) } catch {} } else if (l.startsWith('PLACE ')) { try { const q = JSON.parse(l.slice(6)); places[q.id] = q } catch {} } else if (l.startsWith('AUTOSPEED ')) auto = l.slice(10, 400) } return { rows, header, places, auto } }
const B = load(fb), A = load(fa)
const FAM = ['wheel-in', 'wheel-out', 'slide-R', 'slide-L', 'slide-D', 'slide-U', 'turn-R', 'turn-L', 'turn-D', 'turn-U']
const PLACES = [...new Set([...Object.keys(A.places), ...Object.keys(B.places), ...A.rows.map((x) => x.pl), ...B.rows.map((x) => x.pl)].filter(Boolean))]
const ok = (x) => !x.err && !x.bl
const f = (v, n = 4) => (v == null || !Number.isFinite(v) ? '-' : Number(v.toPrecision(n)).toString())
const stats = (vals) => { const v = vals.filter((x) => Number.isFinite(x)); const live = v.filter((x) => Math.abs(x) >= 1e-6).map(Math.abs); const dead = v.length - live.length
    if (!live.length) return { n: v.length, dead, min: null, max: null, ratio: null, cv: null }
    const min = Math.min(...live), max = Math.max(...live), mean = live.reduce((s, x) => s + x, 0) / live.length, sd = Math.sqrt(live.reduce((s, x) => s + (x - mean) ** 2, 0) / live.length)
    return { n: v.length, dead, min, max, ratio: max / min, cv: sd / mean } }
const main = (D, tool) => D.rows.filter((x) => x.sec === 'main' && x.tool === tool && ok(x))
const pick = (rows, g, m) => rows.filter((x) => x.g === g).map((x) => x[m])
const out = []
const p = (l = '') => out.push(l)
p(`# before / after — ${fb} / ${fa}`); p()
p(`before: ${JSON.stringify(B.header && { label: B.header.label, build: B.header.build, url: B.header.url, at: B.header.at, prefs: B.header.prefs, fixture: B.header.fixture })}`)
p(`after:  ${JSON.stringify(A.header && { label: A.header.label, build: A.header.build, url: A.header.url, at: A.header.at, prefs: A.header.prefs, fixture: A.header.fixture })}`); p()
p('## Places — what is around the camera (rays against the solid meshes of the scene; before | after: the same scene should give the same numbers)'); p()
p('| id | place | camera x, y, z | looks at | look dist m | nearest solid m | centre of view m (hits of 9) | share of the view that hits |'); p('|---|---|---|---|---|---|---|---|')
const both = (a, b, fn) => { const x = fn(a), y = fn(b); return x === y ? x : `${x} \\| ${y}` }
for (const id of PLACES) { const b = B.places[id], a = A.places[id]; if (!b && !a) continue; const q = b || a
    p(`| ${id} | ${q.name} | ${q.pos.join(', ')} | ${q.at.join(', ')} | ${q.lookDist} | ${both(b, a, (z) => (z && z.around ? f(z.around.min, 3) : '-'))} | ${both(b, a, (z) => (z && z.around ? `${f(z.around.ctr, 3)} (${z.around.ctrHits})` : '-'))} | ${both(b, a, (z) => (z && z.around ? f(z.around.hitFrac, 2) : '-'))} |`) }
p()
for (const tool of ['edit', 'navigate']) {
    const mb = main(B, tool), ma = main(A, tool)
    p(`## ${tool} — across the places (min .. max, max/min, CV); constant speed = max/min near 1.0`); p()
    p('| gesture | metric | before min .. max | before max/min | before CV | after min .. max | after max/min | after CV |'); p('|---|---|---|---|---|---|---|---|')
    for (const g of FAM) for (const m of g.startsWith('turn') ? ['ang', 'disp'] : ['disp']) {
        const sb = stats(pick(mb, g, m)), sa = stats(pick(ma, g, m))
        p(`| ${g} | ${m === 'ang' ? 'deg' : 'm'} | ${f(sb.min)} .. ${f(sb.max)} | **${f(sb.ratio, 3)}**${sb.dead ? ` (dead ${sb.dead})` : ''} | ${f(sb.cv, 2)} | ${f(sa.min)} .. ${f(sa.max)} | **${f(sa.ratio, 3)}**${sa.dead ? ` (dead ${sa.dead})` : ''} | ${f(sa.cv, 2)} |`)
    }
    // the same speed to every side: per place the four directions
    const sides = (rows, fam, m) => PLACES.map((pl) => { const v = rows.filter((x) => x.pl === pl && x.g.startsWith(fam)).map((x) => Math.abs(x[m])); return v.length === 4 && Math.min(...v) > 1e-6 ? [pl, Math.max(...v) / Math.min(...v)] : [pl, null] })
    const sline = (rows, fam, m) => { const s = sides(rows, fam, m).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]); const med = s.length ? s.map((x) => x[1]).sort((a, b) => a - b)[s.length >> 1] : null; return `median ${f(med, 3)}, worst ${s[0] ? s[0][0] + ' ' + f(s[0][1], 3) : '-'}` }
    p(); p(`Every side (largest / smallest of the four directions R L D U at one place): slide, before ${sline(mb, 'slide', 'disp')}; after ${sline(ma, 'slide', 'disp')}. turn angle, before ${sline(mb, 'turn', 'ang')}; after ${sline(ma, 'turn', 'ang')}.`)
    // per place numbers
    for (const [g, m, unit] of [['wheel-in', 'disp', 'm'], ['slide-R', 'disp', 'm'], ['slide-D', 'disp', 'm'], ['slide-U', 'disp', 'm'], ['turn-R', 'disp', 'm']]) {
        p(); p(`${tool} ${g} ${m} (${unit}) at each place — before | after`); p(); p('| place | ' + PLACES.join(' | ') + ' |'); p('|---|' + PLACES.map(() => '---').join('|') + '|')
        for (const [name, D] of [['before', mb], ['after', ma]]) p(`| ${name} | ` + PLACES.map((pl) => { const r = D.find((x) => x.pl === pl && x.g === g); return r ? f(r[m], 3) : '-' }).join(' | ') + ' |')
    }
    p()
    // smoothness
    const sm = (rows) => { const j = rows.map((x) => x.jerk).filter((v) => v != null), s = rows.map((x) => x.stall).filter((v) => v != null); return `jerk median ${f(j.sort((a, b) => a - b)[j.length >> 1], 3)}, worst ${f(Math.max(...j), 3)}; stalled pointer moves ${s.reduce((a, b) => a + b, 0)} in ${s.length} drags` }
    p(`Smoothness while the button is down (max/median frame response; moves the camera did not answer): before ${sm(mb)}; after ${sm(ma)}.`); p()
    // orbit distance after the press
    for (const g of ['slide-R', 'turn-R']) { const sb = stats(pick(mb, g, 'dp')), sa = stats(pick(ma, g, 'dp')); p(`Orbit distance right after the press, ${g} (set before at T=10): before ${f(sb.min)} .. ${f(sb.max)} (max/min ${f(sb.ratio, 3)}); after ${f(sa.min)} .. ${f(sa.max)} (max/min ${f(sa.ratio, 3)}).`) }
    p()
    // extras
    for (const [sec, label] of [['det', 'DET: the same gesture 3 times at the first place (spread = (max-min)/mean)'], ['tsweep', 'TSWEEP: the orbit target at T = 1, 10, 100 m, camera at the first place (max/min)'], ['ptr', 'PTR: the pointer at 5 places on the screen, at the first two camera places (max/min)']]) {
        const rb = B.rows.filter((x) => x.sec === sec && x.tool === tool && ok(x)), ra = A.rows.filter((x) => x.sec === sec && x.tool === tool && ok(x))
        if (!rb.length && !ra.length) continue
        p(`${label}:`); p()
        p('| gesture | before values | before ratio | after values | after ratio |'); p('|---|---|---|---|---|')
        const key = (r) => `${r.pl} ${r.g}`
        const keys = [...new Set([...rb, ...ra].map(key))]
        for (const k of keys) { const gx = k.split(' ')[1]; const m = gx.startsWith('turn') ? 'ang' : 'disp'
            let vb = rb.filter((r) => key(r) === k).map((r) => r[m]), va = ra.filter((r) => key(r) === k).map((r) => r[m])
            if (sec === 'ptr') { const pl = k.split(' ')[0]; vb = vb.concat(main(B, tool).filter((r) => r.pl === pl && r.g === gx).map((r) => r[m])); va = va.concat(main(A, tool).filter((r) => r.pl === pl && r.g === gx).map((r) => r[m])) }
            if (sec === 'tsweep') { vb = [1, 10, 100].map((T) => rb.find((r) => key(r) === k && r.T === T)?.[m]); va = [1, 10, 100].map((T) => ra.find((r) => key(r) === k && r.T === T)?.[m]) }
            const sb = stats(vb), sa = stats(va)
            const spread = (v) => { const w = v.filter(Number.isFinite); return w.length ? (Math.max(...w) - Math.min(...w)) / (w.reduce((a, b) => a + b, 0) / w.length) : null }
            p(`| ${k} | ${vb.map((v) => f(v, 4)).join(' ')} | ${sec === 'det' ? 'spread ' + f(spread(vb), 2) : f(sb.ratio, 3)} | ${va.map((v) => f(v, 4)).join(' ')} | ${sec === 'det' ? 'spread ' + f(spread(va), 2) : f(sa.ratio, 3)} |`) }
        p()
    }
}
// where does a run leave its own median by more than 2 % (main pass, per tool and gesture)?
for (const [name, D] of [['after', A], ['before', B]]) {
    const lines = []; let total = 0
    for (const tool of ['edit', 'navigate']) for (const g of FAM) for (const m of g.startsWith('turn') ? ['ang', 'disp'] : ['disp']) {
        const rows = main(D, tool).filter((x) => x.g === g); const vals = rows.map((x) => Math.abs(x[m])).filter((v) => v > 1e-6); if (vals.length < 3) continue
        const med = vals.slice().sort((a, b) => a - b)[vals.length >> 1]
        for (const x of rows) { const v = Math.abs(x[m]); if (!(v > 1e-6) || Math.abs(v / med - 1) > 0.02) { total++; if (lines.length < 14) lines.push(`${tool} ${g} ${m} ${x.pl}: ${f(x[m], 4)} vs median ${f(med, 4)}`) } }
    }
    p(`Gestures more than 2 % away from their own median (${name}): ${total}${lines.length ? '. First: ' + lines.join('; ') : ''}`); p()
}
const cnt = (D) => `${D.rows.length} gestures, blocked ${D.rows.filter((x) => x.bl).length}, errors ${D.rows.filter((x) => x.err).length}`
p(`Counts: before ${cnt(B)}; after ${cnt(A)}.`)
p(`Automatic speed entries in the trace — before: ${B.auto || 'none'}; after: ${A.auto || 'none'}.`)
console.log(out.join('\n'))

// Priority+ fit for the Monitor rail (pattern: "priority+ navigation", Brad Frost / Lukasz Wojciechowski).
// Pure: the page measures each chip once, then asks which of them fit the width left; the rest go to "+N".
// items: [{ id, w, p }]  w = natural width in px, p = priority (1 = keep longest, higher goes first).
// avail = width of the chip region, gap = space between two items, moreW = width of the "+N" button.
// Returns { shown: ids in the original order, hidden: ids in the original order }.
export function fitPriority(items, avail, gap = 0, moreW = 0) {
    const list = Array.isArray(items) ? items : []
    const need = (xs) => xs.reduce((sum, it, i) => sum + (Number(it.w) || 0) + (i ? gap : 0), 0)
    if (!(avail > 0) || need(list) <= avail) return { shown: list.map((it) => it.id), hidden: [] }
    let kept = [...list]
    // drop the least important first; of equal priority the later one goes first
    const order = list.map((it, i) => ({ it, i })).sort((a, b) => (b.it.p - a.it.p) || (b.i - a.i))
    for (const { it } of order) {
        if (!kept.length) break
        if (need(kept) + gap + moreW <= avail) break
        kept = kept.filter((k) => k !== it)
    }
    const keep = new Set(kept.map((k) => k.id))
    return { shown: list.filter((it) => keep.has(it.id)).map((it) => it.id), hidden: list.filter((it) => !keep.has(it.id)).map((it) => it.id) }
}

// the order a chip is kept in: a chip that needs him first, then the tiers, then the counts
export const chipPriority = (chip) => {
    if (chip.tone === 'danger' || chip.tone === 'warning') return 1
    if (chip.tierId) return 2
    if (['machines', 'agents', 'services'].includes(chip.id)) return 3
    return 4
}

const SHORT = { machines: 'mach', agents: 'agents', prs: 'PRs', services: 'svc', gear: 'gear', people: 'ppl' }
export const shortLabel = (chip) => SHORT[chip.id] || chip.label

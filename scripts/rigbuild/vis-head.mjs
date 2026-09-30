/**
 * vis-head.mjs — which lamp vis-see.mjs tests on (RIG_BUILD.md §19.6).
 *
 * The first moving head the room draws from the desk (a B380F if there is one), with its desk
 * patch. A rig with no moving head (the cut, simple: fixed lights only) has nothing to sweep:
 * then only --cues can run — the latency trials, the frames and the Art-Net test need a head,
 * and asking for them is refused with a plain reason instead of a crash on `undefined`.
 */
export const pickHead = (driven, rig, { need = false } = {}) => {
    const head = driven.find((d) => d.pan != null && d.type === 'up-b380f') || driven.find((d) => d.pan != null)
    const fx = head ? rig.find((f) => f.index === head.index) : null
    if (!fx && need) throw new Error('no moving head on the desk to test with — run with --trials 0 and --cues only')
    if (!fx) return null
    return { head, fx, heads: rig.filter((f) => f.profile === fx.profile) }
}

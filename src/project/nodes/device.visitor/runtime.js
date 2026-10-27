// What the person's screen is, read from the live side channel the editor's
// VisitorFeed publishes into (the Keyboard pattern). The browser is asked in
// the feed, never here: a graph evaluated where no feed runs answers the
// plain defaults below — a wide, still, unnamed screen — not a guess.
export const VISITOR_DEFAULTS = Object.freeze({
    phone: false,
    reducedMotion: false,
    portrait: false,
    width: 0,
    height: 0,
    language: '',
    embedded: false,
    name: '',
    hue: 0,
    visitorId: '',
})

export const computeOutput = (node, portId, { context }) => {
    if (!Object.hasOwn(VISITOR_DEFAULTS, portId)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? VISITOR_DEFAULTS[portId]
}

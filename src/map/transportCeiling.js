// How many page surfaces this origin can actually run at once.
//
// Measured, not guessed. A project or url surface is a page, and each one
// holds a long-lived connection open (the project event stream). Over
// HTTP/1.1 a browser allows about six persistent connections per origin, and
// the output page holds one of them itself — so at five page surfaces every
// remaining request queues forever and the wall stays black on four of five,
// stuck on "Loading live experience". Over HTTP/2 the same streams multiplex
// onto one connection and all five come up in seconds.
//
// di-studio.xyz and staging.di-studio.xyz both answer h2, so this does not
// bite a deployed wall. `npm run dev` is plain HTTP/1.1, and a show driven
// from a laptop running the dev server is exactly where it would.
const HTTP1_PERSISTENT_CONNECTIONS = 6
const OUTPUT_OWN_CONNECTION = 1

export const HTTP1_PAGE_SURFACE_LIMIT = HTTP1_PERSISTENT_CONNECTIONS - OUTPUT_OWN_CONNECTION - 1

// 'h2', 'h3', 'http/1.1', or '' when the browser will not say.
export const originProtocol = () => {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) return ''
    const [navigation] = performance.getEntriesByType('navigation')
    return navigation?.nextHopProtocol || ''
}

export const isMultiplexedOrigin = (protocol = originProtocol()) =>
    protocol.startsWith('h2') || protocol.startsWith('h3')

// The number of surfaces that each need their own page. Colour, image, video
// and test surfaces cost no connection and are not counted.
export const countPageSurfaces = (surfaces = []) => surfaces.filter((surface) => (
    surface.enabled && ['project', 'url'].includes(surface.source?.kind) && surface.source?.ref
)).length

// The warning an operator needs BEFORE the room fills, or null.
export const transportWarning = (surfaces = [], protocol = originProtocol()) => {
    const pages = countPageSurfaces(surfaces)
    if (pages <= HTTP1_PAGE_SURFACE_LIMIT) return null
    // An unknown protocol is not treated as a problem: saying "this will fail"
    // to somebody whose wall is about to work is worse than staying quiet.
    if (!protocol || isMultiplexedOrigin(protocol)) return null
    return `${pages} live page surfaces on an ${protocol} origin — only about ${HTTP1_PAGE_SURFACE_LIMIT} will load. Serve this over HTTPS/h2, or use video or image surfaces.`
}

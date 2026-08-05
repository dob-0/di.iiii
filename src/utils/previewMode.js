// `?preview=1` — the page is embedded as a thumbnail in a Studio space card
// (SpaceHub.jsx), not opened by a visitor. PublicProjectViewer has honoured it
// since the cards were built, but a space with no published project renders the
// generic <App /> instead, which ignored it entirely: the card then showed the
// editor's Enter VR / Enter AR / Mode chrome instead of the scene.
export function isPreviewRequest(search) {
    const raw = typeof search === 'string'
        ? search
        : (typeof window !== 'undefined' ? window.location.search : '')
    if (!raw) return false
    return new URLSearchParams(raw).get('preview') === '1'
}

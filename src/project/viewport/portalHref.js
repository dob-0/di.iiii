// Where a gateway portal lands. Pure and exported so the routing decision is
// testable without mounting a canvas.
//
// It lives in its own leaf module, apart from PortalObject, because that file
// draws the door and therefore imports three. Anything that only needs to know
// where a door GOES — the accessible/crawlable text layer, a link list — must
// be able to ask without pulling the renderer into its bundle. The published
// code-mode page guards exactly that (publicViewerCodeModeGraph.test.js), and
// it is what caught this being imported from the wrong side.
//
// `anchor` (optional, reference.anchor) lands on a part of the page: a door "back to the works" goes to /dilijan#works,
// not the top of the front page (owner 2026-10-23, N1248). Only a plain id is accepted; anything else is dropped.
export const portalHref = (spaceId, projectId, anchor) => {
    const space = String(spaceId || '').trim()
    if (!space) return null
    const project = String(projectId || '').trim()
    const id = String(anchor || '').trim().replace(/^#/, '')
    const hash = /^[A-Za-z][\w:.-]*$/.test(id) ? `#${id}` : ''
    return (project ? `/${space}/${project}` : `/${space}`) + hash
}

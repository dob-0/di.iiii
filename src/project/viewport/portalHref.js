// Where a gateway portal lands. Pure and exported so the routing decision is
// testable without mounting a canvas.
//
// It lives in its own leaf module, apart from PortalObject, because that file
// draws the door and therefore imports three. Anything that only needs to know
// where a door GOES — the accessible/crawlable text layer, a link list — must
// be able to ask without pulling the renderer into its bundle. The published
// code-mode page guards exactly that (publicViewerCodeModeGraph.test.js), and
// it is what caught this being imported from the wrong side.
export const portalHref = (spaceId, projectId) => {
    const space = String(spaceId || '').trim()
    if (!space) return null
    const project = String(projectId || '').trim()
    return project ? `/${space}/${project}` : `/${space}`
}

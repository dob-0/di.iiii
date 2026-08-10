// A hidden window is not a thing that belongs to a surface. It is a thing you
// need back.
//
// This used to be derived from the *surface-filtered* node list, and
// `activeSurface` defaults to 'world', where `matchesNodeTypeSurface` rejects
// every panel-2d type. So on a fresh workspace, closing any panel window —
// webcam, keeper, MIDI, an admin console — removed it from the canvas AND from
// the palette that is supposed to bring it back. The only route left was
// deleting the node and placing a new one, which for an admin window is exactly
// what `deletable: false` forbids.
//
// Closing must always be reversible, so this reads the whole scope.
export const selectHiddenPanelNodes = (nodes = [], isPanel = () => false) =>
    nodes.filter((node) => node && isPanel(node) && node.values?.frame?.visible === false)

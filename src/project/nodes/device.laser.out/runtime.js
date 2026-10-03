// The sending half lives in LaserOutPanelWindow and the server's laser lane — a cube
// on the LAN cannot be computed. Status is the panel's own report, read back the way
// DMX Out's is; an unmounted panel reads as an empty string.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}

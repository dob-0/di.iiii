// Open passes the value through untouched; closed carries NOTHING — a dead
// wire, not a zero. That difference is the node's whole reason to exist:
// downstream defaults take over when the gate closes, exactly as if the
// wire were unplugged. `out` is in PASS_THROUGH_PORTS: bare, it is dead.
export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'out') return undefined
    return input('open') ? input('value') : undefined
}

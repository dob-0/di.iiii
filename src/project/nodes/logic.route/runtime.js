import { operationOf } from '../operation.js'

// Which value speaks.
//
// Gate: open passes Value through untouched; closed carries NOTHING — a dead
// wire, not a zero. That difference is the operation's whole reason to exist:
// downstream defaults take over when the gate closes, exactly as if the wire
// were unplugged. `out` is in PASS_THROUGH_PORTS: bare, in Gate, it is dead.
//
// Switch: Pick chooses which of two speaks — off is A, on is B. Values pass
// through untouched (any type), so it can choose between colours or vectors
// as readily as numbers.
export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'out') return undefined
    if (operationOf(node, 'gate') === 'gate') return input('pick') ? input('a') : undefined
    return input('pick') ? input('b') : input('a')
}

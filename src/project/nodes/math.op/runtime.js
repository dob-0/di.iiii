import { operationOf } from '../operation.js'

// Eight operations, one card. Each entry is the retired one-operation node's
// body verbatim, fallbacks included — `asNumber(input('b'), 1)` on the four
// that had it, the zero guards on Divide and Modulo — so a document authored
// before the merge answers the same numbers after it.
//
// A lookup rather than a `switch`, deliberately: the node-anatomy extractor
// reads a switch label in a runtime as a TYPE id, so eight operation labels
// would make this file claim to hold eight other types' code
// (scripts/node-anatomy-lib.mjs, and its guard in scripts/nodeAnatomy.test.js).
const OPERATIONS = {
    add:      (a, b) => a + b(),
    subtract: (a, b) => a - b(),
    multiply: (a, b) => a * b(1),
    // Division by zero answers 0, not Infinity — a live denominator crossing
    // zero must not blast NaN/Infinity through every downstream node mid-show.
    divide:   (a, b) => (b(1) === 0 ? 0 : a / b(1)),
    modulo:   (a, b) => (b(1) === 0 ? 0 : a % b(1)),
    power:    (a, b) => Math.pow(a, b(1)),
    sin:      (a) => Math.sin(a),
    absolute: (a) => Math.abs(a),
}

// The operation is read from `node.values.operation`, never wired: it is a
// decision about what this card IS, and a card whose identity changed on a
// live wire could not be read off the canvas at all.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const operate = OPERATIONS[operationOf(node, 'add')] || OPERATIONS.add
    return operate(asNumber(input('a')), (fallback = 0) => asNumber(input('b'), fallback))
}

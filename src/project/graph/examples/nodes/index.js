// One example per palette node type (~95 — see listNodeTypes()), grouped by
// family exactly like the palette itself (NODE_FAMILIES in nodeRegistry.js).
// docs/ai/audits/2026-09-14-raw-fix-plan.md, item 6: "examples for every
// node… each wired to show its USE". scripts/generate-node-reference.mjs
// reads this list to build docs/nodes/*; scripts/push-node-examples.mjs
// reads it to put the examples into a real di.iiii space, one project per
// family; src/project/graph/examples/nodes/nodeExamples.test.js reads it to
// prove every example is honest.
import { agentsExamples } from './agents.js'
import { bringInExamples } from './bringIn.js'
import { makeExamples } from './make.js'
import { numbersExamples } from './numbers.js'
import { pictureExamples } from './picture.js'
import { roomExamples } from './room.js'
import { sendOutExamples } from './sendOut.js'
import { watchExamples } from './watch.js'

// Same order and ids as NODE_FAMILIES, so "examples by family" reads exactly
// like the palette a person opens.
export const NODE_EXAMPLE_FAMILIES = [
    { id: 'make', label: 'make', examples: makeExamples },
    { id: 'numbers', label: 'numbers', examples: numbersExamples },
    { id: 'room', label: 'the scene', examples: roomExamples },
    { id: 'watch', label: 'watch', examples: watchExamples },
    { id: 'bring-in', label: 'bring in', examples: bringInExamples },
    { id: 'send-out', label: 'send out', examples: sendOutExamples },
    { id: 'agents', label: 'agents', examples: agentsExamples },
    { id: 'picture', label: 'pictures', examples: pictureExamples }
]

/** Every example, flattened, each carrying its family id. */
export const ALL_NODE_EXAMPLES = NODE_EXAMPLE_FAMILIES.flatMap((family) =>
    family.examples.map((example) => ({ ...example, familyId: family.id }))
)

export const getNodeExample = (typeId) => ALL_NODE_EXAMPLES.find((example) => example.typeId === typeId) || null

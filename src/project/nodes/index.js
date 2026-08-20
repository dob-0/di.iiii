import { computeOutput as geomArray } from './geom.array/runtime.js'
import { computeOutput as logicCompare } from './logic.compare/runtime.js'
import { computeOutput as logicGate } from './logic.gate/runtime.js'
import { computeOutput as logicSwitch } from './logic.switch/runtime.js'
import { computeOutput as mediaAudioLevels } from './media.audio/runtime.js'
import { computeOutput as mediaVideoFrame } from './media.video/runtime.js'
import { computeOutput as signalLag } from './signal.lag/runtime.js'
import { computeOutput as valueNoise } from './value.noise/runtime.js'

// Colocated node runtimes — the lookup-first side of the registry plan.
// nodeGraphRuntime consults this map BEFORE its type switch; a type lives in
// exactly one of the two (nodeRuntimes.test.js holds that both ways), and
// every new operator lands here, in its own folder, so the dispatchers stop
// growing. Runtimes receive ONLY what they're handed — (node, portId,
// { input, asNumber, context }) — and import nothing from the graph runtime,
// which keeps the dependency one-way.
export const NODE_RUNTIMES = new Map([
    ['geom.array', geomArray],
    ['logic.compare', logicCompare],
    ['logic.gate', logicGate],
    ['logic.switch', logicSwitch],
    ['media.audio', mediaAudioLevels],
    ['media.video', mediaVideoFrame],
    ['signal.lag', signalLag],
    ['value.noise', valueNoise],
])

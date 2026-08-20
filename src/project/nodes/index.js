import { computeOutput as geomArray } from './geom.array/runtime.js'
import { computeOutput as mathAdd } from './math.add/runtime.js'
import { computeOutput as mathClamp } from './math.clamp/runtime.js'
import { computeOutput as mathExtremes } from './math.extremes/runtime.js'
import { computeOutput as mathDivide } from './math.divide/runtime.js'
import { computeOutput as mathMix } from './math.mix/runtime.js'
import { computeOutput as mathMod } from './math.mod/runtime.js'
import { computeOutput as mathMultiply } from './math.multiply/runtime.js'
import { computeOutput as mathPow } from './math.pow/runtime.js'
import { computeOutput as mathRange } from './math.range/runtime.js'
import { computeOutput as mathRound } from './math.round/runtime.js'
import { computeOutput as mathSin } from './math.sin/runtime.js'
import { computeOutput as mathSubtract } from './math.subtract/runtime.js'
import { computeOutput as timeClock } from './time/runtime.js'
import { computeOutput as logicCombine } from './logic.combine/runtime.js'
import { computeOutput as logicCompare } from './logic.compare/runtime.js'
import { computeOutput as mathAbs } from './math.abs/runtime.js'
import { computeOutput as logicGate } from './logic.gate/runtime.js'
import { computeOutput as logicSwitch } from './logic.switch/runtime.js'
import { computeOutput as logicToggle } from './logic.toggle/runtime.js'
import { computeOutput as mediaAudioLevels } from './media.audio/runtime.js'
import { computeOutput as mediaVideoFrame } from './media.video/runtime.js'
import { computeOutput as signalCounter } from './signal.counter/runtime.js'
import { computeOutput as signalDelay } from './signal.delay/runtime.js'
import { computeOutput as signalEase } from './signal.ease/runtime.js'
import { computeOutput as signalHold } from './signal.hold/runtime.js'
import { computeOutput as signalLag } from './signal.lag/runtime.js'
import { computeOutput as signalLfo } from './signal.lfo/runtime.js'
import { computeOutput as signalSpeed } from './signal.speed/runtime.js'
import { computeOutput as signalTimer } from './signal.timer/runtime.js'
import { computeOutput as signalTrigger } from './signal.trigger/runtime.js'
import { computeOutput as viewTimeline } from './view.timeline/runtime.js'
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
    ['math.add', mathAdd],
    ['math.clamp', mathClamp],
    ['math.extremes', mathExtremes],
    ['math.divide', mathDivide],
    ['math.mix', mathMix],
    ['math.mod', mathMod],
    ['math.multiply', mathMultiply],
    ['math.pow', mathPow],
    ['math.range', mathRange],
    ['math.round', mathRound],
    ['math.sin', mathSin],
    ['math.subtract', mathSubtract],
    ['time', timeClock],
    ['logic.combine', logicCombine],
    ['logic.compare', logicCompare],
    ['math.abs', mathAbs],
    ['logic.gate', logicGate],
    ['logic.switch', logicSwitch],
    ['logic.toggle', logicToggle],
    ['media.audio', mediaAudioLevels],
    ['media.video', mediaVideoFrame],
    ['signal.counter', signalCounter],
    ['signal.delay', signalDelay],
    ['signal.ease', signalEase],
    ['signal.hold', signalHold],
    ['signal.lag', signalLag],
    ['signal.lfo', signalLfo],
    ['signal.speed', signalSpeed],
    ['signal.timer', signalTimer],
    ['signal.trigger', signalTrigger],
    ['value.noise', valueNoise],
    ['view.timeline', viewTimeline],
])

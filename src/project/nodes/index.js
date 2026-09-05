import { computeOutput as colourCombine } from './colour.combine/runtime.js'
import { computeOutput as colourRamp } from './colour.ramp/runtime.js'
import { computeOutput as colourSplit } from './colour.split/runtime.js'
import { computeOutput as deviceKeyboard } from './device.keyboard/runtime.js'
import { computeOutput as deviceDmxOut } from './device.dmx.out/runtime.js'
import { computeOutput as deviceMidiOut } from './device.midi.out/runtime.js'
import { computeOutput as geomArray } from './geom.array/runtime.js'
import { computeOutput as geomCone } from './geom.cone/runtime.js'
import { computeOutput as geomCylinder } from './geom.cylinder/runtime.js'
import { computeOutput as geomTorus } from './geom.torus/runtime.js'
import { computeOutput as geomTransform } from './geom.transform/runtime.js'
import { computeOutput as mathClamp } from './math.clamp/runtime.js'
import { computeOutput as mathOp } from './math.op/runtime.js'
import { computeOutput as mathExtremes } from './math.extremes/runtime.js'
import { computeOutput as mathMix } from './math.mix/runtime.js'
import { computeOutput as mathRange } from './math.range/runtime.js'
import { computeOutput as mathRound } from './math.round/runtime.js'
import { computeOutput as timeClock } from './time/runtime.js'
import { computeOutput as logicCombine } from './logic.combine/runtime.js'
import { computeOutput as logicCompare } from './logic.compare/runtime.js'
import { computeOutput as logicRoute } from './logic.route/runtime.js'
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
import { computeOutput as viewButton } from './view.button/runtime.js'
import { computeOutput as viewTimeline } from './view.timeline/runtime.js'
import { computeOutput as geomCircle } from './geom.circle/runtime.js'
import { computeOutput as geomLine } from './geom.line/runtime.js'
import { computeOutput as valueNoise } from './value.noise/runtime.js'
import { computeOutput as valueRandom } from './value.random/runtime.js'
import { computeOutput as vectorAim } from './vector.aim/runtime.js'
import { computeOutput as vectorCombine } from './vector.combine/runtime.js'
import { computeOutput as vectorCross } from './vector.cross/runtime.js'
import { computeOutput as vectorDirection } from './vector.direction/runtime.js'
import { computeOutput as vectorDistance } from './vector.distance/runtime.js'
import { computeOutput as vectorDot } from './vector.dot/runtime.js'
import { computeOutput as vectorRotation } from './vector.rotation/runtime.js'
import { computeOutput as vectorSplit } from './vector.split/runtime.js'

// Colocated node runtimes — the lookup-first side of the registry plan.
// nodeGraphRuntime consults this map BEFORE its type switch; a type lives in
// exactly one of the two (nodeRuntimes.test.js holds that both ways), and
// every new operator lands here, in its own folder, so the dispatchers stop
// growing. Runtimes receive ONLY what they're handed — (node, portId,
// { input, asNumber, context }) — and import nothing from the graph runtime,
// which keeps the dependency one-way.
export const NODE_RUNTIMES = new Map([
    ['colour.combine', colourCombine],
    ['colour.ramp', colourRamp],
    ['colour.split', colourSplit],
    ['device.keyboard', deviceKeyboard],
    ['device.dmx.out', deviceDmxOut],
    ['device.midi.out', deviceMidiOut],
    ['geom.array', geomArray],
    ['geom.cone', geomCone],
    ['geom.cylinder', geomCylinder],
    ['geom.torus', geomTorus],
    ['geom.transform', geomTransform],
    ['math.clamp', mathClamp],
    ['math.op', mathOp],
    ['math.extremes', mathExtremes],
    ['math.mix', mathMix],
    ['math.range', mathRange],
    ['math.round', mathRound],
    ['time', timeClock],
    ['logic.combine', logicCombine],
    ['logic.compare', logicCompare],
    ['logic.route', logicRoute],
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
    ['geom.circle', geomCircle],
    ['geom.line', geomLine],
    ['value.noise', valueNoise],
    ['value.random', valueRandom],
    ['vector.aim', vectorAim],
    ['vector.combine', vectorCombine],
    ['vector.cross', vectorCross],
    ['vector.direction', vectorDirection],
    ['vector.distance', vectorDistance],
    ['vector.dot', vectorDot],
    ['vector.rotation', vectorRotation],
    ['vector.split', vectorSplit],
    ['view.button', viewButton],
    ['view.timeline', viewTimeline],
])

import { startLiveAiRestyle } from '../../map/liveAiRestyle.js'

// AI Restyle, the picture operator: its input goes to the image model on this
// machine and the answer becomes its output. The same engine, relay and client
// as the map desk's AI restyle (src/map/liveAiRestyle.js, scripts/liveai/).
//
// It runs BESIDE the operator network, never inside it. A model answer takes
// tens to hundreds of milliseconds; a frame of the network takes one or two.
// So the runner reads the operator's input out of the engine when the model is
// free (one frame in flight, as always), and hands each answer back as the
// operator's source picture (engine.setImage). Everything else in the network
// keeps its frame rate, and until the first answer the operator passes its
// input straight through (the shader reads `sourceReady`).

/**
 * Pixels read back from GL run bottom-up; a canvas runs top-down. Flip rows
 * into an ImageData the send canvas can take.
 */
export const flipRows = (pixels, width, height) => {
    const out = new Uint8ClampedArray(width * height * 4)
    const row = width * 4
    for (let y = 0; y < height; y += 1) {
        out.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
    }
    return out
}

/**
 * Start one AI Restyle operator.
 * @param {object} options
 * @param {{ readInput, setImage, width, height }} options.engine  the running topEngine (or anything shaped like it)
 * @param {string} options.nodeId
 * @param {{ prompt?: string, strength?: number }} options.params
 * @param {(status: { state: string, detail: string }) => void} [options.onStatus]
 * @returns {{ setParams(params): void, stop(): void }}
 */
export const startAiRestyleNode = ({
    engine,
    nodeId,
    params = {},
    onStatus = () => {},
    start = startLiveAiRestyle,
    createCanvas = () => globalThis.document.createElement('canvas'),
    makeImageData = (data, width, height) => new ImageData(data, width, height)
}) => {
    // Where the model's answers are drawn; the engine uploads it on each new version.
    const answers = createCanvas()
    answers.width = 512
    answers.height = Math.max(64, Math.round((512 * engine.height) / engine.width / 8) * 8)
    const picture = { canvas: answers, version: 0 }

    const source = {
        // The engine's processing size; the client scales it to ~512 wide.
        size: () => ({ width: engine.width, height: engine.height }),
        draw: (context, width, height) => {
            const pixels = engine.readInput(nodeId, width, height)
            if (!pixels) return false // nothing wired in yet
            context.putImageData(makeImageData(flipRows(pixels, width, height), width, height), 0, 0)
            return true
        }
    }

    const client = start({
        canvas: answers,
        source,
        params,
        onStatus,
        onFrame: () => {
            picture.version += 1
            // Registered on the first answer: until then the operator shows its input.
            if (picture.version === 1) engine.setImage(nodeId, picture)
        },
        createCanvas
    })

    return {
        setParams: (next) => client.setParams(next),
        stop: () => {
            client.stop()
            engine.setImage(nodeId, null)
        }
    }
}

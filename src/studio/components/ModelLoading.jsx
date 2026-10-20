// THE PLACE IS LOADING — a strip that moves while models (the hall, the truss, any .glb) are still on their way, so a room
// that is half drawn never looks like a crash (owner 2026-10-16: "create loading animation where we will see the animation";
// his Studio showed the lamps and no hall for minutes and said nothing). Reads src/objectComponents/modelLoads.js; in the
// Studio's own style (studio-coach.css: dark box, cyan edge, square dots, no round corners). Gone the moment the last model is in.
import { useSyncExternalStore } from 'react'
import { getModelLoadSnapshot, subscribeModelLoads } from '../../objectComponents/modelLoads.js'
import '../styles/model-loading.css'

export const modelLoadingLabel = ({ done, total }) => (total > 1 ? `Loading the place · ${done} of ${total}` : 'Loading the place')

export default function ModelLoading() {
    const wave = useSyncExternalStore(subscribeModelLoads, getModelLoadSnapshot, getModelLoadSnapshot)
    if (!wave.loading) return null
    const share = wave.total ? wave.done / wave.total : 0
    return (
        <div className="model-loading" role="status" aria-live="polite">
            <span className="model-loading-dots" aria-hidden="true"><span /><span /><span /></span>
            <span className="model-loading-label">{modelLoadingLabel(wave)}</span>
            <span className="model-loading-track" aria-hidden="true">
                <span className="model-loading-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                <span className="model-loading-sweep" />
            </span>
        </div>
    )
}

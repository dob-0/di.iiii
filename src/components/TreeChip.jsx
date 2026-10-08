import './treeChip.css'
import { getMapLocationState } from '../map/mapRouting.js'
import { isPreviewRequest } from '../utils/previewMode.js'
import { devTreeChipText, devTreeChipTitle, resolveDevTree } from '../utils/devTree.js'

// "Which copy is this tab?" — mounted once in RootApp beside ModeMark, so every
// surface (Studio, Raw, a space, the viewer) carries it. Present only when
// `di-dev` started this copy (VITE_DI_TREE set); the installed di and a
// production build render nothing. Unlike ModeMark's chip it does not fade:
// the point is that a dev copy never looks like the owner's real di.
export default function TreeChip({ env }) {
    const info = resolveDevTree(env)
    if (!info) return null
    // Same exclusions as ModeMark: a thumbnail, an embed and a projector's
    // output are pictures, not a tab someone is working in.
    if (typeof window !== 'undefined' && (isPreviewRequest() || window.self !== window.top)) return null
    if (getMapLocationState().isOutput) return null
    return (
        <div
            className="tree-chip"
            data-mode={info.mode}
            role="status"
            title={devTreeChipTitle(info)}
        >
            {devTreeChipText(info)}
        </div>
    )
}

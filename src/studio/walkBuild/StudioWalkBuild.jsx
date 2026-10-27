import { Suspense, lazy } from 'react'
import { useWalkMode } from '../navigation/useWalkNavigation.js'

// THE HAND, over the Studio's canvas, while you Walk or Fly (owner, 2026-10-13: "walk mode in
// studio can be the minecraft style one"). It exists only while a walk runs; the public
// viewer never mounts it. The hand itself (WalkHand.jsx) is its own chunk: it offers EVERY type
// in the fixture library, so the Studio downloads that library when a walk starts, not when a
// project opens (a project's own types load by themselves: rigbuild/types/projectTypes.js).
const Hand = lazy(() => import('./WalkHand.jsx'))

/** Mounted once in the Studio; draws and listens only while a Walk or Fly runs. */
export default function StudioWalkBuild(props) {
    const mode = useWalkMode()
    if (!mode) return null
    return <Suspense fallback={null}><Hand {...props} /></Suspense>
}

import LoadingScreen from './LoadingScreen.jsx'

// The Suspense fallback for every lazily-loaded route surface.
//
// Kept as its own name because that is what the ~15 call sites in RootApp and
// AppSurfaceSwitch say, and because "the thing a route shows while its chunk
// downloads" is a distinct idea from "the loading screen" even when they look
// identical. The look lives in LoadingScreen.
export default function RouteSurfaceFallback({
    label = 'Loading',
    detail = ''
}) {
    return <LoadingScreen label={label} detail={detail} />
}

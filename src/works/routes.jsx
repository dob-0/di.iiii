import { lazy } from 'react'

/**
 * The runtime half of the works registry: the only file in the platform that
 * imports a work's code. works.js holds the facts the build needs; this holds
 * the lazy components the router mounts.
 *
 * Split in two on purpose — vite.config.js reads works.js at build time, and a
 * build config cannot load JSX. Keeping the components here means the data
 * stays loadable by both.
 *
 * Every entry is lazy(). A work is a door the visitor opens, never something
 * the app pays for on first paint — and under DI_PROFILE=local these imports
 * resolve to a stub, so the work is not in the artifact at all.
 */

const WccExperience = lazy(() => import('../wcc/WccExperience.jsx'))
const AlgoVrithmExperience = lazy(() => import('../algoVrithm/AlgoVrithmExperience.jsx'))
const AlgoVrithmLanding = lazy(() => import('../algoVrithm/landing/AlgoVrithmLanding.jsx'))

/**
 * `mode` is 'landing' or 'scene' — the split every work route already had:
 * the bare path is a landing page because entering costs a renderer and, for
 * algovrithm, a photosensitivity warning, and neither should be spent on
 * someone who has only followed a link.
 *
 * wcc takes the mode as a prop; algovrithm is two separate components. The
 * difference is real, so it is expressed here rather than flattened into the
 * data and reconstructed by the router.
 */
export const WORK_SURFACES = {
    wcc: (mode) => <WccExperience initialMode={mode} />,
    algovrithm: (mode) => (mode === 'scene' ? <AlgoVrithmExperience /> : <AlgoVrithmLanding />)
}

export const workSurface = (id) => WORK_SURFACES[id] ?? null

/**
 * The piece embedded inside Studio's code-space director page — the same
 * component, without the route's landing/scene split.
 *
 * The COMPONENT itself, not a wrapper around it. The caller renders it as
 * `<Surface embedded director />`, and those two props are the whole
 * integration — `embedded` swaps the piece off `position: fixed` so it stops
 * covering the header naming the space, `director` forces the timeline panel
 * on. A wrapper would have to forward them by hand (mine dropped them first
 * time, which the page's own test caught), and an arrow function here reads to
 * react-hooks as a component created during render.
 */
export const WORK_DIRECTOR_SURFACES = {
    algovrithm: AlgoVrithmExperience
}


/**
 * A work's director descriptor, loaded on demand. Not part of WORK_SURFACES
 * because it is not a component: it is the data the director panel edits, and
 * it reaches the piece's sequences and media bin — which is exactly why it has
 * to stay behind an import() rather than sitting in the main graph.
 */
export const WORK_PIECES = {
    algovrithm: () => import('../algoVrithm/directorPiece.js')
}

export const workPieceLoader = (id) => WORK_PIECES[id] ?? null

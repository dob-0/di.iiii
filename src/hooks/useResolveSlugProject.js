import { useEffect, useState } from 'react'
import { resolveVanityProjectLink, supportsServerSpaces } from '../services/serverSpaces.js'

// Resolves the unresolved /{spaceSegment}/{projectSegment} shape classified
// by getAppLocationState (appState.projectSlugSegment) against the real
// space/project — docs/architecture/SPEC_space_urls_and_portability.md.
// `result` is undefined while loading, null when the pair didn't resolve to
// a real project (caller should fall through to a plain space route), or
// { space, project } on a hit. Errors other than "not found" (e.g. a private
// space needing auth) are rethrown to the caller via `error`, not swallowed.
// `notFound` is true only when the server ANSWERED that nothing is at this pair
// (its 404). A build with no server API also gets result null, but notFound
// false: it has asked nobody, so it must not tell the visitor "there is no
// such project" (audit F010, 2026-10-28).
export default function useResolveSlugProject(spaceSegment, projectSegment) {
    const [state, setState] = useState({ result: undefined, error: null, notFound: false })

    useEffect(() => {
        if (!spaceSegment || !projectSegment || !supportsServerSpaces) {
            setState({ result: null, error: null, notFound: false })
            return undefined
        }
        let cancelled = false
        setState({ result: undefined, error: null, notFound: false })
        resolveVanityProjectLink(spaceSegment, projectSegment)
            .then((result) => {
                if (cancelled) return
                setState({ result, error: null, notFound: result === null })
            })
            .catch((error) => {
                if (cancelled) return
                setState({ result: null, error, notFound: false })
            })
        return () => {
            cancelled = true
        }
    }, [spaceSegment, projectSegment])

    return state
}

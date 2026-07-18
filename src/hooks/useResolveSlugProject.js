import { useEffect, useState } from 'react'
import { resolveVanityProjectLink, supportsServerSpaces } from '../services/serverSpaces.js'

// Resolves the unresolved /{spaceSegment}/{projectSegment} shape classified
// by getAppLocationState (appState.projectSlugSegment) against the real
// space/project — docs/architecture/SPEC_space_urls_and_portability.md.
// `result` is undefined while loading, null when the pair didn't resolve to
// a real project (caller should fall through to a plain space route), or
// { space, project } on a hit. Errors other than "not found" (e.g. a private
// space needing auth) are rethrown to the caller via `error`, not swallowed.
export default function useResolveSlugProject(spaceSegment, projectSegment) {
    const [state, setState] = useState({ result: undefined, error: null })

    useEffect(() => {
        if (!spaceSegment || !projectSegment || !supportsServerSpaces) {
            setState({ result: null, error: null })
            return undefined
        }
        let cancelled = false
        setState({ result: undefined, error: null })
        resolveVanityProjectLink(spaceSegment, projectSegment)
            .then((result) => {
                if (cancelled) return
                setState({ result, error: null })
            })
            .catch((error) => {
                if (cancelled) return
                setState({ result: null, error })
            })
        return () => {
            cancelled = true
        }
    }, [spaceSegment, projectSegment])

    return state
}

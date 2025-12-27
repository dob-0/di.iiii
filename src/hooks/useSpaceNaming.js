import { useMemo } from 'react'
import { slugifySpaceName, isValidSpaceSlug, getSpaceSlugLimits } from '../utils/spaceNames.js'

export function useSpaceNaming({
    newSpaceName,
    spaces = [],
    isCreatingSpace = false,
    buildSpacePath
}) {
    const slugLimits = useMemo(() => getSpaceSlugLimits(), [])
    const trimmedSpaceName = useMemo(() => (newSpaceName || '').trim(), [newSpaceName])
    const newSpaceSlug = useMemo(() => slugifySpaceName(trimmedSpaceName), [trimmedSpaceName])
    const isSpaceNameValid = isValidSpaceSlug(newSpaceSlug)
    const isSpaceNameAvailable = isSpaceNameValid && !spaces.some(space => space.id === newSpaceSlug)
    const canCreateNamedSpace = Boolean(trimmedSpaceName) && isSpaceNameAvailable
    const canCreateSpace = canCreateNamedSpace && !isCreatingSpace

    const spaceNameFeedback = useMemo(() => {
        if (!trimmedSpaceName) {
            return {
                tone: 'hint',
                message: `Name becomes the share link (min ${slugLimits.min} characters).`
            }
        }
        if (!isSpaceNameValid) {
            return {
                tone: 'error',
                message: `Use lowercase letters, numbers, or dashes (${slugLimits.min}-${slugLimits.max} characters).`
            }
        }
        if (!isSpaceNameAvailable) {
            return {
                tone: 'error',
                message: 'That name is taken. Try another.'
            }
        }
        const sharePath = typeof buildSpacePath === 'function' ? buildSpacePath(newSpaceSlug) : newSpaceSlug
        return {
            tone: 'success',
            message: `Share link will be "${sharePath}".`
        }
    }, [trimmedSpaceName, isSpaceNameValid, isSpaceNameAvailable, newSpaceSlug, slugLimits, buildSpacePath])

    return {
        trimmedSpaceName,
        newSpaceSlug,
        spaceNameFeedback,
        canCreateNamedSpace,
        canCreateSpace
    }
}

export default useSpaceNaming

import { useMemo } from 'react'

export function useSpaceLabel({ spaceId, onCopyLink }) {
    return useMemo(() => {
        if (spaceId) {
            return {
                key: 'space-label',
                label: `Space: ${spaceId}`,
                onClick: () => onCopyLink?.(spaceId),
                title: 'Click to copy this space link'
            }
        }
        return {
            key: 'space-label',
            label: 'Not in a space',
            disabled: true
        }
    }, [spaceId, onCopyLink])
}

export default useSpaceLabel

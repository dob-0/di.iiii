import { useMemo } from 'react'

export function useControlSections({
    isUiVisible,
    sceneButtons = [],
    panelButtons = [],
    adminButtons = [],
    displayButtons = [],
    xrButtons = []
}) {
    return useMemo(() => {
        const sections = []
        if (isUiVisible && sceneButtons.length) sections.push({ key: 'scene', label: 'Scene', buttons: sceneButtons })
        if (isUiVisible && panelButtons.length) sections.push({ key: 'panels', label: 'Panels', buttons: panelButtons })
        if (isUiVisible && adminButtons.length) sections.push({ key: 'admin', label: 'Admin', buttons: adminButtons })
        if (isUiVisible && displayButtons.length) sections.push({ key: 'display', label: 'Display', buttons: displayButtons })
        if (xrButtons.length) sections.push({ key: 'xr', label: 'XR', buttons: xrButtons })
        return sections
    }, [isUiVisible, sceneButtons, panelButtons, adminButtons, displayButtons, xrButtons])
}

export default useControlSections

import { useMemo } from 'react'

export function useStatusPanel({ statusItems = [], isStatusPanelVisible, isUiVisible }) {
    return useMemo(() => {
        const activeStatusCount = statusItems.filter(item => item.key !== 'server-status').length
        const shouldShowStatusPanel = statusItems.length > 0 && isStatusPanelVisible && (isUiVisible || activeStatusCount > 0)
        const statusPanelClassName = [
            'status-panel',
            isUiVisible ? 'status-panel-docked' : 'status-panel-compact',
            activeStatusCount > 0 ? 'status-panel-active' : 'status-panel-idle'
        ].filter(Boolean).join(' ')
        const statusSummary = activeStatusCount > 0
            ? `${activeStatusCount} active ${activeStatusCount === 1 ? 'task' : 'tasks'}`
            : 'All clear'
        const statusDotClass = ['status-dot', activeStatusCount > 0 ? 'active' : 'idle'].join(' ')

        return {
            shouldShowStatusPanel,
            statusPanelClassName,
            statusSummary,
            statusDotClass
        }
    }, [statusItems, isStatusPanelVisible, isUiVisible])
}

export default useStatusPanel

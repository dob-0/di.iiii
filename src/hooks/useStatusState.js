import { useCallback, useEffect, useMemo, useState } from 'react'

export function useStatusState({
    spaceId,
    localSaveStatus: externalLocalSaveStatus,
    markLocalSave: externalMarkLocalSave,
    serverSyncInfo: externalServerSyncInfo,
    markServerSync: externalMarkServerSync
} = {}) {
    const statusPanelStorageKey = useMemo(() => (spaceId ? `status-panel:${spaceId}` : 'status-panel:local'), [spaceId])
    const [isStatusPanelVisible, setIsStatusPanelVisible] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            const stored = window.localStorage.getItem(statusPanelStorageKey)
            if (stored === 'on') return true
            if (stored === 'off') return false
        } catch {
            // ignore
        }
        return false
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(statusPanelStorageKey, isStatusPanelVisible ? 'on' : 'off')
        } catch {
            // ignore
        }
    }, [isStatusPanelVisible, statusPanelStorageKey])

    const [localSaveStatus, setLocalSaveStatus] = useState({ ts: null, label: 'Not saved locally' })
    const markLocalSave = useCallback((label = 'Saved locally') => {
        setLocalSaveStatus({ ts: Date.now(), label })
    }, [])
    const resolvedLocalSaveStatus = externalLocalSaveStatus || localSaveStatus
    const resolvedMarkLocalSave = externalMarkLocalSave || markLocalSave

    const [serverSyncInfo, setServerSyncInfo] = useState({ ts: null, label: 'Server: not synced yet' })
    const markServerSync = useCallback((label = 'Synced with server') => {
        setServerSyncInfo({ ts: Date.now(), label })
    }, [])
    const resolvedServerSyncInfo = externalServerSyncInfo || serverSyncInfo
    const resolvedMarkServerSync = externalMarkServerSync || markServerSync

    return {
        isStatusPanelVisible,
        setIsStatusPanelVisible,
        localSaveStatus: resolvedLocalSaveStatus,
        markLocalSave: resolvedMarkLocalSave,
        serverSyncInfo: resolvedServerSyncInfo,
        markServerSync: resolvedMarkServerSync
    }
}

export default useStatusState

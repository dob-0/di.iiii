import { useCallback, useEffect, useRef, useState } from 'react'

const defaultClone = (value) => JSON.parse(JSON.stringify(value))

export function useSceneHistory({
    snapshot = null,
    restoreSnapshot,
    isLoading = false,
    cloneSnapshot = defaultClone,
    maxHistory = 50
} = {}) {
    const [history, setHistory] = useState([])
    const [historyIndex, setHistoryIndexInternal] = useState(-1)
    const historyIndexRef = useRef(-1)
    const isHistoryRestoring = useRef(false)
    const lastSnapshotSignatureRef = useRef(null)

    const setHistoryIndex = useCallback((valueOrUpdater) => {
        setHistoryIndexInternal(prev => {
            const nextValue = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater
            historyIndexRef.current = nextValue
            return nextValue
        })
    }, [])

    useEffect(() => {
        if (isLoading || snapshot == null) return
        const signature = JSON.stringify(snapshot)
        if (isHistoryRestoring.current) {
            isHistoryRestoring.current = false
            lastSnapshotSignatureRef.current = signature
            return
        }
        if (signature === lastSnapshotSignatureRef.current) {
            return
        }

        setHistory(prevHistory => {
            const pointer = historyIndexRef.current
            const truncated = prevHistory.slice(0, pointer + 1)
            const nextEntry = cloneSnapshot(snapshot)
            let nextHistory = [...truncated, nextEntry]
            const overflow = Math.max(0, nextHistory.length - maxHistory)
            if (overflow > 0) {
                nextHistory = nextHistory.slice(overflow)
            }
            setHistoryIndex(nextHistory.length - 1)
            lastSnapshotSignatureRef.current = signature
            return nextHistory
        })
    }, [cloneSnapshot, isLoading, maxHistory, setHistoryIndex, snapshot])

    const handleUndo = useCallback(() => {
        if (typeof restoreSnapshot !== 'function') return
        setHistoryIndex(prev => {
            if (prev <= 0) return prev
            const newIndex = prev - 1
            const entry = history[newIndex]
            if (entry) {
                isHistoryRestoring.current = true
                restoreSnapshot(cloneSnapshot(entry))
            }
            return newIndex
        })
    }, [cloneSnapshot, history, restoreSnapshot, setHistoryIndex])

    const handleRedo = useCallback(() => {
        if (typeof restoreSnapshot !== 'function') return
        setHistoryIndex(prev => {
            if (prev >= history.length - 1) return prev
            const newIndex = prev + 1
            const entry = history[newIndex]
            if (entry) {
                isHistoryRestoring.current = true
                restoreSnapshot(cloneSnapshot(entry))
            }
            return newIndex
        })
    }, [cloneSnapshot, history, restoreSnapshot, setHistoryIndex])

    const canUndo = historyIndex > 0
    const canRedo = historyIndex < history.length - 1 && historyIndex >= 0

    return {
        canUndo,
        canRedo,
        handleUndo,
        handleRedo
    }
}

export default useSceneHistory

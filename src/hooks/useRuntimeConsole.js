import { useCallback, useEffect, useState } from 'react'
import {
    clearRuntimeConsole,
    getRuntimeConsoleEntries,
    subscribeRuntimeConsole
} from '../services/runtimeConsole.js'

export function useRuntimeConsole() {
    const [entries, setEntries] = useState(() => getRuntimeConsoleEntries())

    useEffect(() => subscribeRuntimeConsole(setEntries), [])

    const clearEntries = useCallback(() => {
        clearRuntimeConsole()
    }, [])

    return {
        entries,
        clearEntries
    }
}

export default useRuntimeConsole

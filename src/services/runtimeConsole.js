const MAX_RUNTIME_CONSOLE_ENTRIES = 250

let runtimeConsolePatched = false
let runtimeConsoleListeners = new Set()
let runtimeConsoleEntries = []
let runtimeConsoleSequence = 0

const notifyRuntimeConsoleListeners = () => {
    const snapshot = [...runtimeConsoleEntries]
    runtimeConsoleListeners.forEach((listener) => listener(snapshot))
}

const formatRuntimeConsoleValue = (value) => {
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`
    }
    if (typeof value === 'string') return value
    if (typeof value === 'undefined') return 'undefined'
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return String(value)
    }

    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

const appendRuntimeConsoleEntry = (level, args = [], source = 'console') => {
    runtimeConsoleEntries = [
        ...runtimeConsoleEntries,
        {
            id: `runtime-log-${Date.now()}-${runtimeConsoleSequence++}`,
            timestamp: Date.now(),
            level,
            source,
            message: args.map(formatRuntimeConsoleValue).join(' ')
        }
    ].slice(-MAX_RUNTIME_CONSOLE_ENTRIES)
    notifyRuntimeConsoleListeners()
}

export const ensureRuntimeConsole = () => {
    if (runtimeConsolePatched || typeof window === 'undefined') return
    runtimeConsolePatched = true

    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[level]?.bind(console)
        if (!original) continue

        console[level] = (...args) => {
            original(...args)
            appendRuntimeConsoleEntry(level, args)
        }
    }

    window.addEventListener('error', (event) => {
        appendRuntimeConsoleEntry(
            'error',
            [
                event.message,
                event.filename ? `(${event.filename}:${event.lineno}:${event.colno})` : ''
            ].filter(Boolean),
            'window'
        )
    })

    window.addEventListener('unhandledrejection', (event) => {
        appendRuntimeConsoleEntry('error', ['Unhandled rejection', event.reason], 'promise')
    })
}

export const subscribeRuntimeConsole = (listener) => {
    ensureRuntimeConsole()
    runtimeConsoleListeners.add(listener)
    listener([...runtimeConsoleEntries])
    return () => {
        runtimeConsoleListeners.delete(listener)
    }
}

export const getRuntimeConsoleEntries = () => {
    ensureRuntimeConsole()
    return [...runtimeConsoleEntries]
}

export const clearRuntimeConsole = () => {
    runtimeConsoleEntries = []
    notifyRuntimeConsoleListeners()
}

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import AskDialog from './AskDialog.jsx'
import UndoNotice from './UndoNotice.jsx'

// const { ask, askDialog } = useAsk()   render {askDialog} once.
// const yes = await ask({ title, body, confirmLabel, danger })      -> true | false
// const name = await ask({ title, input: { label, defaultValue } }) -> string | null
// A second ask while one is open answers the first with "no".
export function useAsk() {
    const [state, setState] = useState(null)
    const openRef = useRef(null)
    useEffect(() => { openRef.current = state }, [state])

    const ask = useCallback((options) => new Promise((resolve) => {
        const previous = openRef.current
        previous?.resolve(previous.options?.input ? null : false)
        setState({ options: options || {}, resolve })
    }), [])

    if (!state) return { ask, askDialog: null }
    const { options, resolve } = state
    const settle = (answer) => { setState(null); resolve(answer) }
    const askDialog = createElement(AskDialog, {
        ...options,
        open: true,
        onConfirm: (text) => settle(options.input ? text : true),
        onCancel: () => settle(options.input ? null : false)
    })
    return { ask, askDialog }
}

// const { notify, undoNotice } = useUndoNotice()   render {undoNotice} once.
// notify('Deleted “Cube”', () => restore())   shows Undo for 10 s.
export function useUndoNotice() {
    const [note, setNote] = useState(null)
    const notify = useCallback((message, onUndo) => setNote({ message, onUndo }), [])
    const dismiss = useCallback(() => setNote(null), [])
    const undoNotice = note
        ? createElement(UndoNotice, { message: note.message, onUndo: note.onUndo, onDismiss: dismiss })
        : null
    return { notify, undoNotice }
}

export default useAsk

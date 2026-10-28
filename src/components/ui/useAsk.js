import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import AskDialog from './AskDialog.jsx'
import UndoNotice from './UndoNotice.jsx'

// const { ask, askDialog } = useAsk()   render {askDialog} once.
// const yes = await ask({ title, body, confirmLabel, danger })      -> true | false
// const name = await ask({ title, input: { label, defaultValue } }) -> string | null
// A second ask while one is open answers the first with "no".
// Each ask and each notice gets its own key, so a second one remounts: a fresh
// field, and a fresh 10 s clock even when the message text is the same.
let askSeq = 0
let noteSeq = 0

export function useAsk() {
    const [state, setState] = useState(null)
    const openRef = useRef(null)
    useEffect(() => { openRef.current = state }, [state])

    const ask = useCallback((options) => new Promise((resolve) => {
        const previous = openRef.current
        previous?.resolve(previous.options?.input ? null : false)
        askSeq += 1
        setState({ options: options || {}, resolve, key: askSeq })
    }), [])

    if (!state) return { ask, askDialog: null }
    const { options, resolve, key } = state
    const settle = (answer) => { setState(null); resolve(answer) }
    const askDialog = createElement(AskDialog, {
        ...options,
        key,
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
    const notify = useCallback((message, onUndo) => { noteSeq += 1; setNote({ message, onUndo, key: noteSeq }) }, [])
    const dismiss = useCallback(() => setNote(null), [])
    const undoNotice = note
        ? createElement(UndoNotice, { key: note.key, message: note.message, onUndo: note.onUndo, onDismiss: dismiss })
        : null
    return { notify, undoNotice }
}

export default useAsk

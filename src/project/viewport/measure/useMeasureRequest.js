// The measurement mode's request for React: the URL flag, or the hidden toggle (Alt+Shift+M).
// One key listener for the whole page however many scenes are mounted (two would toggle twice).
import { useSyncExternalStore } from 'react'
import { getMeasureRequest, isMeasureChord, subscribeMeasureRequest, toggleMeasureRequest } from './measureState.js'

let chordInstalled = false
const editable = (el) => Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')))

const installChord = () => {
    if (chordInstalled || typeof window === 'undefined') return
    chordInstalled = true
    window.addEventListener('keydown', (event) => {
        if (!isMeasureChord(event) || editable(event.target)) return
        event.preventDefault()
        toggleMeasureRequest()
    })
}

export default function useMeasureRequest() {
    installChord()
    return useSyncExternalStore(subscribeMeasureRequest, getMeasureRequest, () => null)
}

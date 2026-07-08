// Links and images are natively draggable: a drag that starts on one spawns the
// browser's translucent snapshot ghost instead of driving our pointer-event drag
// handlers. All in-app dragging (panels, gizmos, graph nodes) uses pointer events,
// so native dragstart is never wanted unless an element opts in with draggable="true".
export function suppressNativeDrag(target = document) {
    const onDragStart = (event) => {
        const optIn = event.target?.closest?.('[draggable="true"]')
        if (!optIn) event.preventDefault()
    }
    target.addEventListener('dragstart', onDragStart, true)
    return () => target.removeEventListener('dragstart', onDragStart, true)
}

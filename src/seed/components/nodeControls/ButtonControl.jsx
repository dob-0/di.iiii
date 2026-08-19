export default function ButtonControl({ node, onChangeValues }) {
    const pressed = Boolean(node.values?.pressed)
    const isToggle = node.values?.mode === 'toggle'

    const commit = (nextPressed) => {
        if (nextPressed !== pressed) onChangeValues?.({ pressed: nextPressed })
    }

    const handlePointerDown = (event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        if (isToggle) {
            commit(!pressed)
            return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        commit(true)
    }

    const handlePointerUp = (event) => {
        if (isToggle) return
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        commit(false)
    }

    return (
        <div
            className="seed-control-button"
            role="button"
            tabIndex={0}
            aria-pressed={pressed}
            aria-label={`${node.label} ${isToggle ? 'toggle' : 'button'}`}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                commit(isToggle ? !pressed : true)
            }}
            onKeyUp={(event) => {
                if (isToggle || (event.key !== 'Enter' && event.key !== ' ')) return
                event.preventDefault()
                commit(false)
            }}
            style={{
                height: 32,
                margin: '4px 10px',
                borderRadius: 4,
                background: pressed ? '#ffd166' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,209,102,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                color: pressed ? '#1a1a1a' : '#ffd166',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            {pressed ? 'ON' : isToggle ? 'OFF' : 'PUSH'}
        </div>
    )
}

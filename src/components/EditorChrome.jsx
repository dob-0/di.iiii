import React from 'react'
import Menu from '../Menu.jsx'

export default function EditorChrome({ menu, setMenu, fileInputRef, handleFileLoad }) {
    return (
        <>
            {menu.visible && (
                <Menu
                    x={menu.x}
                    y={menu.y}
                    onClose={() => setMenu(prev => ({ ...prev, visible: false }))}
                />
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".zip,application/zip"
                onChange={handleFileLoad}
            />
        </>
    )
}

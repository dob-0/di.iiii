import React, { useRef, useContext, useState, useLayoutEffect, useEffect } from 'react'
import { AppContext } from './AppContext.js'

export default function Menu({ x, y, onClose }) {
    const fileInputRef = useRef()
    const menuRef = useRef(null)
    const [isUploading, setIsUploading] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ x, y })

    // --- Get the handler from context ---
    const { handleAddObject, handleAssetFilesUpload, transformSnaps, handleUpdateTransformSnaps } = useContext(AppContext)

    useEffect(() => {
        setMenuPosition({ x, y })
    }, [x, y])

    useLayoutEffect(() => {
        const el = menuRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const padding = 12
        let nextX = menuPosition.x
        let nextY = menuPosition.y

        if (rect.right > window.innerWidth - padding) {
            nextX = Math.max(padding, window.innerWidth - rect.width - padding)
        }
        if (rect.left < padding) {
            nextX = padding
        }
        if (rect.bottom > window.innerHeight - padding) {
            nextY = Math.max(padding, window.innerHeight - rect.height - padding)
        }
        if (rect.top < padding) {
            nextY = padding
        }

        if (nextX !== menuPosition.x || nextY !== menuPosition.y) {
            setMenuPosition({ x: nextX, y: nextY })
        }
    }, [menuPosition])

    const handleClick = (e) => {
        e.stopPropagation()
    }

    const handleUploadClick = (e) => {
        e.stopPropagation()
        fileInputRef.current.click()
    }

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files || [])
        if (files.length === 0) return

        setIsUploading(true)
        try {
            await handleAssetFilesUpload(files)
            onClose()
        } catch (error) {
            console.error('Failed to add file asset:', error)
            alert('Error: Could not add this file. Please try again with a different file.')
        } finally {
            setIsUploading(false)
            event.target.value = null
        }
    }

    return (
        <div 
            className="upload-menu upload-menu-dark upload-menu-compact" 
            ref={menuRef}
            style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
            onClick={handleClick}
        >
            <div className="menu-header">
                <h4>Add object</h4>
                <button className="close-button" onClick={onClose} aria-label="Close menu">×</button>
            </div>
            <div className="menu-content">
                <div className="menu-grid compact">
                    <button onClick={() => handleAddObject('box', { color: '#0000ff' })}>Cube</button>
                    <button onClick={() => handleAddObject('sphere', { color: '#ffcc00' })}>Sphere</button>
                    <button onClick={() => handleAddObject('cone', { color: '#00ccff' })}>Cone</button>
                    <button onClick={() => handleAddObject('cylinder', { color: '#a855f7' })}>Cylinder</button>
                    <button onClick={() => handleAddObject('text-3d')}>3D Text</button>
                    <button onClick={() => handleAddObject('text-2d')}>2D Text</button>
                </div>
                <button className="menu-action" onClick={handleUploadClick}>
                    {isUploading ? 'Uploading...' : 'Upload asset'}
                </button>
                <p className="menu-hint">Images, media, glTF, OBJ, STL...</p>
            </div>

            <input 
                type="file" 
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                multiple
                accept="image/*,video/*,audio/*,.glb,.gltf,.obj,.mtl,.stl"
            />
            <div className="menu-snaps">
                <div className="menu-snaps-header">Snapping</div>
                <label>
                    Move (units)
                    <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={transformSnaps?.translation ?? 1}
                        onChange={(e) => {
                            const value = parseFloat(e.target.value)
                            if (!Number.isNaN(value) && value > 0) {
                                handleUpdateTransformSnaps({ translation: value })
                            }
                        }}
                    />
                </label>
                <label>
                    Rotate (deg)
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={transformSnaps?.rotation ?? 15}
                        onChange={(e) => {
                            const value = parseFloat(e.target.value)
                            if (!Number.isNaN(value) && value > 0) {
                                handleUpdateTransformSnaps({ rotation: value })
                            }
                        }}
                    />
                </label>
                <label>
                    Scale (steps)
                    <input
                        type="number"
                        min="0.01"
                        step="0.05"
                        value={transformSnaps?.scale ?? 0.1}
                        onChange={(e) => {
                            const value = parseFloat(e.target.value)
                            if (!Number.isNaN(value) && value > 0) {
                                handleUpdateTransformSnaps({ scale: value })
                            }
                        }}
                    />
                </label>
            </div>
        </div>
    )
}

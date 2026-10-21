import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWalkMode, setWalkBuilder } from '../navigation/useWalkNavigation.js'
import { generateId } from '../../shared/projectSchema.js'
import { TYPE_LIBRARY } from '../../rigbuild/types/index.js'
import { libraryWithShow } from '../../rigbuild/rental.js'
import { plotModel } from '../../rigbuild/plotModel.js'
import { useHotbar } from '../../rigbuild/useHotbar.js'
import { useEquipment } from '../../rigbuild/useEquipment.js'
import { usePieceAssets } from '../../rigbuild/usePieceAssets.js'
import { InventoryPanel } from '../../rigbuild/Inventory.jsx'
import BuildHotbar from '../../rigbuild/BuildHotbar.jsx'
import { buildEquipmentPath } from '../../rigbuild/equipmentRouting.js'
import { createWalkBuilder } from './walkBuilder.js'
import '../../rigbuild/build.css'
import '../../rigbuild/plot.css'
import './walkBuild.css'

// THE HAND, over the Studio's canvas, while you Walk or Fly (owner, 2026-10-13: "walk mode in
// studio can be the minecraft style one"). It exists only while a walk runs; the public
// viewer never mounts it. Edits go through `applyLocalOps` (useOpHistory) — the Studio's
// one writer — so Ctrl+Z undoes a placement.

function Hand({ spaceId, projectId, document, entities, applyLocalOps, undo, redo, uiHidden }) {
    const library = useMemo(() => libraryWithShow(TYPE_LIBRARY, entities), [entities])
    const model = useMemo(() => {
        const m = plotModel({ entities, library, projectId })
        m.lampById = new Map(m.lamps.map((l) => [l.id, l]))
        return m
    }, [entities, library, projectId])
    const { slots, slotIndex, setSlotIndex, pinToHotbar } = useHotbar({ projectId, entities, library })
    const [inventory, setInventory] = useState(false)
    const [yaw, setYaw] = useState(0)
    const [said, setSaid] = useState('')
    const apply = useCallback((ops, message) => applyLocalOps(ops, message ? { activityMessage: message } : undefined), [applyLocalOps])
    const { ensureAsset, assetIdFor } = usePieceAssets({ projectId, document, applyOps: applyLocalOps })
    const eqApply = useCallback((ops, message) => apply(ops, message), [apply])
    eqApply.assetId = assetIdFor
    const eq = useEquipment({ entities, library, apply: eqApply })

    // The builder reads the latest of everything at the moment of a key, never a stale closure.
    const live = useRef({})
    useEffect(() => { live.current = { slots, slotIndex, model, entities, library, inventory, yaw, undo, redo, apply, ensureAsset } })
    useEffect(() => {
        const L = () => live.current
        // A placement awaits its piece's upload; when that settles after the hand is gone, the hand's own state is
        // gone with it. `apply` stays open: it is the Studio's writer, and the asset a placed piece names must land.
        let alive = true
        const ifAlive = (set) => (value) => { if (alive) set(value) }
        const builder = createWalkBuilder({
            slots: () => L().slots, slotIndex: () => L().slotIndex, model: () => L().model, entities: () => L().entities,
            library: () => L().library, inventoryOpen: () => L().inventory, yaw: () => L().yaw,
            apply: (ops, message) => L().apply(ops, message), say: ifAlive(setSaid), pick: ifAlive(setSlotIndex),
            setInventory: ifAlive((open) => {
                if (open && globalThis.document?.pointerLockElement) globalThis.document.exitPointerLock?.()
                setInventory(open)
            }),
            setYaw: ifAlive(setYaw), undo: () => L().undo(), redo: () => L().redo(), newId: () => generateId('entity'),
            ensureAsset: (kind) => L().ensureAsset(kind)
        })
        const release = setWalkBuilder(builder)
        return () => { alive = false; release() }
    }, [setSlotIndex])

    return (
        <div className={`rigbuild studio-walkbuild${uiHidden ? ' is-ui-hidden' : ''}`} data-testid="studio-walk-build">
            <div className="rigbuild-cross" aria-hidden="true" />
            <section className="rigbuild-hand" data-walk-build="" aria-label="Build hand">
                {said ? <p className="rigbuild-said rigplot-mono">{said}</p> : null}
                <BuildHotbar slots={slots} index={slotIndex} onPick={setSlotIndex} />
            </section>
            {inventory ? (
                <div className="rigbuild-inventory" data-walk-build="">
                    <InventoryPanel
                        eq={eq} library={library}
                        hotbar={{ slots, onPin: (tile, at) => { const words = pinToHotbar(tile, at); if (words) setSaid(words) } }}
                        onClose={() => setInventory(false)}
                        orderHref={`${buildEquipmentPath(spaceId, projectId)}?view=order`}
                        header={<h2 className="rigcards-h">inventory · E</h2>}
                    />
                </div>
            ) : null}
        </div>
    )
}

/** Mounted once in the Studio; draws and listens only while a Walk or Fly runs. */
export default function StudioWalkBuild(props) {
    const mode = useWalkMode()
    if (!mode) return null
    return <Hand {...props} />
}

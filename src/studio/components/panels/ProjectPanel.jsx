import { defaultRenderSettings, defaultWorldState } from '../../../shared/projectSchema.js'
import MoveSettings from '../MoveSettings.jsx'
import { NumberField, MiniRow, SliderField, ColorField, ToggleField, CollapsibleSection } from './fields.jsx'
import { ViewsSection, VisitorChromeSection, LightEnvSection } from './ProjectSections.jsx'

export function ProjectPanel({
    document,
    displayName,
    onDisplayNameChange,
    onProjectMetaPatch,
    onWorldPatch,
    onRenderSettingsPatch,
    onOpenHub,
    views = null,
    lightEnv = null
}) {
    const world = document.worldState || defaultWorldState
    const render = document.renderSettings || defaultRenderSettings

    return (
        <div className="insp-root">
            <div className="insp-header">
                <span className="insp-title">{document.projectMeta?.title || 'Untitled Project'}</span>
                <span className="insp-subtitle">PROJECT</span>
            </div>

            <CollapsibleSection title="Identity">
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-project-display-name">Display name</label>
                    <input id="studio-project-display-name" className="insp-input" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
                </div>
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-project-title">Project title</label>
                    <input id="studio-project-title" className="insp-input" value={document.projectMeta?.title || ''} onChange={(event) => onProjectMetaPatch({ title: event.target.value })} />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Scene">
                <ColorField label="Background" value={world.backgroundColor} onChange={(v) => onWorldPatch({ backgroundColor: v })} />
                <ToggleField label="Atmosphere blend" checked={world.atmosphereBlend === true} onChange={(v) => onWorldPatch({ atmosphereBlend: v })} />
                <ToggleField label="Hub decor (rings + spokes)" checked={world.hubDecor === true} onChange={(v) => onWorldPatch({ hubDecor: v })} />
                <ToggleField label="Grid visible" checked={world.gridVisible !== false} onChange={(v) => onWorldPatch({ gridVisible: v })} />
                <NumberField label="Grid Size" value={world.gridSize} min={1} step={1} onChange={(v) => onWorldPatch({ gridSize: v })} />
                <NumberField label="Cell Size" value={world.gridCellSize} min={0.05} step={0.05} onChange={(v) => onWorldPatch({ gridCellSize: v })} />
                <NumberField label="Cell Thickness" value={world.gridCellThickness} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridCellThickness: v })} />
                <NumberField label="Section Size" value={world.gridSectionSize} min={0.5} step={0.5} onChange={(v) => onWorldPatch({ gridSectionSize: v })} />
                <NumberField label="Section Thickness" value={world.gridSectionThickness} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridSectionThickness: v })} />
                <NumberField label="Fade Distance" value={world.gridFadeDistance} min={0} step={1} onChange={(v) => onWorldPatch({ gridFadeDistance: v })} />
                <NumberField label="Fade Strength" value={world.gridFadeStrength} min={0} step={0.05} onChange={(v) => onWorldPatch({ gridFadeStrength: v })} />
                <ColorField label="Grid cell colour" value={world.gridCellColor} onChange={(v) => onWorldPatch({ gridCellColor: v })} />
                <ColorField label="Grid section colour" value={world.gridSectionColor} onChange={(v) => onWorldPatch({ gridSectionColor: v })} />
            </CollapsibleSection>

            <CollapsibleSection title="Lighting">
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-world-envmap">Environment map (.hdr / .exr)</label>
                    <select
                        id="studio-world-envmap"
                        className="insp-select"
                        value={world.environmentAssetId || ''}
                        onChange={(event) => onWorldPatch({ environmentAssetId: event.target.value || null })}
                    >
                        <option value="">None</option>
                        {(document.assets || []).filter((a) => /\.(hdr|exr)$/i.test(a.name || '')).map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
                {world.environmentAssetId && (
                    <SliderField label="Environment intensity" value={world.environmentIntensity ?? 1} min={0} max={3} step={0.05} onChange={(v) => onWorldPatch({ environmentIntensity: v })} />
                )}
                <ColorField label="Ambient colour" value={world.ambientLight?.color} onChange={(v) => onWorldPatch({ ambientLight: { color: v } })} />
                <SliderField label="Ambient intensity" value={world.ambientLight?.intensity ?? 0.85} min={0} max={2} step={0.05} onChange={(v) => onWorldPatch({ ambientLight: { intensity: v } })} />
                <ColorField label="Sun colour" value={world.directionalLight?.color} onChange={(v) => onWorldPatch({ directionalLight: { color: v } })} />
                <SliderField label="Sun intensity" value={world.directionalLight?.intensity ?? 1.15} min={0} max={3} step={0.05} onChange={(v) => onWorldPatch({ directionalLight: { intensity: v } })} />
                <div className="insp-vec3-group">
                    <span className="insp-label">Sun position</span>
                    <MiniRow fields={[0, 1, 2].map((axisIndex) => ({
                        label: ['X', 'Y', 'Z'][axisIndex],
                        axis: true,
                        value: world.directionalLight?.position?.[axisIndex] ?? [8, 12, 4][axisIndex],
                        min: -50, step: 0.5,
                        onChange: (v) => {
                            const next = [...(world.directionalLight?.position || [8, 12, 4])]
                            next[axisIndex] = v
                            onWorldPatch({ directionalLight: { position: next } })
                        }
                    }))} />
                </div>
            </CollapsibleSection>

            <ViewsSection views={views} />
            <LightEnvSection lightEnv={lightEnv} />
            <VisitorChromeSection views={views} />

            <CollapsibleSection title="Default camera" defaultOpen={false}>
                <NumberField label="FOV" value={world.savedView?.fov ?? 50} min={1} max={170} step={1} onChange={(v) => onWorldPatch({ savedView: { fov: v } })} />
                <NumberField label="Zoom" value={world.savedView?.zoom ?? 1} min={0.01} step={0.1} onChange={(v) => onWorldPatch({ savedView: { zoom: v } })} />
                <NumberField label="Near" value={world.savedView?.near ?? 0.1} min={0.001} step={0.01} onChange={(v) => onWorldPatch({ savedView: { near: v } })} />
                <NumberField label="Far" value={world.savedView?.far ?? 1000} min={0.01} step={10} onChange={(v) => onWorldPatch({ savedView: { far: v } })} />
            </CollapsibleSection>

            {/* How the view moves is the person's own setting on this device, not part of the project (navigation/preference.js). */}
            <CollapsibleSection title="Move">
                <MoveSettings />
            </CollapsibleSection>

            <CollapsibleSection title="Render" defaultOpen={false}>
                <ToggleField label="Shadows" checked={render.shadows !== false} onChange={(v) => onRenderSettingsPatch({ shadows: v })} />
                {/* The switch above allows shadow maps at all and has been on
                    since the schema was written; this one is what actually puts
                    the room in them — the lamps throw, the walls and the scenery
                    catch. Off by default, because a shadow pass over a scanned
                    venue is not free. */}
                <ToggleField
                    label="Lamps throw shadows"
                    checked={render.shadowCasting?.enabled === true}
                    onChange={(v) => onRenderSettingsPatch({ shadowCasting: { enabled: v } })}
                />
                {render.shadowCasting?.enabled === true ? (
                    <div className="insp-field">
                        <label className="insp-label" htmlFor="studio-shadow-detail">Shadow detail</label>
                        <select
                            id="studio-shadow-detail"
                            className="insp-select"
                            value={String(render.shadowCasting?.mapSize ?? 1024)}
                            onChange={(event) => onRenderSettingsPatch({ shadowCasting: { mapSize: Number(event.target.value) } })}
                        >
                            <option value="1024">Softer (1024)</option>
                            <option value="2048">Sharper (2048)</option>
                        </select>
                    </div>
                ) : null}
                <ToggleField label="Antialias" checked={render.antialias !== false} onChange={(v) => onRenderSettingsPatch({ antialias: v })} />
                <div className="insp-field">
                    <label className="insp-label" htmlFor="studio-tone-mapping">Tone mapping</label>
                    <select id="studio-tone-mapping" className="insp-select" value={render.toneMapping || 'ACESFilmic'} onChange={(event) => onRenderSettingsPatch({ toneMapping: event.target.value })}>
                        <option value="ACESFilmic">ACES Filmic</option>
                        <option value="none">None</option>
                    </select>
                </div>
                <SliderField label="Exposure" value={render.toneMappingExposure ?? 1} min={0} max={3} step={0.05} onChange={(v) => onRenderSettingsPatch({ toneMappingExposure: v })} />
                <NumberField label="Min DPR" value={render.dprMin ?? 1} min={0.5} max={4} step={0.25} onChange={(v) => onRenderSettingsPatch({ dprMin: v })} />
                <NumberField label="Max DPR" value={render.dprMax ?? 2} min={0.5} max={4} step={0.25} onChange={(v) => onRenderSettingsPatch({ dprMax: v })} />
            </CollapsibleSection>

            <div className="insp-footer">
                <button
                    className="scc-btn spa-btn-wide"
                    onClick={() => {
                        onWorldPatch(defaultWorldState)
                        onRenderSettingsPatch(defaultRenderSettings)
                    }}
                >
                    Reset world &amp; render settings
                </button>
                <button className="scc-btn spa-btn-wide" style={{ marginTop: 6 }} onClick={onOpenHub}>
                    Back to projects
                </button>
            </div>
        </div>
    )
}

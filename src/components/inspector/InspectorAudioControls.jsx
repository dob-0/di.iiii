import { useId } from 'react'

export default function InspectorAudioControls({
    selectedObject,
    isAudioObject,
    audioUrl,
    previewAudioRef,
    onPreviewPlay,
    onPreviewStop,
    onUpdateProperty
}) {
    const fieldPrefix = useId()
    if (!selectedObject || !isAudioObject) return null

    return (
        <>
            <div className="prop-row-stacked">
                <div className="prop-label">Audio Preview</div>
                {audioUrl ? (
                    // Preview-only audio assets do not have generated caption tracks.
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                        ref={previewAudioRef}
                        controls
                        src={audioUrl}
                        aria-label="Audio preview player"
                        style={{ width: '100%' }}
                        loop={selectedObject.audioLoop ?? true}
                        onPlay={onPreviewPlay}
                        onPause={onPreviewStop}
                        onEnded={onPreviewStop}
                    />
                ) : (
                    <p className="media-variant-hint">No playable audio available.</p>
                )}
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-autoplay`}>Autoplay</label>
                <button
                    id={`${fieldPrefix}-autoplay`}
                    className="toggle-button-small"
                    aria-label="Toggle audio autoplay"
                    aria-pressed={Boolean(selectedObject.audioAutoplay)}
                    onClick={() => onUpdateProperty('audioAutoplay', !selectedObject.audioAutoplay)}
                >
                    {selectedObject.audioAutoplay ? 'On' : 'Off'}
                </button>
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-loop`}>Loop</label>
                <button
                    id={`${fieldPrefix}-loop`}
                    className="toggle-button-small"
                    aria-label="Toggle audio loop"
                    aria-pressed={Boolean(selectedObject.audioLoop)}
                    onClick={() => onUpdateProperty('audioLoop', !selectedObject.audioLoop)}
                >
                    {selectedObject.audioLoop ? 'On' : 'Off'}
                </button>
            </div>
            <div className="prop-row">
                <label htmlFor={`${fieldPrefix}-distance`}>Distance</label>
                <input
                    id={`${fieldPrefix}-distance`}
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={Number.isFinite(selectedObject.audioDistance) ? selectedObject.audioDistance : 8}
                    onChange={(e) => onUpdateProperty('audioDistance', Number(e.target.value))}
                />
            </div>
        </>
    )
}

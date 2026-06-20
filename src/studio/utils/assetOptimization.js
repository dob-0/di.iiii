export const LARGE_GLB_THRESHOLD_BYTES = 10 * 1024 * 1024

export const shouldSuggestGlbOptimization = (file) => {
    const name = String(file?.name || '')
    return (
        name.toLowerCase().endsWith('.glb') &&
        !name.toLowerCase().endsWith('.optimized.glb') &&
        Number(file?.size || 0) >= LARGE_GLB_THRESHOLD_BYTES
    )
}

export const formatAssetSize = (bytes) => {
    const value = Number(bytes || 0)
    if (value < 1024 * 1024) return `${Math.max(0, Math.round(value / 1024))} KB`
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export const optimizeGlbAsset = async (file) => {
    const sourceBuffer = await file.arrayBuffer()
    const worker = new Worker(new URL('./optimizeGlbAsset.worker.js', import.meta.url), {
        type: 'module'
    })

    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            worker.terminate()
            reject(
                new Error('Model optimization timed out. You can still upload the original file.')
            )
        }, 120_000)
        const finish = () => {
            window.clearTimeout(timeout)
            worker.terminate()
        }
        worker.onmessage = ({ data }) => {
            finish()
            if (!data?.ok) {
                reject(new Error(data?.error || 'Model optimization failed.'))
                return
            }
            const name = file.name.replace(/\.glb$/i, '.optimized.glb')
            resolve(
                new File([data.buffer], name, {
                    type: 'model/gltf-binary',
                    lastModified: Date.now()
                })
            )
        }
        worker.onerror = (event) => {
            finish()
            reject(new Error(event.message || 'Model optimization worker failed.'))
        }
        worker.postMessage({ buffer: sourceBuffer }, [sourceBuffer])
    })
}

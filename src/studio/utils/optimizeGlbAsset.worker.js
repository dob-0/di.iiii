import { WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions'
import { dedup, prune, quantize, weld } from '@gltf-transform/functions'

const MAX_TEXTURE_SIZE = 2048
const WEBP_QUALITY = 0.9

const optimizeTextures = async (document) => {
    let converted = false
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage()
        const mimeType = texture.getMimeType()
        if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) continue

        const bitmap = await createImageBitmap(new Blob([image], { type: mimeType }))
        const scale = Math.min(1, MAX_TEXTURE_SIZE / bitmap.width, MAX_TEXTURE_SIZE / bitmap.height)
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        context.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        const output = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
        texture.setImage(new Uint8Array(await output.arrayBuffer())).setMimeType('image/webp')
        converted = true
    }

    if (converted) document.createExtension(EXTTextureWebP).setRequired(true)
}

self.onmessage = async ({ data }) => {
    try {
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS)
        const document = await io.readBinary(new Uint8Array(data.buffer))

        await optimizeTextures(document)
        await document.transform(dedup(), weld(), prune(), quantize())

        const optimized = await io.writeBinary(document)
        self.postMessage({ ok: true, buffer: optimized.buffer }, [optimized.buffer])
    } catch (error) {
        self.postMessage({
            ok: false,
            error: error instanceof Error ? error.message : 'Model optimization failed.'
        })
    }
}

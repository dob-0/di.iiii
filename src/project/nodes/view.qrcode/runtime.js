// QR Code: the address phones should open, drawn as a picture wire (the
// webcam Frame's kind) for a plane, an Image panel or Picture Out.
//
// Text left empty encodes this tier's own address — a page's diiPageOrigin,
// else the window's origin — read on every pass, so a project moved to
// another tier draws that tier's code instead of a dead one. A wired Text
// (a Link, a String) wins, like every other port.
//
// The texture is kept per node and only remade when the text or the level
// changes: a wire that hands a new texture every frame would re-upload it
// every frame, and a plane keyed on the texture's uuid would remount.
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three'
import { encodeQr, normaliseLevel, rasterQr } from './qrCode.js'

const pictures = new Map()

export const pageAddress = () => {
    const pageOrigin = typeof globalThis.diiPageOrigin === 'string' ? globalThis.diiPageOrigin : ''
    return pageOrigin || globalThis.location?.origin || ''
}

const drop = (nodeId) => {
    pictures.get(nodeId)?.texture?.dispose?.()
    pictures.delete(nodeId)
}

export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'picture') return undefined
    const wired = input('text')
    const text = (typeof wired === 'string' ? wired : String(wired ?? '')).trim() || pageAddress()
    const level = normaliseLevel(input('level'))
    const key = `${level}\n${text}`
    const kept = pictures.get(node.id)
    if (kept?.key === key) return kept.texture
    drop(node.id)
    const picture = rasterQr(encodeQr(text, level), { bottomUp: true })
    if (!picture) return null
    const texture = new DataTexture(picture.data, picture.width, picture.height, RGBAFormat, UnsignedByteType)
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace = SRGBColorSpace
    texture.name = 'QR Code'
    texture.userData.qr = { text, level }
    texture.needsUpdate = true
    pictures.set(node.id, { key, texture })
    return texture
}

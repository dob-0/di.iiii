// PLAY runs on a copy (design di-studio-games-design.md §4.3: "play runs on a copy of the play state, never the saved document").
// Established practice: Unity's Play Mode reverts every change made in it (docs.unity3d.com/Manual/howto-playmode.html);
// Roblox Studio's Play tests a separate copy of the place on a test server (create.roblox.com/docs/studio/testing-modes).
// Here the copy is taken once, when Play starts, and handed to the walk. The editor keeps its own document untouched,
// so Stop has nothing to revert: the walk's copy is dropped.

/** A deep copy of the project document for one play. Pure data, so structuredClone; JSON as the fallback for old engines. */
export const makePlayCopy = (document) => {
    if (document == null) return null
    try {
        return structuredClone(document)
    } catch {
        return JSON.parse(JSON.stringify(document))
    }
}

const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
}

/** A short fingerprint of a document (key order does not matter): cyrb53, 53 bits, not a security hash. For "unchanged" checks. */
export const documentFingerprint = (document) => {
    const text = stable(document)
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let i = 0; i < text.length; i += 1) {
        const ch = text.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

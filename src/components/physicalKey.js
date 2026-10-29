// A key by where it sits on the keyboard, not by what it types.
//
// `event.key` is the letter the layout makes: on an Armenian or Russian layout the key in W's place types 'ց' or 'ц', so a
// walk that read `key` never moved for them. `event.code` is the physical place ('KeyW'), the same on every layout; Unity,
// Unreal, Roblox Studio and Blender read keys that way too (docs/ai/keys.md). A synthetic event with no `code` falls back
// to `key`, so the old tests and any caller that sends only `key` keep working.
//
// Returns the lower-case token the walk has always used: 'w', ' ', 'arrowup', 'escape'; or '' for no event.

/**
 * @param {{ code?: string, key?: string } | null | undefined} event
 * @returns {string}
 */
export const physicalKey = (event) => {
    if (!event) return ''
    const code = typeof event.code === 'string' ? event.code : ''
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
    if (code === 'Space') return ' '
    if (/^Arrow(Up|Down|Left|Right)$/.test(code)) return code.toLowerCase()
    return typeof event.key === 'string' ? event.key.toLowerCase() : ''
}

/**
 * The letter of a shortcut (Ctrl / Cmd + Z): what the layout types, as the browser's own shortcuts do. On a German layout the key that
 * types 'z' sits at code KeyY and still undoes. A layout with no Latin letter (Armenian, Russian) falls back to the key's place.
 * @param {{ code?: string, key?: string } | null | undefined} event
 * @returns {string}
 */
export const shortcutLetter = (event) => (event && typeof event.key === 'string' && /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : physicalKey(event))

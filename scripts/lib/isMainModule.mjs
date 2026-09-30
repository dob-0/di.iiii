// isMainModule — "was this file started directly (node file.mjs), not imported?"
//
// The old guard compared process.argv[1] with the URL pathname of import.meta.url.
// On Windows that pathname is `/C:/Users/...`, never equal to `C:\Users\...`, so
// the guard was false and the script silently did nothing. fileURLToPath() is the
// documented conversion (Node docs, url.fileURLToPath). Both sides are realpath'd
// so a symlinked bin still matches.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function real(p) {
    try { return fs.realpathSync(p) } catch { return p }
}

export function isMainModule(importMetaUrl, argv1 = process.argv[1]) {
    if (!argv1) return false
    try {
        return real(fileURLToPath(importMetaUrl)) === real(path.resolve(argv1))
    } catch {
        return false
    }
}

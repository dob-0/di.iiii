// The fixture-type libraries for a node script (the browser imports
// src/rigbuild/types/index.js; node reads the same JSON files).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'rigbuild', 'types')

export const loadLibrary = () => ({
    types: fs.readdirSync(TYPES_DIR).filter((f) => f.endsWith('.json')).sort()
        .flatMap((f) => JSON.parse(fs.readFileSync(path.join(TYPES_DIR, f), 'utf8')).types)
})

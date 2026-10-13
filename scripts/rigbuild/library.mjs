// The fixture library for a node script (the browser imports src/rigbuild/types/index.js; node
// reads the same files): src/rigbuild/types/library/, in its index's order.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LIBRARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'rigbuild', 'types', 'library')

const read = (file) => JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, file), 'utf8'))

export const loadLibrary = () => {
    const index = read('index.json')
    return { library: index.library, howToRead: index.howToRead, generatedFrom: index.generatedFrom, types: index.types.map((t) => read(`${t.id}.json`)) }
}

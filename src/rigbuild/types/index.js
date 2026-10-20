// The WHOLE fixture library: di.iiii's one shared library (src/rigbuild/types/library/, one
// generated file per type — scripts/rigbuild/types.mjs; the rule for adding a type: its README).
// For the Studio's work tools, which offer every type (the hotbar, the plot, the cards).
import index from './library/index.json'

const files = import.meta.glob(['./library/*.json', '!./library/index.json'], { eager: true, import: 'default' })

export const TYPE_LIBRARY = {
    library: index.library,
    howToRead: index.howToRead,
    generatedFrom: index.generatedFrom,
    types: index.types.map((t) => files[`./library/${t.id}.json`])
}

export default TYPE_LIBRARY

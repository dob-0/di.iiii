// Every fixture-type library the app knows, merged. Generated libraries only
// (scripts/rigbuild/types.mjs); a type id is unique across them.
import moxir from './moxir.json'

export const TYPE_LIBRARY = { types: [...moxir.types] }

export default TYPE_LIBRARY

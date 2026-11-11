// The picture sources a Surface can show: Picture Out nodes and VJ Decks.
// One builder for the Projection desk and Perform's Surface settings.
export function buildPictureOutOptions(doc) {
    return (doc?.nodes || [])
        .filter((node) => node.typeId === 'top.out' || node.typeId === 'vj.deck')
        .map((node) => ({ id: node.id, label: node.typeId === 'vj.deck' ? `VJ Deck — ${node.label || node.id}` : (node.label || 'Picture Out') }))
}

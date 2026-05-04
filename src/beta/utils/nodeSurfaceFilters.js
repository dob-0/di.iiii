export const matchesNodeTypeSurface = (type, surface = 'world') => {
    if (!type) return false
    if (surface === 'graph') return true
    if (surface === 'view') return type.render === 'panel-2d'
    if (surface === 'world') return type.render === 'spatial-3d' || type.category === 'world'
    return true
}

export const filterNodeTypesForSurface = (types = [], surface = 'world') =>
    types.filter((type) => matchesNodeTypeSurface(type, surface))

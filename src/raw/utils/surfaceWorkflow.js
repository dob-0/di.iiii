export const getSurfaceWorkflow = (surface = 'graph') => {
    switch (surface) {
        case 'world':
            return {
                title: 'Room builds the 3D place',
                description: 'Place objects and tune the shared room controls. Use Graph when you want values to drive them.',
                actionLabel: 'Place Node',
                surfaceLabel: 'Scene'
            }
        case 'view':
            return {
                title: 'View builds the interface',
                description: 'Create text, image, and browser panels here. Use Graph to feed content and properties into them.',
                actionLabel: 'Place Node',
                surfaceLabel: 'View'
            }
        case 'graph':
        default:
            return {
                title: 'Graph connects everything',
                description: 'Create sources and math nodes here, then wire them into Room and View nodes.',
                actionLabel: 'Place Node',
                surfaceLabel: 'Graph'
            }
    }
}

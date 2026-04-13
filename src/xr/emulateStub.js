export const emulate = () => {
    if (import.meta?.env?.DEV) {
        console.warn('XR emulator disabled: using stub implementation.')
    }
    return null
}

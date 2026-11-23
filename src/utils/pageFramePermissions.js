// Permissions Policy `allow` list for a code page's iframe (Presentation / Studio / public viewer).
// A page the owner opts into `deviceAccess` also gets Web MIDI (a music page driving a
// controller such as the Akai APC40). Without the opt-in the list is unchanged.
// Docs: https://developer.chrome.com/docs/privacy-security/permissions-policy (iframe `allow`
// attribute, `midi` feature) and https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Permissions-Policy/midi
export const PAGE_ALLOW = 'camera; microphone; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer'

export function pageAllow(deviceAccess) {
    return deviceAccess ? `${PAGE_ALLOW}; midi` : PAGE_ALLOW
}

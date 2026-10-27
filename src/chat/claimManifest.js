// A chat page's install card, put in place of the site's while the page is open.
//
// src/index.html links di.iiii's own /manifest.webmanifest on every route. A
// browser reads the FIRST <link rel="manifest"> in the document, so a chat page
// that only appended /chat-app/'s would be installed as the platform, with the
// platform's start_url and scope, and the Android app's trust check
// (android-twa/, start_url /chat) would point at a manifest that is not it.
// So the chat's link goes in, the others come out, and they go back on leave.
export const claimManifest = (href, doc = document) => {
    const others = [...doc.head.querySelectorAll('link[rel="manifest"]')]
    others.forEach((link) => link.remove())
    const link = doc.createElement('link')
    link.rel = 'manifest'
    link.href = href
    doc.head.appendChild(link)
    return () => {
        link.remove()
        others.forEach((other) => doc.head.appendChild(other))
    }
}

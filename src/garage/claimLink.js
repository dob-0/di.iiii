import { CONTACT, SELLERS_SHORT } from './content.js'

export const formatPrice = (price) => (
    typeof price === 'number' ? `€${price}` : String(price || '')
)

export const claimMessage = (item) => (
    `Hi ${SELLERS_SHORT} — is "${item.title}" (${formatPrice(item.price)}) still available?`
)

/**
 * Where the "take it" button goes.
 *
 * WhatsApp when there is a number, email otherwise. Returning null when there
 * is neither is deliberate: the button then renders as plain text instead of a
 * dead link, so a missing config looks unfinished rather than broken.
 */
export const claimHref = (item, contact = CONTACT) => {
    const message = claimMessage(item)
    const digits = String(contact.whatsapp || '').replace(/\D/g, '')

    if (digits) {
        return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    }
    if (contact.email) {
        const subject = encodeURIComponent(`Garage sale: ${item.title}`)
        return `mailto:${contact.email}?subject=${subject}&body=${encodeURIComponent(message)}`
    }
    return null
}

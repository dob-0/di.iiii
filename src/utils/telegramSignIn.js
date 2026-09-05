// Sign in with Telegram is not an OAuth hop, so it gets no getOAuthUrl().
// The bot is the only party that can assert a Telegram id, so the bot mints the
// single-use link and sends it into the chat; this button's whole job is to open
// the bot with the payload it answers as /login.
//
// /api/auth/providers reports `telegram: true` but only carries `telegramBot`
// when TELEGRAM_BOT_USERNAME is set — without a username there is no address to
// send anyone to, so the button stays away rather than pointing at nothing.
export const telegramSignInUrl = (providers) => {
    const bot = String(providers?.telegramBot || '').trim().replace(/^@/, '')
    if (!providers?.telegram || !/^[A-Za-z0-9_]{3,64}$/.test(bot)) return null
    return `https://t.me/${bot}?start=login`
}

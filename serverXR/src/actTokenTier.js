// How far a di.bo act token reaches, by tier. The owner, 2026-10-07: "make me
// root, Emilya admin, and make the right privileges."
//
// The tier is decided HERE, by di.iiii, from server env — never by di.bo — and
// it can only take reach away from the account, never add it:
//
//   root    ACT_TOKEN_ROOT_TELEGRAM_IDS   the account's own reach (the owner)
//   admin   ACT_TOKEN_ADMIN_TELEGRAM_IDS  the account's own reach, minus the
//                                         platform settings (actTokenGate.js,
//                                         REFUSED_BELOW_ROOT)
//   member  everyone else, and the default when the env is unset: role capped
//           at editor and no unrestricted reach — their own and scoped spaces
//           only, even if the account itself is an admin; the same refusals as
//           admin
//
// Every tier also meets the common refusals (REFUSED_THROUGH_DI_BO): accounts,
// keys, integrations, DMs, approvals, invite redeem, ownership.
//
// Read on every request from the token's Telegram id, so changing the env
// takes effect without re-minting.

const TIERS = Object.freeze(['member', 'admin', 'root'])

const parseTelegramIds = (raw) => new Set(
  String(raw || '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s))
)

const tierFor = (telegramId, { rootIds = new Set(), adminIds = new Set() } = {}) => {
  const id = String(telegramId || '')
  if (id && rootIds.has(id)) return 'root'
  if (id && adminIds.has(id)) return 'admin'
  return 'member'
}

// The account's role and reach after the tier has had its say. Only ever
// lowers: a member's admin account acts as an editor of its own spaces.
const capForTier = (tier, { role, isUnrestricted }) => {
  if (tier === 'root' || tier === 'admin') return { role, isUnrestricted: Boolean(isUnrestricted) }
  return { role: role === 'admin' ? 'editor' : role, isUnrestricted: false }
}

module.exports = { TIERS, parseTelegramIds, tierFor, capForTier }

/**
 * Who is allowed inside the Trade Exchange (the /auctions route and everything
 * nested under it — the auction browser, auction rooms, and the trade service
 * areas as they come online).
 *
 * The Trade Exchange is a trade-only room: bidding has always been restricted
 * to verified dealers, and buyers/sellers previously got a read-only showcase
 * view of the stock. That showcase is gone — a retail buyer seeing trade prices
 * on cars they cannot bid on was leaking the dealers' cost base to their own
 * customers, which is the one thing a trade room exists to prevent.
 *
 * ADMIN is included alongside DEALER because admins operate this room — they
 * approve auction listings, resolve disputes and cancel bids, and none of that
 * is possible from behind a "dealers only" wall. If the intent is ever to lock
 * staff out too, remove 'ADMIN' here and every gate follows.
 */
export const TRADE_EXCHANGE_ROLES: readonly string[] = ['DEALER', 'ADMIN']

/** True only for roles allowed into the Trade Exchange. Unknown/absent role = denied. */
export function canAccessTradeExchange(role?: string | null): boolean {
    return !!role && TRADE_EXCHANGE_ROLES.includes(role)
}

/**
 * The role check plus the one it was missing: an approved KYC.
 *
 * Role DEALER on its own is self-serve — a buyer can switch their own account
 * over from the profile page and land in the dealer dashboard in limited mode.
 * That is the intended onboarding path, but it must not hand them the trade
 * stock, so every surface that shows live trade prices checks this and not
 * `canAccessTradeExchange` alone.
 *
 * ADMIN passes without a dealer profile — staff operate the room.
 *
 * Client-side this is presentation only; /auctions/active and
 * /auctions/scheduled enforce the same rule in VerifiedDealerGuard, which reads
 * isVerified from the database rather than from anything the browser sends.
 */
export function canAccessTradeStock(profile?: {
    role?: string | null
    dealerProfile?: { isVerified?: boolean } | null
} | null): boolean {
    if (!profile?.role) return false
    if (profile.role === 'ADMIN') return true
    return profile.role === 'DEALER' && profile.dealerProfile?.isVerified === true
}

/**
 * True for a dealer who has not finished KYC. These accounts get a "finish your
 * verification" prompt rather than the signup or wrong-role panels — they have
 * the right account and an unfinished application, and telling them to sign up
 * again would be nonsense.
 */
export function isUnverifiedDealer(profile?: {
    role?: string | null
    dealerProfile?: { isVerified?: boolean } | null
} | null): boolean {
    return profile?.role === 'DEALER' && profile?.dealerProfile?.isVerified !== true
}

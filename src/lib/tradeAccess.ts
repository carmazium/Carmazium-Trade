/**
 * Who is allowed inside the Trade Exchange (the /auctions route and everything
 * nested under it — auction rooms, part exchange, duty/job listings).
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

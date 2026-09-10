/**
 * Presents listings created by an admin as CarMazium's own, rather than under
 * the individual staff member's personal name.
 *
 * WHY: admins can list at any tier without a listing fee, but public listings
 * still need to present as CarMazium rather than an individual staff account. Nothing was changing who the listing
 * appeared to be FROM. An ADMIN account is not a DEALER, so the seller block
 * fell through to `${firstName} ${lastName}` and rendered the staff member's
 * real name, badged "Verified Seller" — indistinguishable from a private
 * individual, and publishing an employee's name to every buyer.
 *
 * WHY HERE AND NOT IN THE UI: seller identity is rendered in a dozen places —
 * the detail page twice, listing cards, auction pages, chat, won-auctions —
 * and the mobile app renders it again from the same API. Branding at the API
 * boundary means every one of those is correct without knowing anything about
 * admins, and mobile gets it for free. Threading an `isAdminListing` condition
 * through each render site is the pattern that produced the seller-contact leak
 * and the CORS drift elsewhere in this codebase.
 *
 * The account's real identity is not destroyed, only its public presentation:
 * `id` and `role` are untouched, so ownership, permissions, messaging and the
 * admin's own dashboard all continue to work against the real account.
 */
export const CARMAZIUM_SELLER_NAME = 'CarMazium';

type BrandableSeller = {
    role?: string | null;
    firstName?: string | null;
    lastName?: string | null;
} | null | undefined;

export function brandAdminSeller<T extends BrandableSeller>(seller: T): T {
    if (!seller || seller.role !== 'ADMIN') return seller;

    return {
        ...seller,
        firstName: CARMAZIUM_SELLER_NAME,
        lastName: '',
        // Lets the UI show a first-party badge instead of the generic
        // "Verified Seller" tick, without needing another backend change or
        // having to infer it from the role (which callers shouldn't rely on).
        isOfficial: true,
    };
}

/** Applies the branding to a listing's nested seller, if present. */
export function brandListingSeller<T extends { seller?: BrandableSeller } | null | undefined>(listing: T): T {
    if (!listing || !listing.seller) return listing;
    return { ...listing, seller: brandAdminSeller(listing.seller) };
}

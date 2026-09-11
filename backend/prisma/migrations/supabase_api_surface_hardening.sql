-- CarMazium Supabase API surface hardening
-- Applied after the Nest/Prisma backend became the authoritative mutation path.
--
-- Goals:
--   * public users cannot promote their own public.users.role;
--   * retail/anonymous accounts cannot inspect trade auctions or bid history;
--   * no browser can bypass KYC/bid validation by inserting bids directly;
--   * no browser can bypass the £125 auction fee by creating chat rooms directly;
--   * retail listings remain publicly readable;
--   * verified dealers, sellers and admins retain read access to the trade data
--     they legitimately need if a legacy Supabase client still performs reads.
--
-- Supabase Storage policies are deliberately out of scope and untouched.

BEGIN;

-- ── USERS: backend-only mutations ────────────────────────────────────────────
DROP POLICY IF EXISTS users_self_update ON public.users;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM anon, authenticated;
-- Keep SELECT + users_self_select so a legacy client can still read its own row.

-- ── AUCTIONS: trade-only reads, backend-only writes ─────────────────────────
DROP POLICY IF EXISTS auctions_public_read ON public.auctions;
DROP POLICY IF EXISTS auctions_seller_write ON public.auctions;
DROP POLICY IF EXISTS auctions_trade_read ON public.auctions;

CREATE POLICY auctions_trade_read
ON public.auctions
FOR SELECT
TO authenticated
USING (
    "deletedAt" IS NULL
    AND (
        EXISTS (
            SELECT 1
            FROM public.listings l
            WHERE l.id = auctions."listingId"
              AND l."sellerId" = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = auth.uid()::text
              AND u.role = 'ADMIN'::public.user_role
              AND u."deletedAt" IS NULL
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.users u
                WHERE u.id = auth.uid()::text
                  AND u.role = 'DEALER'::public.user_role
                  AND u."deletedAt" IS NULL
            )
            AND EXISTS (
                SELECT 1
                FROM public.dealer_profiles dp
                WHERE dp."userId" = auth.uid()::text
                  AND dp."isVerified" = true
            )
        )
    )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.auctions FROM anon, authenticated;
REVOKE SELECT ON TABLE public.auctions FROM anon;
GRANT SELECT ON TABLE public.auctions TO authenticated;

-- ── BIDS: no direct bid placement; trade-only history ───────────────────────
DROP POLICY IF EXISTS bids_public_read ON public.bids;
DROP POLICY IF EXISTS bids_insert_self ON public.bids;
DROP POLICY IF EXISTS bids_update_self ON public.bids;
DROP POLICY IF EXISTS bids_trade_read ON public.bids;

CREATE POLICY bids_trade_read
ON public.bids
FOR SELECT
TO authenticated
USING (
    "deletedAt" IS NULL
    AND (
        "bidderId" = auth.uid()::text
        OR EXISTS (
            SELECT 1
            FROM public.listings l
            WHERE l.id = bids."listingId"
              AND l."sellerId" = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = auth.uid()::text
              AND u.role = 'ADMIN'::public.user_role
              AND u."deletedAt" IS NULL
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.users u
                WHERE u.id = auth.uid()::text
                  AND u.role = 'DEALER'::public.user_role
                  AND u."deletedAt" IS NULL
            )
            AND EXISTS (
                SELECT 1
                FROM public.dealer_profiles dp
                WHERE dp."userId" = auth.uid()::text
                  AND dp."isVerified" = true
            )
        )
    )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.bids FROM anon, authenticated;
REVOKE SELECT ON TABLE public.bids FROM anon;
GRANT SELECT ON TABLE public.bids TO authenticated;

-- ── LISTINGS: public retail reads; trade auction reads only for eligible users
DROP POLICY IF EXISTS listings_public_read ON public.listings;
DROP POLICY IF EXISTS listings_public_retail_read ON public.listings;
DROP POLICY IF EXISTS listings_trade_read ON public.listings;
DROP POLICY IF EXISTS listings_owner_insert ON public.listings;
DROP POLICY IF EXISTS listings_owner_update ON public.listings;
DROP POLICY IF EXISTS listings_owner_delete ON public.listings;

CREATE POLICY listings_public_retail_read
ON public.listings
FOR SELECT
TO anon, authenticated
USING (
    "deletedAt" IS NULL
    AND type = 'CLASSIFIED'::public.listing_type
    AND status = ANY (ARRAY[
        'ACTIVE'::public.listing_status,
        'SOLD'::public.listing_status,
        'OFFER_ACCEPTED'::public.listing_status
    ])
);

CREATE POLICY listings_trade_read
ON public.listings
FOR SELECT
TO authenticated
USING (
    "deletedAt" IS NULL
    AND type = 'AUCTION'::public.listing_type
    AND (
        "sellerId" = auth.uid()::text
        OR EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = auth.uid()::text
              AND u.role = 'ADMIN'::public.user_role
              AND u."deletedAt" IS NULL
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.users u
                WHERE u.id = auth.uid()::text
                  AND u.role = 'DEALER'::public.user_role
                  AND u."deletedAt" IS NULL
            )
            AND EXISTS (
                SELECT 1
                FROM public.dealer_profiles dp
                WHERE dp."userId" = auth.uid()::text
                  AND dp."isVerified" = true
            )
        )
    )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.listings FROM anon, authenticated;
-- SELECT grants remain because the two policies above provide the intended read surface.
GRANT SELECT ON TABLE public.listings TO anon, authenticated;

-- ── CHAT: backend/Socket.IO only so the £125 auction fee gate cannot be bypassed
DROP POLICY IF EXISTS chat_party_insert ON public.chat_rooms;
DROP POLICY IF EXISTS chat_party_read ON public.chat_rooms;
DROP POLICY IF EXISTS chat_party_update ON public.chat_rooms;
DROP POLICY IF EXISTS messages_mark_read ON public.messages;
DROP POLICY IF EXISTS messages_party_read ON public.messages;
DROP POLICY IF EXISTS messages_send ON public.messages;

REVOKE ALL PRIVILEGES ON TABLE public.chat_rooms FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.messages FROM anon, authenticated;

COMMIT;

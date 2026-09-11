from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8-sig")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:180]!r}")
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Auth role trust boundary: only safe self-service roles may come from clients.
# ---------------------------------------------------------------------------
Path("backend/src/auth/self-service-role.ts").write_text(
'''import { UserRole } from '@prisma/client';

/**
 * Account modes a signed-in user may choose for themselves. These roles do not
 * grant privileged platform administration. DEALER still requires approved KYC
 * before trade access; CONTRACTOR still requires an approved capability plus
 * completed Stripe Connect onboarding before paid work.
 */
export const SELF_SERVICE_ROLES: readonly UserRole[] = [
    UserRole.BUYER,
    UserRole.SELLER,
    UserRole.DEALER,
    UserRole.CONTRACTOR,
];

export function isSelfServiceRole(value: unknown): value is UserRole {
    return typeof value === 'string' && (SELF_SERVICE_ROLES as readonly string[]).includes(value);
}
''', encoding="utf-8")

replace_once(
    "backend/src/auth/dto/register.dto.ts",
    "import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';\nimport { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';\n",
    "import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';\nimport { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';\nimport { UserRole } from '@prisma/client';\nimport { SELF_SERVICE_ROLES } from '../self-service-role';\n",
)
replace_once(
    "backend/src/auth/dto/register.dto.ts",
    "    @ApiPropertyOptional({ enum: ['BUYER', 'SELLER', 'ADMIN'], default: 'BUYER' })\n    @IsOptional()\n    @IsEnum(['BUYER', 'SELLER', 'ADMIN'])\n    role?: 'BUYER' | 'SELLER' | 'ADMIN';",
    "    @ApiPropertyOptional({ enum: SELF_SERVICE_ROLES, default: UserRole.BUYER })\n    @IsOptional()\n    @IsIn([...SELF_SERVICE_ROLES])\n    role?: UserRole;",
)

# AuthService: reject banned local-login accounts, never authorize from
# user_metadata.role, and expose a token-only identity verifier for /users/sync.
replace_once(
    "backend/src/auth/auth.service.ts",
    "    Logger,\n} from '@nestjs/common';",
    "    Logger,\n    ForbiddenException,\n} from '@nestjs/common';",
)
replace_once(
    "backend/src/auth/auth.service.ts",
    "import { UserRole } from '@prisma/client';\n",
    "import { UserRole } from '@prisma/client';\nimport { isSelfServiceRole } from './self-service-role';\n",
)
replace_once(
    "backend/src/auth/auth.service.ts",
    "        // Hash the password\n        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);\n\n        // Create the user",
    "        // Hash the password\n        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);\n\n        // Never accept privileged roles from a public registration payload. DTO\n        // validation is the first gate; this service-level check prevents a future\n        // controller or internal caller from bypassing that boundary.\n        const requestedRole = dto.role ?? UserRole.BUYER;\n        if (!isSelfServiceRole(requestedRole)) {\n            throw new ForbiddenException('That account type cannot be self-registered.');\n        }\n\n        // Create the user",
)
replace_once(
    "backend/src/auth/auth.service.ts",
    "                role: dto.role || UserRole.BUYER,",
    "                role: requestedRole,",
)
replace_once(
    "backend/src/auth/auth.service.ts",
    "        if (!user || !user.passwordHash) {",
    "        if (!user || user.deletedAt || !user.passwordHash) {",
)

anchor = '''    /**
     * Verify a Supabase access token and return the local DB user.
     * Used by the auth bridge to create backend sessions from Supabase JWTs.
     */
    async verifySupabaseToken(token: string) {'''
replacement = '''    /**
     * Verify the Supabase token itself and return only the trusted identity.
     * This intentionally does not create/update a local user and never reads a
     * role from user_metadata. It is used by /users/sync so the client cannot
     * spoof another UUID/email or elevate itself through editable metadata.
     */
    async getVerifiedSupabaseIdentity(token: string): Promise<{ id: string; email: string } | null> {
        if (!token?.trim()) return null;
        try {
            const { data, error } = await this.supabase.auth.getUser(token);
            if (error || !data.user?.email) return null;
            return {
                id: data.user.id,
                email: data.user.email.toLowerCase().trim(),
            };
        } catch (err: any) {
            this.logger.warn(`Supabase identity verification failed: ${err?.message || err}`);
            return null;
        }
    }

    /**
     * Verify a Supabase access token and return the local DB user.
     * Used by the auth bridge to create backend sessions from Supabase JWTs.
     */
    async verifySupabaseToken(token: string) {'''
replace_once("backend/src/auth/auth.service.ts", anchor, replacement)

old_role_block = '''                    // Only treat role as explicitly set when it's actually in Supabase metadata.
                    // For OAuth providers (Google, etc.) meta.role is undefined — we must NOT
                    // overwrite a role that /users/sync already set correctly (e.g. DEALER).
                    const metaRole =
                        meta?.role && Object.values(UserRole).includes(meta.role as UserRole)
                            ? (meta.role as UserRole)
                            : undefined;
                    const createRole = metaRole ?? UserRole.BUYER;
                    // Resolve name across our signup metadata AND Google/Apple OAuth keys'''
new_role_block = '''                    // user_metadata is user-editable in Supabase and therefore can
                    // never grant a CarMazium role. Names are presentation/profile
                    // fields and are safe to hydrate; authorization stays in our DB.
                    const createRole = UserRole.BUYER;
                    // Resolve name across our signup metadata AND Google/Apple OAuth keys'''
replace_once("backend/src/auth/auth.service.ts", old_role_block, new_role_block)
replace_once(
    "backend/src/auth/auth.service.ts",
    "                                // Only overwrite role if explicitly present in Supabase metadata —\n                                // avoids stomping over a role set by /users/sync for OAuth users.\n                                ...(resolvedFirst && { firstName: resolvedFirst }),\n                                ...(resolvedLast && { lastName: resolvedLast }),\n                                ...(metaRole && { role: metaRole }),",
    "                                // Role is deliberately absent: editable Supabase metadata\n                                // is never an authorization source.\n                                ...(resolvedFirst && { firstName: resolvedFirst }),\n                                ...(resolvedLast && { lastName: resolvedLast }),",
)

# UsersService: use the same role allowlist and preserve privileged existing roles.
replace_once(
    "backend/src/users/users.service.ts",
    "import { UserRole } from '@prisma/client';\n",
    "import { UserRole } from '@prisma/client';\nimport { SELF_SERVICE_ROLES, isSelfServiceRole } from '../auth/self-service-role';\n",
)
old_self_service = '''    /**
     * Self-service roles are safe account modes only. Privileged roles remain
     * absent from the allowlist. CONTRACTOR still requires an admin-approved
     * capability and completed Stripe Connect before any paid work is possible.
     */
    private static readonly SELF_SERVICE_ROLES: readonly UserRole[] = [
        UserRole.BUYER,
        UserRole.SELLER,
        UserRole.DEALER,
        UserRole.CONTRACTOR,
    ];

'''
replace_once("backend/src/users/users.service.ts", old_self_service, "")
replace_once(
    "backend/src/users/users.service.ts",
    "        if (!UsersService.SELF_SERVICE_ROLES.includes(newRole)) {",
    "        if (!isSelfServiceRole(newRole)) {",
)
old_sync = '''    async syncUser(data: {
        id?: string;
        supabaseAuthId?: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: UserRole;
    }) {
        const email = data.email.toLowerCase().trim();
        const userId = data.id ?? data.supabaseAuthId;
        const role = data.role && Object.values(UserRole).includes(data.role) ? data.role : undefined;
        const userExists = await this.prisma.user.findUnique({ where: { email } });
        const user = await this.prisma.user.upsert({
            where: { email },
            update: {
                ...(data.firstName && { firstName: data.firstName }),
                ...(data.lastName && { lastName: data.lastName }),
                ...(role !== undefined && { role }),
            },
            create: {
                ...(userId && { id: userId }),
                email,
                firstName: data.firstName,
                lastName: data.lastName,
                ...(role !== undefined && { role }),
                passwordHash: 'SUPABASE_EXTERNAL_AUTH',
            },
        });
        if (!userExists) this.emailService.sendWelcomeEmail(user.email, user.firstName || undefined, user.role).catch(console.error);
        return { user, isNewUser: !userExists };
    }'''
new_sync = '''    async syncUser(data: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: unknown;
    }) {
        const email = data.email.toLowerCase().trim();
        const requestedRole = isSelfServiceRole(data.role) ? data.role : undefined;
        const userExists = await this.prisma.user.findUnique({ where: { email } });

        // Existing privileged accounts (ADMIN/partners) may never be demoted or
        // altered by the public sync path. Existing self-service accounts may
        // switch only among the same safe set. New accounts default to BUYER.
        const mayUpdateRole = !!requestedRole && (!userExists || isSelfServiceRole(userExists.role));
        const createRole = requestedRole ?? UserRole.BUYER;

        const user = await this.prisma.user.upsert({
            where: { email },
            update: {
                ...(data.firstName && { firstName: data.firstName }),
                ...(data.lastName && { lastName: data.lastName }),
                ...(mayUpdateRole && { role: requestedRole }),
            },
            create: {
                id: data.id,
                email,
                firstName: data.firstName,
                lastName: data.lastName,
                role: createRole,
                passwordHash: 'SUPABASE_EXTERNAL_AUTH',
            },
        });
        if (!userExists) this.emailService.sendWelcomeEmail(user.email, user.firstName || undefined, user.role).catch(console.error);
        return { user, isNewUser: !userExists };
    }'''
replace_once("backend/src/users/users.service.ts", old_sync, new_sync)
# Keep the import used in documentation/type contexts out of lint noise if compiler flags change.
replace_once(
    "backend/src/users/users.service.ts",
    "import { SELF_SERVICE_ROLES, isSelfServiceRole } from '../auth/self-service-role';",
    "import { isSelfServiceRole } from '../auth/self-service-role';",
)

# /users/sync now authenticates the supplied Supabase bearer token and derives
# id/email from Supabase rather than from an untrusted request body.
replace_once(
    "backend/src/users/users.controller.ts",
    "    BadRequestException,\n} from '@nestjs/common';",
    "    BadRequestException,\n    UnauthorizedException,\n} from '@nestjs/common';",
)
replace_once(
    "backend/src/users/users.controller.ts",
    "import { UserRole } from '@prisma/client';\n",
    "import { UserRole } from '@prisma/client';\nimport { AuthService } from '../auth/auth.service';\n",
)
replace_once(
    "backend/src/users/users.controller.ts",
    "    constructor(private readonly usersService: UsersService) { }",
    "    constructor(\n        private readonly usersService: UsersService,\n        private readonly authService: AuthService,\n    ) { }",
)
old_controller_sync = '''    @Post('sync')
    @ApiOperation({ summary: 'Sync user from Supabase' })
    async sync(@Body() body: any) {
        if (!body.email) {
            throw new BadRequestException('Email is required for sync');
        }

        const { user, isNewUser } = await this.usersService.syncUser(body);
        return {
            success: true,
            data: user,
            // Drives the one-time signup conversion on the frontend — see
            // src/app/auth/callback/page.tsx. Deliberately outside `data` so
            // the existing user-shaped payload is untouched.
            isNewUser,
        };
    }'''
new_controller_sync = '''    @Post('sync')
    @ApiOperation({ summary: 'Sync the authenticated Supabase identity into the local user database' })
    async sync(@Body() body: any, @Req() req: Request) {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) throw new UnauthorizedException('Supabase bearer token is required for sync');

        const identity = await this.authService.getVerifiedSupabaseIdentity(token);
        if (!identity) throw new UnauthorizedException('Invalid or expired Supabase token');

        const { user, isNewUser } = await this.usersService.syncUser({
            id: identity.id,
            email: identity.email,
            firstName: body?.firstName,
            lastName: body?.lastName,
            role: body?.role,
        });
        return {
            success: true,
            data: user,
            // Drives the one-time signup conversion on the frontend — see
            // src/app/auth/callback/page.tsx. Deliberately outside `data` so
            // the existing user-shaped payload is untouched.
            isNewUser,
        };
    }'''
replace_once("backend/src/users/users.controller.ts", old_controller_sync, new_controller_sync)

replace_once(
    "src/app/auth/callback/page.tsx",
    '''        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          role: meta.role || roleOverride,
        }),''',
    '''        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          // This is only a requested self-service account mode. The backend
          // clamps it to BUYER/SELLER/DEALER/CONTRACTOR and never accepts a
          // privileged role from client metadata.
          role: roleOverride || meta.role,
        }),''',
)

# ---------------------------------------------------------------------------
# Auction trade access / chat / relist lifecycle.
# ---------------------------------------------------------------------------
replace_once(
    "backend/src/bids/bids.controller.ts",
    "    @UseGuards(SessionAuthGuard)\n    @ApiCookieAuth()\n    @HttpCode(HttpStatus.CREATED)\n    @ApiOperation({ summary: 'Place a bid on an auction listing' })",
    "    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)\n    @ApiCookieAuth()\n    @HttpCode(HttpStatus.CREATED)\n    @ApiOperation({ summary: 'Place a bid on an auction listing (verified dealers only)' })",
)
replace_once(
    "backend/src/auctions/auctions.controller.ts",
    "    @Post(':id/bin-trigger')\n    @UseGuards(SessionAuthGuard)",
    "    @Post(':id/bin-trigger')\n    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)",
)

# Verified admin winner assignment as well as normal bids.
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "        const dealer = await this.prisma.user.findUnique({ where: { id: dealerId } });",
    "        const dealer = await this.prisma.user.findUnique({\n            where: { id: dealerId },\n            include: { dealerProfile: { select: { isVerified: true } } },\n        });",
)
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "        if (dealer.role !== 'DEALER') {\n            throw new BadRequestException('Only dealer accounts can be assigned as an auction winner');\n        }",
    "        if (dealer.role !== 'DEALER' || !dealer.dealerProfile?.isVerified) {\n            throw new BadRequestException('Only verified dealer accounts can be assigned as an auction winner');\n        }",
)

# Winner notification and chat: no contact before the £125 fee, no pre-created
# room that becomes an accidental side channel.
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                message: `You won the auction for ${vehicle} with a bid of £${winningAmount.toLocaleString()}. Contact the seller to arrange collection.`,",
    "                message: `You won the auction for ${vehicle} with a bid of £${winningAmount.toLocaleString()}. Pay the £125 buyer fee within 72 hours to unlock the seller's protected contact details and auction chat, then arrange inspection and collection.`,",
)
old_chat_create = '''            // Auto-create chat room between winner and seller
            if (listing.sellerId && listing.sellerId !== winnerId) {
                await this.prisma.chatRoom.upsert({
                    where: {
                        initiatorId_participantId: {
                            initiatorId: winnerId,
                            participantId: listing.sellerId,
                        },
                    },
                    create: {
                        initiatorId: winnerId,
                        participantId: listing.sellerId,
                        listingId: auction.listingId,
                    },
                    update: { listingId: auction.listingId },
                });
            }

'''
replace_once(
    "backend/src/auctions/auctions.service.ts",
    old_chat_create,
    "            // Do not create an auction chat room here. The winning dealer has\n            // not paid the £125 buyer fee yet. ChatService creates/returns the\n            // seller-winner room on demand only after buyerFeePaid is true.\n\n",
)

# No-reserve and unpaid-winner paths return the AUCTION listing to DRAFT. This
# retains its HPI relation for a genuine auction relist and does not publish a
# phantom ACTIVE listing with no active auction.
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                        status: 'DRAFT',\n                        type: 'CLASSIFIED', // Reset type so seller can list it for retail\n                        linkedListingId: null, // Clear link so seller can re-auction",
    "                        status: 'DRAFT',\n                        type: 'AUCTION', // Keep the same auction listing so its HPI can be reused on re-auction\n                        linkedListingId: null, // Clear link so seller can re-auction",
)
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                this.prisma.listing.update({\n                    where: { id: listing.id },\n                    data: { status: 'ACTIVE' },\n                }),",
    "                this.prisma.listing.update({\n                    where: { id: listing.id },\n                    data: { status: 'DRAFT', type: 'AUCTION' },\n                }),",
)
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                    this.prisma.sellerProfile.update({\n                        where: { userId: listing.sellerId },\n                        data: { totalSales: { decrement: 1 } },\n                    }),",
    "                    this.prisma.sellerProfile.updateMany({\n                        where: { userId: listing.sellerId, totalSales: { gt: 0 } },\n                        data: { totalSales: { decrement: 1 } },\n                    }),",
)
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                message: `You didn't pay the £125 buyer fee for \"${listing.title}\" in time, so the win was cancelled and the listing is back on the market.`,",
    "                message: `You didn't pay the £125 buyer fee for \"${listing.title}\" in time, so the win was cancelled. The seller can now update and relist the auction.`,",
)
replace_once(
    "backend/src/auctions/auctions.service.ts",
    "                    title: 'Auction sale fell through — relisted',\n                    message: `The winning buyer for \"${listing.title}\" didn't pay the buyer fee in time, so the sale was cancelled and your listing is active again.`,",
    "                    title: 'Auction sale fell through — ready to relist',\n                    message: `The winning buyer for \"${listing.title}\" didn't pay the buyer fee in time. The sale was cancelled and the auction listing is back in draft so you can update the current notes and relist it; its existing HPI report is retained.`,",
)

# Existing auction listings may be re-auctioned with their HPI, but they may not
# be mutated into retail listings and carry that old report across channels.
replace_once(
    "backend/src/listings/listings.service.ts",
    "        if (updateListingDto.listingType) {\n            updateData.type = updateListingDto.listingType === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED';\n        }",
    "        if (updateListingDto.listingType) {\n            const targetType = updateListingDto.listingType === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED';\n            if (listing.type === 'AUCTION' && targetType === 'CLASSIFIED') {\n                throw new BadRequestException(\n                    'Retail requires a new listing and a fresh HPI/history report. Create a new Retail Listing instead of converting this Auction listing.',\n                );\n            }\n            updateData.type = targetType;\n        }",
)

# When editing a listing that already owns an HPI relation (notably an auction
# being relisted), don't ask the seller to buy the same report again.
replace_once(
    "src/components/listing/ListingWizard.tsx",
    "                // Jump straight to step 1 (already pre-filled)\n                setSellingMethod('list')",
    "                if (l.hpiReport?.status) setIsHpiUnlocked(true)\n\n                // Jump straight to step 1 (already pre-filled)\n                setSellingMethod('list')",
)
replace_once(
    "src/components/listing/ListingWizard.tsx",
    "                                 let listingId = draftListingId\n                                 if (!listingId) {",
    "                                 let listingId = draftListingId || editId\n                                 if (editId && !draftListingId) {\n                                     setDraftListingId(editId)\n                                     localStorage.setItem('carmazium_hpi_draft_id', editId)\n                                 }\n                                 if (!listingId) {",
)

# A fresh linked retail listing must acquire its own fresh HPI before its listing
# fee can be paid. Route it through the normal edit/HPI wizard instead of direct checkout.
replace_once(
    "src/app/dashboard/seller/auctions/page.tsx",
    "import { getStripeConnectStatus, alsoListRetail, createListingCheckout, type StripeConnectStatus, type Listing } from \"@/lib/listingApi\"",
    "import { getStripeConnectStatus, alsoListRetail, type StripeConnectStatus, type Listing } from \"@/lib/listingApi\"",
)
replace_once(
    "src/app/dashboard/seller/auctions/page.tsx",
    "            const { linkedListingId } = await alsoListRetail(alsoRetailAuction.listingId, parseFloat(alsoRetailPrice), alsoRetailTier)\n            const { url } = await createListingCheckout(linkedListingId, alsoRetailTier)\n            window.location.href = url",
    "            const { linkedListingId } = await alsoListRetail(alsoRetailAuction.listingId, parseFloat(alsoRetailPrice), alsoRetailTier)\n            // Retail is a distinct listing and must have a fresh HPI. The normal\n            // edit wizard handles that mandatory request before the £1/upgrade fee.\n            window.location.href = `/sell?editId=${encodeURIComponent(linkedListingId)}`",
)
replace_once(
    "src/app/dashboard/seller/auctions/page.tsx",
    '''            const endedAuctionListingIds = new Set(
                (freshAuctions ?? [])
                    .filter(a => a.status === "ENDED")
                    .map(a => a.listingId)
            )''',
    '''            const relistableAuctionListingIds = new Set(
                (freshAuctions ?? [])
                    .filter(a => a.status === "ENDED" || a.status === "CANCELLED")
                    .map(a => a.listingId)
            )''',
)
replace_once(
    "src/app/dashboard/seller/auctions/page.tsx",
    "(l.status === \"ACTIVE\" || (l.status === \"DRAFT\" && endedAuctionListingIds.has(l.id)))",
    "(l.status === \"ACTIVE\" || (l.status === \"DRAFT\" && relistableAuctionListingIds.has(l.id)))",
)

# Server-side listing checkout ownership + mandatory HPI gate. This also makes it
# impossible to bypass the UI and pay a retail listing fee before the fresh HPI exists.
replace_once(
    "backend/src/payments/payments.service.ts",
    "        const stripe = await this.getStripe();\n        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));\n        const amount = this.LISTING_FEES[badgeTier];",
    "        const listing = await this.prisma.listing.findUnique({\n            where: { id: listingId },\n            select: { sellerId: true, type: true, deletedAt: true, hpiReport: { select: { id: true } } },\n        });\n        if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found');\n        if (listing.sellerId !== userId) throw new ForbiddenException('You do not own this listing.');\n        if (listing.type !== 'CLASSIFIED') throw new BadRequestException('Auction listings are free and do not use retail listing checkout.');\n        if (!listing.hpiReport) throw new BadRequestException('A fresh HPI/history report is required before paying the Retail Listing fee.');\n\n        const stripe = await this.getStripe();\n        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));\n        const amount = this.LISTING_FEES[badgeTier];",
)

# Linked auction is a new Listing row but may reuse the already-current report
# from the source retail vehicle. Clone paid report content into the auction row
# and make the auction pass admin review before appearing to dealers.
replace_once(
    "backend/src/listings/listings.service.ts",
    "        if ((source as any).linkedListingId) throw new BadRequestException('This listing already has a linked auction listing');\n        if (dto.reservePrice > Number(source.price)) {",
    "        if ((source as any).linkedListingId) throw new BadRequestException('This listing already has a linked auction listing');\n        const sourceHpi = await this.prisma.hpiReport.findUnique({ where: { listingId } });\n        if (!sourceHpi) throw new BadRequestException('The Retail Listing must have its HPI/history report before it can also be listed at Auction.');\n        if (dto.reservePrice > Number(source.price)) {",
)
replace_once(
    "backend/src/listings/listings.service.ts",
    "                type: 'AUCTION',\n                status: 'ACTIVE',",
    "                type: 'AUCTION',\n                status: 'PENDING_REVIEW',",
)
replace_once(
    "backend/src/listings/listings.service.ts",
    "        const auction = await this.prisma.auction.create({",
    "        await this.prisma.hpiReport.create({\n            data: {\n                listingId: auctionListing.id,\n                vrm: sourceHpi.vrm,\n                data: sourceHpi.data ?? undefined,\n                isClear: sourceHpi.isClear,\n                purchasedAt: sourceHpi.purchasedAt,\n                transactionId: null,\n                status: sourceHpi.status,\n                source: sourceHpi.source,\n                reportData: sourceHpi.reportData ?? undefined,\n                pdfData: sourceHpi.pdfData ?? undefined,\n                pdfFileName: sourceHpi.pdfFileName,\n                pdfSizeBytes: sourceHpi.pdfSizeBytes,\n                pdfUploadedAt: sourceHpi.pdfUploadedAt,\n                preparedById: sourceHpi.preparedById,\n                preparedAt: sourceHpi.preparedAt,\n                reminderSentAt: sourceHpi.reminderSentAt,\n            },\n        });\n\n        const auction = await this.prisma.auction.create({",
)

# ---------------------------------------------------------------------------
# Explicit genuine failed-sale refund. Proof rejection stays separate/no refund.
# ---------------------------------------------------------------------------
admin_anchor = "    async getAllTransactions(page = 1, limit = 20) {"
admin_method = '''    /**
     * Explicit admin action for a genuinely failed/cancelled auction sale.
     * This is intentionally separate from denyHandover(): unclear evidence is
     * resubmitted and never triggers a buyer refund.
     */
    async refundFailedAuctionSale(auctionId: string, reason: string) {
        const cleanedReason = reason?.trim();
        if (!cleanedReason || cleanedReason.length < 5) {
            throw new BadRequestException('A clear failed-sale reason is required.');
        }

        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: { select: { id: true, title: true, sellerId: true, linkedListingId: true } },
                winner: { select: { id: true, email: true, firstName: true } },
            },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        if (auction.status !== 'ENDED' || !auction.winnerId) {
            throw new BadRequestException('Only an ended auction with a confirmed winner can be cancelled as a failed sale.');
        }
        if (!auction.buyerFeePaid || !auction.buyerFeeTransactionId) {
            throw new BadRequestException('No paid £125 auction buyer fee exists to partially refund.');
        }
        if (auction.sellerBonusReleased || auction.stripePayoutTransferId || auction.manualPayoutConfirmedAt) {
            throw new BadRequestException('This sale cannot be cancelled after the seller bonus has been released or paid.');
        }

        const formerWinnerId = auction.winnerId;
        const sellerId = auction.listing.sellerId;

        // Stripe first: the payment method is idempotent and refunds exactly
        // £100, retaining the £25 platform fee. Only mutate sale state after it succeeds.
        await this.paymentsService.issueRefundForAuction(auctionId, 'FAILED_SALE');

        await this.prisma.$transaction(async (tx) => {
            await tx.auction.update({
                where: { id: auctionId },
                data: {
                    status: 'CANCELLED',
                    winnerId: null,
                    winningBidAmount: null,
                    wonAt: null,
                    buyerFeePaid: false,
                    buyerFeeTransactionId: null,
                    handoverProofUrl: null,
                    handoverSubmittedAt: null,
                },
            });
            await tx.listing.update({
                where: { id: auction.listing.id },
                data: { status: 'DRAFT', type: 'AUCTION' },
            });
            await tx.sale.deleteMany({
                where: { listingId: auction.listing.id, buyerId: formerWinnerId },
            });
            if (sellerId) {
                await tx.sellerProfile.updateMany({
                    where: { userId: sellerId, totalSales: { gt: 0 } },
                    data: { totalSales: { decrement: 1 } },
                });
            }
            // A separate linked Retail Listing was auto-closed when the Auction
            // was won. The vehicle never actually sold, so restore that same
            // listing rather than creating a new retail relist. It keeps its own
            // HPI relation; the Auction listing keeps the auction HPI.
            if (auction.listing.linkedListingId) {
                await tx.listing.updateMany({
                    where: { id: auction.listing.linkedListingId, deletedAt: null, status: 'SOLD', type: 'CLASSIFIED' },
                    data: { status: 'ACTIVE' },
                });
            }
        });

        await this.notificationsService.create({
            userId: formerWinnerId,
            type: 'SYSTEM',
            title: 'Auction sale cancelled — £100 refunded',
            message: `The sale for "${auction.listing.title}" was cancelled. £100 of your £125 auction buyer fee has been refunded; the £25 platform fee is retained under the auction terms.`,
            entityType: 'AUCTION',
            entityId: auctionId,
            link: '/dashboard/dealer/auctions/won',
            data: { failedSaleReason: cleanedReason },
        }).catch(() => {});

        if (sellerId) {
            await this.notificationsService.create({
                userId: sellerId,
                type: 'SYSTEM',
                title: 'Auction sale cancelled — ready to relist',
                message: `The failed sale for "${auction.listing.title}" was cancelled. The Auction listing is back in draft with its existing HPI retained; update the current vehicle notes before relisting.`,
                entityType: 'AUCTION',
                entityId: auctionId,
                link: '/dashboard/seller/auctions',
                data: { failedSaleReason: cleanedReason },
            }).catch(() => {});
        }

        const refund = await this.prisma.transaction.findFirst({
            where: {
                listingId: auction.listing.id,
                userId: formerWinnerId,
                type: 'REFUND',
                status: 'COMPLETED',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, amount: true, stripePaymentId: true, createdAt: true },
        });

        return {
            auctionId,
            reason: cleanedReason,
            status: 'CANCELLED' as const,
            listingStatus: 'DRAFT' as const,
            refundedAmount: 100,
            nonRefundableAmount: 25,
            refund,
        };
    }

'''
replace_once("backend/src/admin/admin.service.ts", admin_anchor, admin_method + admin_anchor)

controller_anchor = "    // ── Handovers ─────────────────────────────────────────────────────────────\n"
controller_method = '''    @Post('auctions/:id/refund-failed-sale')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a genuine failed auction sale, refund £100 of the £125 buyer fee, and retain the £25 platform fee' })
    @ApiParam({ name: 'id', description: 'Auction UUID' })
    async refundFailedAuctionSale(
        @Param('id') id: string,
        @Body('reason') reason: string,
    ): Promise<StandardResponse<any>> {
        const result = await this.adminService.refundFailedAuctionSale(id, reason);
        return new StandardResponse(result);
    }

'''
replace_once("backend/src/admin/admin.controller.ts", controller_anchor, controller_method + controller_anchor)

# Fix the admin confirmation copy to match actual linked-retail restoration.
replace_once(
    "src/components/dashboard/FailedSaleRefundButton.tsx",
    "£100 of the buyer's £125 auction fee will be refunded. The £25 platform fee remains non-refundable. The auction and linked listing will return to draft and the recorded sale will be reversed.",
    "£100 of the buyer's £125 auction fee will be refunded. The £25 platform fee remains non-refundable. The auction will return to draft, any linked retail listing auto-closed by this auction will be restored, and the recorded auction sale will be reversed.",
)

# ---------------------------------------------------------------------------
# Security regression tests.
# ---------------------------------------------------------------------------
Path("backend/src/auth/auth-security.spec.ts").write_text(
'''import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@prisma/client';
import { isSelfServiceRole } from './self-service-role';
import { UsersService } from '../users/users.service';

describe('authorization trust boundaries', () => {
    it('accepts only non-privileged self-service roles', () => {
        expect(isSelfServiceRole(UserRole.BUYER)).toBe(true);
        expect(isSelfServiceRole(UserRole.SELLER)).toBe(true);
        expect(isSelfServiceRole(UserRole.DEALER)).toBe(true);
        expect(isSelfServiceRole(UserRole.CONTRACTOR)).toBe(true);
        expect(isSelfServiceRole(UserRole.ADMIN)).toBe(false);
        expect(isSelfServiceRole(UserRole.FINANCE_PARTNER)).toBe(false);
        expect(isSelfServiceRole(UserRole.INSURANCE_PARTNER)).toBe(false);
    });

    it('rejects ADMIN in the public registration DTO', async () => {
        const dto = Object.assign(new RegisterDto(), {
            email: 'attacker@example.com',
            password: 'SecurePass123',
            role: UserRole.ADMIN,
        });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'role')).toBe(true);
    });

    it('defaults a malicious privileged sync-role request to BUYER for a new user', async () => {
        const upsert = jest.fn(async (args: any) => ({ id: args.create.id, ...args.create }));
        const prisma = {
            user: {
                findUnique: jest.fn().mockResolvedValue(null),
                upsert,
            },
        } as any;
        const email = { sendWelcomeEmail: jest.fn().mockResolvedValue(null) } as any;
        const service = new UsersService(prisma, email, {} as any);

        await service.syncUser({
            id: '11111111-1111-4111-8111-111111111111',
            email: 'new@example.com',
            role: UserRole.ADMIN,
        });

        expect(upsert.mock.calls[0][0].create.role).toBe(UserRole.BUYER);
    });

    it('preserves an existing privileged role during public sync', async () => {
        const existing = {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            firstName: 'Admin',
        };
        const upsert = jest.fn(async (args: any) => ({ ...existing, ...args.update }));
        const prisma = {
            user: {
                findUnique: jest.fn().mockResolvedValue(existing),
                upsert,
            },
        } as any;
        const service = new UsersService(prisma, { sendWelcomeEmail: jest.fn() } as any, {} as any);

        await service.syncUser({
            id: existing.id,
            email: existing.email,
            role: UserRole.BUYER,
        });

        expect(upsert.mock.calls[0][0].update.role).toBeUndefined();
    });
});
''', encoding="utf-8")

print("90-95 production hardening patch applied")

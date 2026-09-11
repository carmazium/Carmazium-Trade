import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    forwardRef,
    Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { AuctionGateway, AuctionEndPayload } from './auction.gateway';
import { EmailService } from '../email/email.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { UpdateAuctionDigestDto } from './dto/update-auction-digest.dto';
import { Auction } from '@prisma/client';

const AUCTION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const ANTI_SNIPE_MINUTES = 3;
// Grace window a declared winner has to pay the £125 buyer fee before the win
// auto-reverts — see UnpaidAuctionFeeExpiryService.
const BUYER_FEE_GRACE_MS = 72 * 60 * 60 * 1000; // 72 hours

@Injectable()
export class AuctionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsGateway: NotificationsGateway,
        private readonly notificationsService: NotificationsService,
        @Inject(forwardRef(() => AuctionGateway))
        private readonly auctionGateway: AuctionGateway,
        private readonly emailService: EmailService,
    ) { }

    async create(createAuctionDto: CreateAuctionDto, userId: string): Promise<Auction> {
        const now = new Date();
        const startTime = new Date(createAuctionDto.startTime);

        // Allow immediate start (startTime in the past or very near future is treated as 'now')
        // Only reject if startTime is more than 1 minute in the past (clock skew tolerance)
        if (startTime.getTime() < now.getTime() - 60 * 1000) {
            throw new BadRequestException('Start time cannot be in the past');
        }

        // Compute endTime server-side — always startTime + 24 hours
        const endTime = new Date(startTime.getTime() + AUCTION_DURATION_MS);

        const listing = await this.prisma.listing.findUnique({
            where: { id: createAuctionDto.listingId },
        });

        if (!listing || listing.deletedAt) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this listing');
        }

        if (listing.status === 'SOLD') {
            throw new BadRequestException('This listing has already been sold');
        }

        // The opening/starting bid must be meaningfully below the asking price
        // (at least 30% lower) so the auction has room to actually run — otherwise
        // the very first bid could already meet or exceed retail.
        const maxStartingBid = Number(listing.price) * 0.7;
        if (createAuctionDto.startingBid > maxStartingBid) {
            throw new BadRequestException(
                `Starting bid must be at least 30% below the asking price of £${Number(listing.price).toLocaleString()} (max £${maxStartingBid.toLocaleString(undefined, { maximumFractionDigits: 2 })})`,
            );
        }

        const existing = await this.prisma.auction.findUnique({
            where: { listingId: createAuctionDto.listingId },
        });

        // Block only if a live (SCHEDULED or ACTIVE) auction already exists
        if (existing && !existing.deletedAt && existing.status !== 'ENDED' && existing.status !== 'CANCELLED') {
            throw new BadRequestException('An auction already exists for this listing');
        }

        // Scheduling an auction is itself a submission that needs a fresh admin
        // pass — whether this is a brand-new listing or an already-ACTIVE retail
        // listing the seller is now also putting up for auction, and regardless
        // of instant vs. scheduled start time. Force the listing back to
        // PENDING_REVIEW (unless it's already there) so it lands in the same
        // admin/listings review queue as everything else, clearing any stale
        // rejection reason from a previous pass.
        const listingUpdateData: Record<string, unknown> = {};
        if (listing.type !== 'AUCTION') listingUpdateData.type = 'AUCTION';
        const needsReview = listing.status !== 'PENDING_REVIEW';
        if (needsReview) {
            listingUpdateData.status = 'PENDING_REVIEW';
            listingUpdateData.rejectionReason = null;
        }
        if (Object.keys(listingUpdateData).length > 0) {
            await this.prisma.listing.update({
                where: { id: createAuctionDto.listingId },
                data: listingUpdateData,
            });
        }
        if (needsReview) {
            this.notifyAuctionSubmittedForReview(listing.id, listing.title, listing.sellerId).catch(() => { });
        }

        // Re-use the existing row (listingId is @unique — can't insert a second row)
        if (existing) {
            return this.prisma.auction.update({
                where: { id: existing.id },
                data: {
                    startTime,
                    endTime,
                    reservePrice: createAuctionDto.reservePrice,
                    startingBid: createAuctionDto.startingBid,
                    minIncrement: createAuctionDto.minIncrement,
                    buyItNowPrice: createAuctionDto.buyItNowPrice ?? null,
                    status: 'SCHEDULED',
                    deletedAt: null,
                    winnerId: null,
                    winningBidAmount: null,
                    buyerFeePaid: false,
                    buyerFeeTransactionId: null,
                    handoverProofUrl: null,
                    handoverSubmittedAt: null,
                    sellerBonusReleased: false,
                    sellerBonusReleasedAt: null,
                    buyItNowPendingBuyerId: null,
                    buyItNowPendingAt: null,
                },
            });
        }

        return this.prisma.auction.create({
            data: {
                listingId: createAuctionDto.listingId,
                startTime,
                endTime,
                reservePrice: createAuctionDto.reservePrice,
                startingBid: createAuctionDto.startingBid,
                minIncrement: createAuctionDto.minIncrement,
                buyItNowPrice: createAuctionDto.buyItNowPrice ?? null,
                status: 'SCHEDULED',
            },
        });
    }

    private async notifyAuctionSubmittedForReview(listingId: string, listingTitle: string, sellerId: string | null): Promise<void> {
        if (!sellerId) return;
        const notification = await this.notificationsService.create({
            userId: sellerId,
            type: 'LISTING_SUBMITTED',
            title: 'Auction Submitted for Review',
            message: `"${listingTitle}" has been submitted and is awaiting admin review before the auction goes live.`,
            link: '/dashboard/seller/auctions',
            entityType: 'Listing',
            entityId: listingId,
            actionType: 'SUBMITTED',
        }).catch(() => null);
        if (notification) {
            this.notificationsGateway.sendNotification(sellerId, notification);
        }
    }

    async findAllActive(): Promise<any[]> {
        return this.prisma.auction.findMany({
            // listing.status filter is defense-in-depth — the activation cron
            // already only flips SCHEDULED -> ACTIVE for approved listings.
            where: { status: 'ACTIVE', deletedAt: null, listing: { status: 'ACTIVE' } },
            include: {
                listing: {
                    include: {
                        seller: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                dealerProfile: { select: { companyName: true, logo: true } },
                                sellerProfile: { select: { reliabilityScore: true } },
                            },
                        },
                        bids: {
                            where: { deletedAt: null, cancelledAt: null },
                            orderBy: { amount: 'desc' },
                            take: 1,
                            select: { amount: true },
                        },
                        _count: { select: { bids: true } },
                    },
                },
            },
            orderBy: { endTime: 'asc' },
        });
    }

    async findAllScheduled(page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
        const skip = (page - 1) * limit;
        // Only surface auctions whose listing has cleared admin review — a
        // SCHEDULED auction still sitting on a PENDING_REVIEW/REJECTED listing
        // isn't approved yet and shouldn't show in the public "Upcoming" tab.
        const where = { status: 'SCHEDULED' as const, deletedAt: null, listing: { status: 'ACTIVE' as const } };
        const [data, total] = await Promise.all([
            this.prisma.auction.findMany({
                where,
                include: {
                    listing: {
                        include: {
                            seller: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    dealerProfile: { select: { companyName: true, logo: true } },
                                    sellerProfile: { select: { reliabilityScore: true } },
                                },
                            },
                            _count: { select: { bids: true } },
                        },
                    },
                },
                orderBy: { startTime: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.auction.count({ where }),
        ]);
        return { data, total };
    }

    /**
     * `viewerId` is only present when the caller is authenticated (via
     * OptionalSessionAuthGuard). Unlike ListingsService.findBySlug (a "log in
     * to view" gate), every seller contact detail here — phone, email,
     * business address, website — is withheld from the response payload
     * until the viewer has won this specific auction AND paid the buyer fee;
     * only an `*Available` boolean is sent otherwise, for the frontend to
     * render a locked/blurred placeholder.
     */
    async findOne(id: string, viewerId?: string): Promise<any> {
        const auction = await this.prisma.auction.findUnique({
            where: { id },
            include: {
                listing: {
                    include: {
                        seller: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                phone: true,
                                dealerProfile: { select: { companyName: true, logo: true, businessAddress: true, website: true, phone: true } },
                            },
                        },
                        bids: {
                            where: { deletedAt: null, cancelledAt: null },
                            orderBy: { amount: 'desc' },
                            take: 50,
                            include: {
                                bidder: { select: { id: true, firstName: true, lastName: true } },
                            },
                        },
                        // Bidders should be able to see the report before they bid,
                        // not just after winning — same "inspect before bidding"
                        // principle as the damage/condition viewer already gives
                        // every listing. Not contact-gated: an HPI report isn't
                        // personal data the way the seller's phone/email is.
                        hpiReport: { select: { status: true, isClear: true } },
                    },
                },
                winner: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        if (!auction || auction.deletedAt) {
            throw new NotFoundException(`Auction not found`);
        }

        const seller = auction.listing?.seller as any;
        if (seller) {
            const canSeeContactDetails = !!viewerId && viewerId === auction.winnerId && !!auction.buyerFeePaid;
            (auction.listing as any).seller = this.gateSellerContactDetails(seller, canSeeContactDetails);
        }

        return this.clearExpiredBin(auction);
    }

    async findMyAuctions(userId: string, page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
        const skip = (page - 1) * limit;
        const where = { deletedAt: null, listing: { sellerId: userId } };
        const [data, total] = await Promise.all([
            this.prisma.auction.findMany({
                where,
                include: {
                    listing: {
                        include: {
                            bids: {
                                where: { deletedAt: null, cancelledAt: null },
                                orderBy: { amount: 'desc' },
                                take: 1,
                                select: { amount: true },
                            },
                            _count: { select: { bids: true } },
                            linkedListing: { select: { id: true, status: true, badgeTier: true } },
                        },
                    },
                    winner: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.auction.count({ where }),
        ]);
        return { data, total };
    }

    /**
     * Strips every seller contact detail unless the viewer has earned them.
     *
     * "Earned" means: they won this specific auction AND paid the £125 buyer
     * fee. Logging in is not enough, and neither is merely winning — the fee
     * is what unlocks contact, and this is the only thing enforcing that.
     *
     * Shared by findOne() and findWonAuctions() deliberately. They used to
     * gate separately and drifted: the list view only ever nulled `phone`, so
     * a winner who hadn't paid still received the seller's EMAIL (plus the
     * dealer's business address and website) in the API response, and the
     * won-auctions page rendered the email straight onto the "Pay the £125
     * fee to unlock messaging" card. Any new route that returns a seller must
     * call this rather than hand-rolling the check again.
     *
     * The `*Available` booleans exist so the UI can show a locked-state
     * affordance ("this seller has a phone number") without leaking the value.
     */
    private gateSellerContactDetails(seller: any, canSeeContactDetails: boolean) {
        if (!seller) return seller;
        return {
            ...seller,
            phone: canSeeContactDetails ? seller.phone : null,
            phoneAvailable: !!seller.phone,
            email: canSeeContactDetails ? seller.email : null,
            emailAvailable: !!seller.email,
            ...(seller.dealerProfile ? {
                dealerProfile: {
                    ...seller.dealerProfile,
                    phone: canSeeContactDetails ? seller.dealerProfile.phone : null,
                    phoneAvailable: !!seller.dealerProfile.phone,
                    businessAddress: canSeeContactDetails ? seller.dealerProfile.businessAddress : null,
                    businessAddressAvailable: !!seller.dealerProfile.businessAddress,
                    website: canSeeContactDetails ? seller.dealerProfile.website : null,
                    websiteAvailable: !!seller.dealerProfile.website,
                },
            } : {}),
        };
    }

    // Auctions the current user WON as a bidder — distinct from findMyAuctions
    // above, which is scoped to auctions the user SOLD. Mobile's Auctions tab
    // previously only ever showed the seller-side list; won-auction purchases
    // were only discoverable via the separate, generic Purchases screen (Sale
    // records, no auction-specific fields). Added for mobile-production-
    // readiness-plan.md F43. Includes `listing.seller` (unlike findMyAuctions,
    // which has no reason to — the buyer needs to know who to contact).
    async findWonAuctions(userId: string, page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
        const skip = (page - 1) * limit;
        const where = { deletedAt: null, winnerId: userId };
        const [data, total] = await Promise.all([
            this.prisma.auction.findMany({
                where,
                include: {
                    listing: {
                        include: {
                            bids: {
                                where: { deletedAt: null, cancelledAt: null },
                                orderBy: { amount: 'desc' },
                                take: 1,
                                select: { amount: true },
                            },
                            _count: { select: { bids: true } },
                            // Winner-only query (where: winnerId = the requesting user), so unlike
                            // findOne/findAllActive it's safe to include direct contact details here
                            // — matches the same phone/email exposure already used for completed
                            // retail purchases in dealers.service.ts::getDealerPurchases.
                            seller: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                    phone: true,
                                    dealerProfile: { select: { companyName: true, logo: true, businessAddress: true } },
                                },
                            },
                            // Only present if the seller purchased a report — same "if it has
                            // any" gating already used everywhere else HPI data is shown.
                            hpiReport: { select: { status: true, isClear: true } },
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.auction.count({ where }),
        ]);

        // Same fee gate as findOne(), via the same helper. This list is shown
        // to the winner BEFORE they pay, so every contact detail — not just the
        // phone number, which is all this used to null — has to be withheld
        // until buyerFeePaid. `where` already scopes to winnerId === userId, so
        // reaching this row is itself proof the viewer won it.
        const gated = data.map((auction: any) => {
            if (auction.listing?.seller) {
                auction.listing = {
                    ...auction.listing,
                    seller: this.gateSellerContactDetails(auction.listing.seller, !!auction.buyerFeePaid),
                };
            }
            return auction;
        });

        return { data: gated, total };
    }

    async update(id: string, updateAuctionDto: UpdateAuctionDto, userId: string): Promise<Auction> {
        const auction = await this.findOne(id);

        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }

        if (auction.status !== 'SCHEDULED') {
            throw new BadRequestException('Only SCHEDULED auctions can be updated');
        }

        const startTime = updateAuctionDto.startTime
            ? new Date(updateAuctionDto.startTime)
            : auction.startTime;

        const endTime = new Date(startTime.getTime() + AUCTION_DURATION_MS);

        return this.prisma.auction.update({
            where: { id },
            data: {
                startTime,
                endTime,
                ...(updateAuctionDto.reservePrice !== undefined && { reservePrice: updateAuctionDto.reservePrice }),
                ...(updateAuctionDto.startingBid !== undefined && { startingBid: updateAuctionDto.startingBid }),
                ...(updateAuctionDto.minIncrement !== undefined && { minIncrement: updateAuctionDto.minIncrement }),
            },
        });
    }

    // Digest — seller-authored custom tags/batch labels and self-rating for their own
    // auction listing. Editable any time before the auction ends, unlike update() which
    // is restricted to SCHEDULED auctions since it recalculates timing/pricing.
    async updateDigest(id: string, dto: UpdateAuctionDigestDto, userId: string): Promise<Auction> {
        const auction = await this.findOne(id);

        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }

        if (auction.status === 'ENDED' || auction.status === 'CANCELLED') {
            throw new BadRequestException('Cannot edit the digest of an ended or cancelled auction');
        }

        return this.prisma.auction.update({
            where: { id },
            data: {
                ...(dto.customTags !== undefined && { customTags: dto.customTags }),
                ...(dto.sellerSelfRating !== undefined && { sellerSelfRating: dto.sellerSelfRating }),
            },
        });
    }

    async cancel(id: string, userId: string): Promise<Auction> {
        const auction = await this.findOne(id);

        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }

        if (auction.status !== 'SCHEDULED') {
            throw new BadRequestException('Only SCHEDULED auctions can be cancelled');
        }

        const cancelled = await this.prisma.auction.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        // Clear linkedListingId on both the AUCTION listing and the linked CLASSIFIED listing
        // so the seller can re-auction or proceed with retail only
        const classifiedId = (auction.listing as any).linkedListingId as string | null;
        await this.prisma.listing.update({
            where: { id: auction.listingId },
            data: { linkedListingId: null } as any,
        });
        if (classifiedId) {
            await this.prisma.listing.update({
                where: { id: classifiedId },
                data: { linkedListingId: null } as any,
            });
        }

        return cancelled;
    }

    async sellerClose(auctionId: string, userId: string): Promise<void> {
        const auction = await this.findOne(auctionId);
        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }
        if (auction.status !== 'ACTIVE') {
            throw new BadRequestException('Only ACTIVE auctions can be closed early');
        }
        await this.closeAuction(auctionId);
    }

    async acceptBid(auctionId: string, bidId: string, sellerId: string): Promise<void> {
        const auction = await this.findOne(auctionId);
        if (auction.listing.sellerId !== sellerId) {
            throw new ForbiddenException('You do not own this auction');
        }
        if (auction.status !== 'ACTIVE') {
            throw new BadRequestException('Only ACTIVE auctions can have a bid accepted');
        }

        const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });
        if (!bid || bid.listingId !== auction.listingId || bid.deletedAt || bid.cancelledAt) {
            throw new NotFoundException('Bid not found in this auction');
        }

        const winningAmount = Number(bid.amount);
        const winnerId = bid.bidderId;
        const linkedListingId = (auction.listing as any).linkedListingId as string | null;

        await this.prisma.$transaction([
            this.prisma.auction.update({
                where: { id: auctionId },
                data: { status: 'ENDED', winnerId, winningBidAmount: bid.amount, wonAt: new Date() },
            }),
            this.prisma.listing.update({
                where: { id: auction.listingId },
                data: { status: 'SOLD' },
            }),
            // Auto-close the linked retail listing if this auction listing had one
            ...(linkedListingId ? [
                this.prisma.listing.update({
                    where: { id: linkedListingId },
                    data: { status: 'SOLD' },
                }),
            ] : []),
            this.prisma.sale.create({
                data: { listingId: auction.listingId, sellerId, buyerId: winnerId, soldPrice: bid.amount },
            }),
            this.prisma.sellerProfile.upsert({
                where: { userId: sellerId },
                create: { userId: sellerId, totalSales: 1 },
                update: { totalSales: { increment: 1 } },
            }),
        ]);

        const endPayload: AuctionEndPayload = { auctionId, winnerId, winningBidAmount: winningAmount, reserveMet: true };
        this.auctionGateway.broadcastAuctionEnd(auctionId, endPayload);
        await this.notifyAuctionEnd(auction, winnerId, winningAmount, true);
    }

    /**
     * Admin override: ends a live auction immediately, assigning a specific
     * dealer as winner regardless of whether they ever bid on it. Winning
     * amount is always the Buy It Now price if one was set, otherwise the
     * reserve price — never the current top bid, since the assigned dealer
     * may not have placed one. The dealer still goes through the normal
     * £125 buyer-fee flow afterward (unchanged — endAuctionWithWinner doesn't
     * touch buyerFeePaid), same as any other winner.
     */
    async adminAssignWinner(auctionId: string, dealerId: string): Promise<void> {
        const auction = await this.findOne(auctionId);
        if (auction.status !== 'ACTIVE') {
            throw new BadRequestException('Only ACTIVE (live) auctions can have a winner assigned');
        }

        const dealer = await this.prisma.user.findUnique({
            where: { id: dealerId },
            include: { dealerProfile: { select: { isVerified: true } } },
        });
        if (!dealer || dealer.deletedAt) {
            throw new NotFoundException('Dealer not found');
        }
        if (dealer.role !== 'DEALER' || !dealer.dealerProfile?.isVerified) {
            throw new BadRequestException('Only verified dealer accounts can be assigned as an auction winner');
        }

        const sellerId = auction.listing.sellerId;
        if (!sellerId) {
            throw new BadRequestException('This listing has no seller on record');
        }
        if (sellerId === dealerId) {
            throw new BadRequestException('Cannot assign the listing\'s own seller as the winning buyer');
        }

        const amount = auction.buyItNowPrice != null ? Number(auction.buyItNowPrice) : Number(auction.reservePrice);
        const linkedListingId = (auction.listing as any).linkedListingId as string | null;

        await this.endAuctionWithWinner(auctionId, dealerId, amount, sellerId, linkedListingId);
        await this.notifyAuctionEnd(auction, dealerId, amount, true);
    }

    /**
     * Called by UnpaidAuctionFeeExpiryService (hourly cron). Any ENDED auction
     * with a winner who hasn't paid the £125 buyer fee within BUYER_FEE_GRACE_MS
     * of wonAt gets unwound: the win is cancelled, the Sale record removed, the
     * listing goes back to ACTIVE, and both the (former) winner and the seller
     * are notified. Without this, a winner who never pays leaves the listing
     * permanently stuck SOLD with no way back onto the market.
     */
    async revertUnpaidWins(): Promise<{ reverted: number }> {
        const cutoff = new Date(Date.now() - BUYER_FEE_GRACE_MS);
        const stale = await this.prisma.auction.findMany({
            where: {
                status: 'ENDED',
                winnerId: { not: null },
                buyerFeePaid: false,
                wonAt: { not: null, lt: cutoff },
                deletedAt: null,
            },
            include: {
                listing: { select: { id: true, title: true, sellerId: true } },
            },
        });

        for (const auction of stale) {
            const winnerId = auction.winnerId!;
            const listing = auction.listing;

            await this.prisma.$transaction([
                this.prisma.auction.update({
                    where: { id: auction.id },
                    data: { status: 'CANCELLED', winnerId: null, winningBidAmount: null, wonAt: null },
                }),
                this.prisma.listing.update({
                    where: { id: listing.id },
                    data: { status: 'DRAFT', type: 'AUCTION' },
                }),
                this.prisma.sale.deleteMany({ where: { listingId: listing.id, buyerId: winnerId } }),
                ...(listing.sellerId ? [
                    this.prisma.sellerProfile.updateMany({
                        where: { userId: listing.sellerId, totalSales: { gt: 0 } },
                        data: { totalSales: { decrement: 1 } },
                    }),
                ] : []),
            ]);

            await this.notificationsService.create({
                userId: winnerId,
                type: 'AUCTION_WIN_EXPIRED',
                title: 'Your auction win was cancelled',
                message: `You didn't pay the £125 buyer fee for "${listing.title}" in time, so the win was cancelled. The seller can now update and relist the auction.`,
                entityType: 'AUCTION',
                entityId: auction.id,
                link: `/dashboard/dealer/auctions/won`,
            }).catch(() => {});

            if (listing.sellerId) {
                const notification = await this.notificationsService.create({
                    userId: listing.sellerId,
                    type: 'AUCTION_WIN_EXPIRED',
                    title: 'Auction sale fell through — ready to relist',
                    message: `The winning buyer for "${listing.title}" didn't pay the buyer fee in time. The sale was cancelled and the auction listing is back in draft so you can update the current notes and relist it; its existing HPI report is retained.`,
                    entityType: 'AUCTION',
                    entityId: auction.id,
                    link: `/dashboard/seller/auctions`,
                }).catch(() => null);
                if (notification) {
                    this.notificationsGateway.sendNotification(listing.sellerId, notification);
                }
            }

            this.auctionGateway.broadcastAuctionEnd(auction.id, {
                auctionId: auction.id,
                winnerId: null,
                winningBidAmount: null,
                reserveMet: false,
            });
        }

        return { reverted: stale.length };
    }

    async remove(id: string, userId: string): Promise<Auction> {
        const auction = await this.findOne(id);

        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }

        if (auction.status !== 'SCHEDULED') {
            throw new BadRequestException('Only SCHEDULED auctions can be deleted');
        }

        return this.prisma.auction.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async submitHandoverProof(auctionId: string, userId: string, proofUrl: string): Promise<any> {
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { sellerId: true, title: true } } },
        });

        if (!auction || auction.deletedAt) {
            throw new NotFoundException('Auction not found');
        }
        if (auction.listing.sellerId !== userId) {
            throw new ForbiddenException('You do not own this auction');
        }
        if (auction.status !== 'ENDED') {
            throw new BadRequestException('Handover proof can only be submitted for ended auctions');
        }
        if (!auction.winnerId) {
            throw new BadRequestException('This auction has no winner');
        }
        if (auction.handoverProofUrl) {
            throw new BadRequestException('Handover proof has already been submitted');
        }

        const updated = await this.prisma.auction.update({
            where: { id: auctionId },
            data: {
                handoverProofUrl: proofUrl,
                handoverSubmittedAt: new Date(),
            },
        });

        // Notify seller that proof is under review
        this.notificationsGateway.sendNotification(userId, {
            type: 'AUCTION_ENDED',
            title: 'Handover proof received',
            message: `Your proof for "${auction.listing.title}" is under review. Your £100 seller bonus will be released once verified.`,
            entityType: 'AUCTION',
            entityId: auctionId,
            link: `/dashboard/seller/auctions`,
        });

        return updated;
    }

    // Called by BidsService after a bid is placed
    async maybeExtend(auctionId: string, bidPlacedAt: Date): Promise<Auction | null> {
        const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
        if (!auction) return null;

        const antiSnipeWindow = ANTI_SNIPE_MINUTES * 60 * 1000;
        const timeLeft = auction.endTime.getTime() - bidPlacedAt.getTime();

        if (timeLeft > 0 && timeLeft <= antiSnipeWindow) {
            return this.prisma.auction.update({
                where: { id: auctionId },
                data: {
                    endTime: new Date(auction.endTime.getTime() + antiSnipeWindow),
                },
            });
        }

        return null;
    }

    // Called by AuctionLifecycleService when endTime has passed
    async closeAuction(auctionId: string): Promise<void> {
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: {
                    include: {
                        bids: {
                            where: { deletedAt: null, cancelledAt: null },
                            orderBy: { amount: 'desc' },
                            take: 1,
                            include: { bidder: { select: { id: true, firstName: true } } },
                        },
                    },
                },
            },
        });

        if (!auction || auction.status !== 'ACTIVE') return;

        const topBid = auction.listing.bids[0];
        const reserveMet = topBid && Number(topBid.amount) >= Number(auction.reservePrice);

        if (reserveMet && topBid) {
            // Winner found
            const sellerId = auction.listing.sellerId;
            const linkedListingId = (auction.listing as any).linkedListingId as string | null;
            await this.prisma.$transaction([
                this.prisma.auction.update({
                    where: { id: auctionId },
                    data: {
                        status: 'ENDED',
                        winnerId: topBid.bidderId,
                        winningBidAmount: topBid.amount,
                        wonAt: new Date(),
                    },
                }),
                this.prisma.listing.update({
                    where: { id: auction.listingId },
                    data: { status: 'SOLD' },
                }),
                // Auto-close the linked retail listing if this auction listing had one
                ...(linkedListingId ? [
                    this.prisma.listing.update({
                        where: { id: linkedListingId },
                        data: { status: 'SOLD' },
                    }),
                ] : []),
                // Create Sale record so revenue appears in earnings, stats, and buyer history
                ...(sellerId ? [
                    this.prisma.sale.create({
                        data: {
                            listingId: auction.listingId,
                            sellerId,
                            buyerId: topBid.bidderId,
                            soldPrice: topBid.amount,
                        },
                    }),
                    this.prisma.sellerProfile.upsert({
                        where: { userId: sellerId },
                        create: { userId: sellerId, totalSales: 1 },
                        update: { totalSales: { increment: 1 } },
                    }),
                ] : []),
            ]);

            const endPayload: AuctionEndPayload = {
                auctionId,
                winnerId: topBid.bidderId,
                winningBidAmount: Number(topBid.amount),
                reserveMet: true,
            };
            this.auctionGateway.broadcastAuctionEnd(auctionId, endPayload);
            await this.notifyAuctionEnd(auction, topBid.bidderId, Number(topBid.amount), true);
        } else {
            // No winner — reserve not met.
            // Move listing to DRAFT (seller's inventory). It will NOT appear in
            // public retail search until the seller explicitly relists it from
            // their inventory dashboard.
            const classifiedId = (auction.listing as any).linkedListingId as string | null;
            await this.prisma.$transaction([
                this.prisma.auction.update({
                    where: { id: auctionId },
                    data: { status: 'ENDED' },
                }),
                this.prisma.listing.update({
                    where: { id: auction.listingId },
                    data: {
                        status: 'DRAFT',
                        type: 'AUCTION', // Keep the same auction listing so its HPI can be reused on re-auction
                        linkedListingId: null, // Clear link so seller can re-auction
                    } as any,
                }),
                // If there was a paired CLASSIFIED retail listing, clear its link too
                // so the seller can re-auction the same vehicle if they want
                ...(classifiedId ? [
                    this.prisma.listing.update({
                        where: { id: classifiedId },
                        data: { linkedListingId: null } as any,
                    }),
                ] : []),
            ]);

            const endPayload: AuctionEndPayload = {
                auctionId,
                winnerId: null,
                winningBidAmount: null,
                reserveMet: false,
            };
            this.auctionGateway.broadcastAuctionEnd(auctionId, endPayload);
            await this.notifyAuctionEnd(auction, null, null, false);
        }
    }

    private async notifyAuctionEnd(
        auction: any,
        winnerId: string | null,
        winningAmount: number | null,
        reserveMet: boolean,
    ): Promise<void> {
        const listing = auction.listing;
        const vehicle = `${listing.year ?? ''} ${listing.make ?? ''} ${listing.model ?? ''}`.trim();

        if (reserveMet && winnerId && winningAmount !== null) {
            // Notify winner — persisted + push delivered via notificationsService.create()
            await this.notificationsService.create({
                userId: winnerId,
                type: 'AUCTION_WON',
                title: 'You won the auction!',
                message: `You won the auction for ${vehicle} with a bid of £${winningAmount.toLocaleString()}. Pay the £125 buyer fee within 72 hours to unlock the seller's protected contact details and auction chat, then arrange inspection and collection.`,
                entityType: 'AUCTION',
                entityId: auction.id,
                link: `/dashboard/dealer/auctions/won`,
            });

            // Notify seller — persisted + push delivered
            if (listing.sellerId) {
                await this.notificationsService.create({
                    userId: listing.sellerId,
                    type: 'AUCTION_ENDED',
                    title: 'Your auction has ended',
                    message: `Your auction for ${vehicle} has ended. Winning bid: £${winningAmount.toLocaleString()}.`,
                    entityType: 'AUCTION',
                    entityId: auction.id,
                    link: `/dashboard/seller/auctions`,
                });
            }

            // Do not create an auction chat room here. The winning dealer has
            // not paid the £125 buyer fee yet. ChatService creates/returns the
            // seller-winner room on demand only after buyerFeePaid is true.

            // Email winner and seller
            const [buyer, seller] = await Promise.all([
                this.prisma.user.findUnique({ where: { id: winnerId }, select: { email: true, firstName: true } }),
                listing.sellerId ? this.prisma.user.findUnique({ where: { id: listing.sellerId }, select: { email: true, firstName: true } }) : null,
            ]);
            // Winner email respects their "You're winning"/Email toggles — same
            // AUCTION_WON type as the notification above (mobile-production-
            // readiness-plan.md F23 follow-up). The seller's "auction ended"
            // email has no dedicated toggle in NotificationSettingsScreen.tsx,
            // so it stays ungated like before.
            if (buyer?.email && await this.notificationsService.shouldSendEmail(winnerId, 'AUCTION_WON')) {
                this.emailService.sendAuctionWonEmail(buyer.email, buyer.firstName || 'there', vehicle || listing.title, winningAmount, auction.id).catch(console.error);
            }
            if (seller?.email) {
                this.emailService.sendAuctionEndedSellerEmail(seller.email, seller.firstName || 'there', vehicle || listing.title, winningAmount, auction.id).catch(console.error);
            }
        } else {
            // No winner — notify seller only, persisted + push delivered
            if (listing.sellerId) {
                await this.notificationsService.create({
                    userId: listing.sellerId,
                    type: 'AUCTION_ENDED',
                    title: 'Auction ended — reserve not met',
                    message: `Your auction for ${vehicle} ended without meeting the reserve price. You can relist or adjust the reserve.`,
                    entityType: 'AUCTION',
                    entityId: auction.id,
                    link: `/dashboard/seller/auctions`,
                });

                const seller = await this.prisma.user.findUnique({ where: { id: listing.sellerId }, select: { email: true, firstName: true } });
                if (seller?.email) {
                    this.emailService.sendAuctionReserveNotMetEmail(seller.email, seller.firstName || 'there', vehicle || listing.title, auction.id).catch(console.error);
                }
            }
        }
    }

    // ── Buy It Now Lifecycle ─────────────────────────────────────────────────

    /**
     * Private helper: ends an auction with a winner — creates Sale record, marks listing SOLD,
     * upserts SellerProfile, broadcasts auction:ended, sends notifications.
     * Called by confirmBuyItNow(), acceptBid(), and closeAuction() to avoid duplication.
     */
    private async endAuctionWithWinner(
        auctionId: string,
        winnerId: string,
        amount: number,
        sellerId: string,
        linkedListingId: string | null = null,
    ): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.auction.update({
                where: { id: auctionId },
                data: {
                    status: 'ENDED',
                    winnerId,
                    winningBidAmount: amount,
                    wonAt: new Date(),
                    buyItNowPendingBuyerId: null,
                    buyItNowPendingAt: null,
                },
            }),
            this.prisma.listing.update({
                where: { id: (await this.prisma.auction.findUnique({ where: { id: auctionId }, select: { listingId: true } }))!.listingId },
                data: { status: 'SOLD' },
            }),
            ...(linkedListingId ? [
                this.prisma.listing.update({
                    where: { id: linkedListingId },
                    data: { status: 'SOLD' },
                }),
            ] : []),
            this.prisma.sale.create({
                data: {
                    listingId: (await this.prisma.auction.findUnique({ where: { id: auctionId }, select: { listingId: true } }))!.listingId,
                    sellerId,
                    buyerId: winnerId,
                    soldPrice: amount,
                },
            }),
            this.prisma.sellerProfile.upsert({
                where: { userId: sellerId },
                create: { userId: sellerId, totalSales: 1 },
                update: { totalSales: { increment: 1 } },
            }),
        ]);

        const endPayload: AuctionEndPayload = { auctionId, winnerId, winningBidAmount: amount, reserveMet: true };
        this.auctionGateway.broadcastAuctionEnd(auctionId, endPayload);
    }

    /**
     * Buyer triggers a Buy It Now request. Sets pending state, notifies seller, broadcasts to viewers.
     */
    async triggerBuyItNow(auctionId: string, buyerId: string): Promise<void> {
        const auction = await this.findOne(auctionId);

        if (auction.status !== 'ACTIVE') {
            throw new BadRequestException('Auction is not ACTIVE');
        }
        if (!auction.buyItNowPrice) {
            throw new BadRequestException('No Buy It Now price set on this auction');
        }

        // Check reserve not already met by existing top bid
        const topBid = await this.prisma.bid.findFirst({
            where: { listingId: auction.listingId, deletedAt: null, cancelledAt: null },
            orderBy: { amount: 'desc' },
        });
        if (topBid && Number(topBid.amount) >= Number(auction.reservePrice)) {
            throw new BadRequestException('Reserve is met — Buy It Now is no longer available');
        }

        // Allow re-trigger by any buyer (replaces existing pending)
        await this.prisma.auction.update({
            where: { id: auctionId },
            data: { buyItNowPendingBuyerId: buyerId, buyItNowPendingAt: new Date() },
        });

        // Notify seller
        await this.notificationsService.create({
            userId: auction.listing.sellerId,
            type: 'AUCTION_ENDED',
            title: 'Buy It Now request received',
            message: `A buyer wants to buy your ${auction.listing.make} ${auction.listing.model} for £${Number(auction.buyItNowPrice).toLocaleString()}.`,
            entityType: 'AUCTION',
            entityId: auctionId,
            link: `/auctions/live/${auctionId}`,
        });

        // Broadcast BIN pending state to all viewers
        this.auctionGateway.broadcastBinPending(auctionId, buyerId);
    }

    /**
     * Seller confirms the Buy It Now request — ends the auction with the pending buyer as winner.
     */
    async confirmBuyItNow(auctionId: string, sellerId: string): Promise<void> {
        const auction = await this.findOne(auctionId);

        if (auction.listing.sellerId !== sellerId) {
            throw new ForbiddenException('You do not own this auction');
        }
        if (!auction.buyItNowPendingBuyerId) {
            throw new BadRequestException('No Buy It Now request is pending on this auction');
        }

        const pendingBuyerId = auction.buyItNowPendingBuyerId;
        const binPrice = Number(auction.buyItNowPrice);
        const linkedListingId = (auction.listing as any).linkedListingId as string | null;

        // Run the full winner-close transaction
        await this.prisma.$transaction([
            this.prisma.auction.update({
                where: { id: auctionId },
                data: {
                    status: 'ENDED',
                    winnerId: pendingBuyerId,
                    winningBidAmount: binPrice,
                    wonAt: new Date(),
                    buyItNowPendingBuyerId: null,
                    buyItNowPendingAt: null,
                },
            }),
            this.prisma.listing.update({
                where: { id: auction.listingId },
                data: { status: 'SOLD' },
            }),
            ...(linkedListingId ? [
                this.prisma.listing.update({
                    where: { id: linkedListingId },
                    data: { status: 'SOLD' },
                }),
            ] : []),
            this.prisma.sale.create({
                data: {
                    listingId: auction.listingId,
                    sellerId,
                    buyerId: pendingBuyerId,
                    soldPrice: binPrice,
                },
            }),
            this.prisma.sellerProfile.upsert({
                where: { userId: sellerId },
                create: { userId: sellerId, totalSales: 1 },
                update: { totalSales: { increment: 1 } },
            }),
        ]);

        const endPayload: AuctionEndPayload = {
            auctionId,
            winnerId: pendingBuyerId,
            winningBidAmount: binPrice,
            reserveMet: true,
        };
        this.auctionGateway.broadcastAuctionEnd(auctionId, endPayload);
        await this.notifyAuctionEnd({ ...auction, id: auctionId }, pendingBuyerId, binPrice, true);
    }

    /**
     * Seller declines the Buy It Now request — clears pending state, notifies buyer, auction resumes.
     */
    async declineBuyItNow(auctionId: string, sellerId: string): Promise<void> {
        const auction = await this.findOne(auctionId);

        if (auction.listing.sellerId !== sellerId) {
            throw new ForbiddenException('You do not own this auction');
        }

        const pendingBuyerId = auction.buyItNowPendingBuyerId;

        await this.prisma.auction.update({
            where: { id: auctionId },
            data: { buyItNowPendingBuyerId: null, buyItNowPendingAt: null },
        });

        // Notify buyer their BIN request was declined
        if (pendingBuyerId) {
            await this.notificationsService.create({
                userId: pendingBuyerId,
                type: 'AUCTION_ENDED',
                title: 'Buy It Now request declined',
                message: `The seller declined your Buy It Now request on ${auction.listing.make} ${auction.listing.model}. You can continue bidding.`,
                entityType: 'AUCTION',
                entityId: auctionId,
                link: `/auctions/live/${auctionId}`,
            });
        }
    }

    /**
     * Lazily clears expired BIN pending state. Called at the top of findOne() and findBySlug()
     * return paths. Fire-and-forget DB update if 24h has elapsed.
     */
    private clearExpiredBin(auction: any): any {
        if (
            auction.buyItNowPendingAt &&
            new Date(auction.buyItNowPendingAt).getTime() + 24 * 60 * 60 * 1000 < Date.now()
        ) {
            // Fire-and-forget — do not block the response
            this.prisma.auction.update({
                where: { id: auction.id },
                data: { buyItNowPendingBuyerId: null, buyItNowPendingAt: null },
            }).catch(() => { /* non-blocking */ });

            return { ...auction, buyItNowPendingBuyerId: null, buyItNowPendingAt: null };
        }
        return auction;
    }
}

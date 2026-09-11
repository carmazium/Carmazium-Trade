import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { UserRole } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { AdminUpdateListingDto } from './dto/admin-update-listing.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SellersService } from '../sellers/sellers.service';
import { AuctionsService } from '../auctions/auctions.service';
import { buildListingActivationData } from '../listings/listing-activation';

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly paymentsService: PaymentsService,
        private readonly emailService: EmailService,
        private readonly notificationsGateway: NotificationsGateway,
        private readonly notificationsService: NotificationsService,
        private readonly sellersService: SellersService,
        private readonly auctionsService: AuctionsService,
    ) { }

    async getAllUsers(page = 1, limit = 20, search?: string) {
        const skip = (page - 1) * limit;
        const where = search
            ? {
                  OR: [
                      { email: { contains: search, mode: 'insensitive' as const } },
                      { firstName: { contains: search, mode: 'insensitive' as const } },
                      { lastName: { contains: search, mode: 'insensitive' as const } },
                  ],
              }
            : undefined;

        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    isEmailVerified: true,
                    createdAt: true,
                    deletedAt: true,
                    lockoutUntil: true,
                    dealerProfile: { select: { isVerified: true, companyName: true } },
                    _count: { select: { listings: true } },
                    phone: true,
                    stripeConnectOnboardingComplete: true,
                    bankAccountName: true,
                    bankSortCode: true,
                    bankAccountNumber: true,
                    payoutPreference: true,
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return { data, total };
    }

    /**
     * Full profile for the admin "view details" panel — everything the list
     * endpoints deliberately keep lightweight: phone, dealer profile + full
     * KYC record (including document URLs, which otherwise become
     * unreachable the moment a KYC is approved and drops out of
     * getPendingKyc), seller profile, and recent activity.
     */
    async getUserDetail(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                profileImage: true,
                isEmailVerified: true,
                isPhoneVerified: true,
                isAddressVerified: true,
                location: true,
                postcode: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
                lockoutUntil: true,
                loginAttempts: true,
                stripeCustomerId: true,
                stripeConnectAccountId: true,
                stripeConnectOnboardingComplete: true,
                bankAccountName: true,
                bankSortCode: true,
                bankAccountNumber: true,
                payoutPreference: true,
                dealerProfile: {
                    include: { kyc: true },
                },
                sellerProfile: true,
                _count: {
                    select: {
                        listings: true,
                        transactions: true,
                        wonAuctions: true,
                        salesAsSeller: true,
                        purchasesAsBuyer: true,
                    },
                },
            },
        });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const [recentListings, recentTransactions] = await Promise.all([
            this.prisma.listing.findMany({
                where: { sellerId: id, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, title: true, slug: true, status: true, price: true, createdAt: true },
            }),
            this.prisma.transaction.findMany({
                where: { userId: id, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, type: true, status: true, amount: true, stripePaymentId: true, description: true, createdAt: true },
            }),
        ]);

        return { ...user, recentListings, recentTransactions };
    }

    async updateUserRole(userId: string, role: UserRole) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { role },
        });
    }

    async banUser(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (user.role === 'ADMIN') throw new BadRequestException('Cannot ban another admin');
        return this.prisma.user.update({
            where: { id: userId },
            data: { deletedAt: new Date() },
        });
    }

    async unbanUser(userId: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { deletedAt: null },
        });
    }

    async lockUser(userId: string) {
        const lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return this.prisma.user.update({
            where: { id: userId },
            data: { lockoutUntil: lockUntil },
        });
    }

    async unlockUser(userId: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { lockoutUntil: null, loginAttempts: 0 },
        });
    }

    async verifyUser(userId: string, isVerified: boolean) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { dealerProfile: true } });

        if (user?.role === 'DEALER' && user.dealerProfile) {
            await this.prisma.dealerProfile.update({
                where: { userId },
                data: { isVerified },
            });
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: { isEmailVerified: isVerified },
        });
    }

    /**
     * `sellerRole` narrows to listings created by accounts of that role. The
     * admin dashboard uses it for the "CarMazium" filter — admins can list
     * directly now, and their vehicles would otherwise be buried among every
     * seller's.
     *
     * The same `where` is applied to the count as well as the rows. Filtering
     * only the rows would leave the total describing a different set, and the
     * pager would offer pages that come back empty.
     */
    async getAllListings(page = 1, limit = 20, sellerRole?: string) {
        const skip = (page - 1) * limit;
        const where = sellerRole ? { seller: { role: sellerRole as any } } : {};
        const [data, total] = await Promise.all([
            this.prisma.listing.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    seller: {
                        select: {
                            id: true, email: true, firstName: true, lastName: true, phone: true, role: true,
                            dealerProfile: { select: { companyName: true, isVerified: true } },
                        },
                    },
                },
            }),
            this.prisma.listing.count({ where }),
        ]);
        return { data, total };
    }

    async deleteListing(id: string) {
        return this.prisma.listing.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    // ── Listing Review ───────────────────────────────────────────────────────

    /**
     * All listings currently awaiting admin review, plus previously-rejected
     * listings still sitting in that state (mirrors getPendingKyc's "pending or
     * rejected" pattern so the admin can track outstanding fixes, not just new
     * submissions).
     */
    async getPendingListingReviews() {
        return this.prisma.listing.findMany({
            where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] }, deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: {
                seller: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
                // AUCTION-type listings carry their schedule (reserve/starting bid/
                // BIN/start time) on this related row, not on Listing itself — the
                // pending-review UI needs it to actually review an auction.
                auction: true,
                // Drives the "HPI outstanding" indicator. Informational only —
                // a pending report no longer blocks approval, it just tells the
                // reviewer this listing will go live owing its seller a report.
                // pdfUploadedAt distinguishes a report completed by uploading the
                // supplied PDF from one keyed into the form — the two are edited
                // through different modals, so the UI has to know which it is.
                hpiReport: { select: { status: true, isClear: true, preparedAt: true, pdfUploadedAt: true } },
            },
        });
    }

    /** Full single-listing detail (any status), for the admin edit modal. */
    async getListingById(id: string) {
        const listing = await this.prisma.listing.findUnique({
            where: { id },
            include: {
                seller: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
                auction: true,
            },
        });
        if (!listing) {
            throw new NotFoundException('Listing not found');
        }
        return listing;
    }

    /**
     * Lets an admin correct a listing's own fields (typos, wrong spec, etc.) —
     * whether it's still awaiting review or already live (ACTIVE), including
     * listings tied to a live auction. Blocked only for SOLD, since editing
     * vehicle details on a completed sale would corrupt the transaction record.
     */
    async updateListing(id: string, dto: AdminUpdateListingDto) {
        const listing = await this.prisma.listing.findUnique({ where: { id }, include: { auction: true } });
        if (!listing) {
            throw new NotFoundException('Listing not found');
        }
        if (listing.status === 'SOLD') {
            throw new BadRequestException('Cannot edit a listing that has already been sold');
        }

        const data: Record<string, unknown> = {};
        // Core
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.price !== undefined) data.price = dto.price;
        if (dto.priceMin !== undefined) data.priceMin = dto.priceMin;
        if (dto.priceMax !== undefined) data.priceMax = dto.priceMax;
        if (dto.description !== undefined) data.description = dto.description;
        // Vehicle identity
        if (dto.make !== undefined) data.make = dto.make;
        if (dto.model !== undefined) data.model = dto.model;
        if (dto.variant !== undefined) data.variant = dto.variant;
        if (dto.year !== undefined) data.year = dto.year;
        if (dto.mileage !== undefined) data.mileage = dto.mileage;
        if (dto.vrm !== undefined) data.vrm = dto.vrm;
        if (dto.vin !== undefined) data.vin = dto.vin;
        // Mechanical / body
        if (dto.fuelType !== undefined) data.fuelType = dto.fuelType;
        if (dto.transmission !== undefined) data.transmission = dto.transmission;
        if (dto.bodyType !== undefined) data.bodyType = dto.bodyType;
        if (dto.condition !== undefined) data.condition = dto.condition;
        if (dto.color !== undefined) data.color = dto.color;
        if (dto.doors !== undefined) data.doors = dto.doors;
        if (dto.seats !== undefined) data.seats = dto.seats;
        if (dto.driveType !== undefined) data.driveType = dto.driveType;
        if (dto.engineSize !== undefined) data.engineSize = dto.engineSize;
        if (dto.bhp !== undefined) data.bhp = dto.bhp;
        if (dto.torqueNm !== undefined) data.torqueNm = dto.torqueNm;
        if (dto.topSpeedMph !== undefined) data.topSpeedMph = dto.topSpeedMph;
        if (dto.zeroTo60Mph !== undefined) data.zeroTo60Mph = dto.zeroTo60Mph;
        if (dto.combinedMpg !== undefined) data.combinedMpg = dto.combinedMpg;
        if (dto.extraUrbanMpg !== undefined) data.extraUrbanMpg = dto.extraUrbanMpg;
        if (dto.ulezCompliant !== undefined) data.ulezCompliant = dto.ulezCompliant;
        if (dto.euroStandard !== undefined) data.euroStandard = dto.euroStandard;
        if (dto.co2Emissions !== undefined) data.co2Emissions = dto.co2Emissions;
        // History / ownership
        if (dto.numberOfKeys !== undefined) data.numberOfKeys = dto.numberOfKeys;
        if (dto.serviceHistory !== undefined) data.serviceHistory = dto.serviceHistory;
        if (dto.owners !== undefined) data.owners = dto.owners;
        if (dto.stolenRecovered !== undefined) data.stolenRecovered = dto.stolenRecovered;
        if (dto.hasOutstandingFinance !== undefined) data.hasOutstandingFinance = dto.hasOutstandingFinance;
        if (dto.isLegalRegisteredKeeper !== undefined) data.isLegalRegisteredKeeper = dto.isLegalRegisteredKeeper;
        if (dto.writeOffCategory !== undefined) {
            // Same auction-only rule as the seller-facing update — a Cat A/B
            // write-off can't be corrected onto a CLASSIFIED listing.
            if ((dto.writeOffCategory === 'CAT_A' || dto.writeOffCategory === 'CAT_B') && listing.type === 'CLASSIFIED') {
                throw new BadRequestException('Cat A and Cat B write-offs cannot be listed for retail sale. Switch to an Auction listing to proceed.');
            }
            data.writeOffCategory = dto.writeOffCategory;
        }
        if (dto.isDepartedSale !== undefined) data.isDepartedSale = dto.isDepartedSale;
        if (dto.departedRelationship !== undefined) data.departedRelationship = dto.departedRelationship;
        if (dto.notOwnerRelationship !== undefined) data.notOwnerRelationship = dto.notOwnerRelationship;
        // DVLA-derived
        if (dto.motStatus !== undefined) data.motStatus = dto.motStatus;
        if (dto.taxStatus !== undefined) data.taxStatus = dto.taxStatus;
        if (dto.motExpiryDate !== undefined) data.motExpiryDate = dto.motExpiryDate;
        if (dto.taxDueDate !== undefined) data.taxDueDate = dto.taxDueDate;
        if (dto.markedForExport !== undefined) data.markedForExport = dto.markedForExport;
        if (dto.monthOfFirstRegistration !== undefined) data.monthOfFirstRegistration = dto.monthOfFirstRegistration;
        if (dto.wheelplan !== undefined) data.wheelplan = dto.wheelplan;
        if (dto.typeApproval !== undefined) data.typeApproval = dto.typeApproval;
        // Listing meta
        if (dto.location !== undefined) data.location = dto.location;
        if (dto.vehicleType !== undefined) data.vehicleType = dto.vehicleType;
        if (dto.isImported !== undefined) data.isImported = dto.isImported;
        if (dto.bannerLabel !== undefined) data.bannerLabel = dto.bannerLabel;
        if (dto.features !== undefined) data.features = dto.features;
        // Delivery
        if (dto.deliveryAvailable !== undefined) data.deliveryAvailable = dto.deliveryAvailable;
        if (dto.deliveryPricePerMile !== undefined) data.deliveryPricePerMile = dto.deliveryPricePerMile;
        if (dto.deliveryMaxMiles !== undefined) data.deliveryMaxMiles = dto.deliveryMaxMiles;
        // Media
        if (dto.images !== undefined) data.images = dto.images;
        if (dto.videoUrls !== undefined) data.videoUrls = dto.videoUrls;
        // Type / badge tier
        if (dto.listingType !== undefined) data.type = dto.listingType;
        if (dto.badgeTier !== undefined) data.badgeTier = dto.badgeTier;

        const updated = await this.prisma.listing.update({ where: { id }, data });

        // Auction schedule lives on the related Auction row, not Listing — only
        // touch it while the auction hasn't gone live yet (SCHEDULED), same gate
        // as the listing itself being PENDING_REVIEW/REJECTED.
        const hasAuctionFields = [dto.reservePrice, dto.startingBid, dto.minIncrement, dto.buyItNowPrice, dto.startTime]
            .some(v => v !== undefined);
        if (hasAuctionFields && listing.auction && listing.auction.status === 'SCHEDULED') {
            const auctionData: Record<string, unknown> = {};
            if (dto.reservePrice !== undefined) auctionData.reservePrice = dto.reservePrice;
            if (dto.startingBid !== undefined) auctionData.startingBid = dto.startingBid;
            if (dto.minIncrement !== undefined) auctionData.minIncrement = dto.minIncrement;
            if (dto.buyItNowPrice !== undefined) auctionData.buyItNowPrice = dto.buyItNowPrice;
            if (dto.startTime !== undefined) {
                const startTime = new Date(dto.startTime);
                auctionData.startTime = startTime;
                auctionData.endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
            }
            await this.prisma.auction.update({ where: { id: listing.auction.id }, data: auctionData });
        }

        return updated;
    }

    /**
     * A pending HPI report deliberately does NOT block approval.
     *
     * It used to: a listing whose seller had paid for a report was held back
     * until staff produced it, which stalled sellers behind our own turnaround.
     * Now the listing goes live showing "report being prepared" and the report
     * is attached later from the admin HPI queue. Nothing here needs to know
     * about it — the report has its own lifecycle.
     */
    async approveListing(id: string) {
        const listing = await this.prisma.listing.findUnique({ where: { id } });
        if (!listing) {
            throw new NotFoundException('Listing not found');
        }
        if (listing.status !== 'PENDING_REVIEW') {
            throw new BadRequestException('Only listings awaiting review can be approved');
        }

        const updated = await this.prisma.listing.update({
            where: { id },
            data: buildListingActivationData(listing.badgeTier),
        });

        if (listing.sellerId) {
            await this.sellersService.incrementListings(listing.sellerId);

            const seller = await this.prisma.user.findUnique({
                where: { id: listing.sellerId },
                select: { email: true, firstName: true },
            });
            if (seller?.email) {
                await this.emailService
                    .sendListingApprovedAlert(seller.email, seller.firstName || 'there', listing.title, listing.slug)
                    .catch(console.error);
            }

            const notification = await this.notificationsService.create({
                userId: listing.sellerId,
                type: 'LISTING_APPROVED',
                title: 'Your Listing is Live!',
                message: `"${listing.title}" has been approved and is now visible to buyers.`,
                link: `/buy-cars/${listing.slug}`,
                entityType: 'Listing',
                entityId: listing.id,
                actionType: 'APPROVED',
            }).catch(() => null);
            if (notification) {
                this.notificationsGateway.sendNotification(listing.sellerId, notification);
            }
        }

        return updated;
    }

    async rejectListing(id: string, dto: RejectListingDto) {
        const listing = await this.prisma.listing.findUnique({ where: { id }, include: { auction: true } });
        if (!listing) {
            throw new NotFoundException('Listing not found');
        }
        if (listing.status !== 'PENDING_REVIEW') {
            throw new BadRequestException('Only listings awaiting review can be rejected');
        }

        const updated = await this.prisma.listing.update({
            where: { id },
            data: {
                status: 'REJECTED',
                rejectionReason: dto.reason,
                reviewedAt: new Date(),
            },
        });

        // A rejected listing has nothing to auction — cancel its still-scheduled
        // auction rather than leaving it to activate against a rejected listing.
        if (listing.auction && listing.auction.status === 'SCHEDULED') {
            await this.prisma.auction.update({
                where: { id: listing.auction.id },
                data: { status: 'CANCELLED' },
            });
        }

        if (listing.sellerId) {
            const seller = await this.prisma.user.findUnique({
                where: { id: listing.sellerId },
                select: { email: true, firstName: true },
            });
            if (seller?.email) {
                await this.emailService
                    .sendListingRejectedAlert(seller.email, seller.firstName || 'there', listing.title, dto.reason)
                    .catch(console.error);
            }

            const notification = await this.notificationsService.create({
                userId: listing.sellerId,
                type: 'LISTING_REJECTED',
                title: 'Listing Needs Attention',
                message: `"${listing.title}" was not approved: ${dto.reason}`,
                link: '/dashboard/seller/listings',
                entityType: 'Listing',
                entityId: listing.id,
                actionType: 'REJECTED',
            }).catch(() => null);
            if (notification) {
                this.notificationsGateway.sendNotification(listing.sellerId, notification);
            }
        }

        return updated;
    }

    /**
     * ACTIVE auctions always sort ahead of everything else (so live auctions
     * needing attention aren't buried under older-but-more-recently-created
     * scheduled/ended ones), then newest-first within each bucket.
     */
    async getAllAuctions(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const include = {
            listing: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    images: true,
                    make: true,
                    model: true,
                    year: true,
                    status: true,
                    seller: {
                        select: {
                            id: true, email: true, firstName: true, lastName: true, phone: true,
                            dealerProfile: { select: { companyName: true, isVerified: true } },
                        },
                    },
                    bids: {
                        where: { deletedAt: null },
                        orderBy: { amount: 'desc' as const },
                        take: 1,
                        select: { amount: true },
                    },
                    _count: { select: { bids: true } },
                },
            },
            winner: {
                select: {
                    id: true, firstName: true, lastName: true, email: true, phone: true,
                    dealerProfile: { select: { companyName: true, isVerified: true } },
                },
            },
        };

        const [activeCount, total] = await Promise.all([
            this.prisma.auction.count({ where: { status: 'ACTIVE' } }),
            this.prisma.auction.count(),
        ]);

        const data: any[] = [];
        if (skip < activeCount) {
            data.push(...await this.prisma.auction.findMany({
                where: { status: 'ACTIVE' },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include,
            }));
        }
        if (data.length < limit) {
            data.push(...await this.prisma.auction.findMany({
                where: { status: { not: 'ACTIVE' } },
                skip: Math.max(0, skip - activeCount),
                take: limit - data.length,
                orderBy: { createdAt: 'desc' },
                include,
            }));
        }

        return { data, total };
    }

    /** Lightweight list of every dealer, for the "assign winner" dropdown. */
    async getAllDealersForAssignment() {
        return this.prisma.user.findMany({
            where: { role: 'DEALER', deletedAt: null },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                dealerProfile: { select: { companyName: true, isVerified: true } },
            },
            orderBy: { firstName: 'asc' },
        });
    }

    /**
     * Admin override: force-ends a live auction, assigning a chosen dealer as
     * winner regardless of whether they ever bid. See AuctionsService.adminAssignWinner
     * for the money-flow rules (BIN/reserve price, normal £125 buyer fee still applies).
     */
    async assignAuctionWinner(auctionId: string, dealerId: string) {
        await this.auctionsService.adminAssignWinner(auctionId, dealerId);
    }

    async getPendingHandovers() {
        return this.prisma.auction.findMany({
            where: {
                deletedAt: null,
                status: 'ENDED',
                handoverProofUrl: { not: null },
                sellerBonusReleased: false,
            },
            orderBy: { handoverSubmittedAt: 'asc' },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        images: true,
                        make: true,
                        model: true,
                        year: true,
                        seller: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                stripeConnectOnboardingComplete: true,
                                bankAccountName: true,
                                bankSortCode: true,
                                bankAccountNumber: true,
                                payoutPreference: true,
                            },
                        },
                    },
                },
                winner: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }

    /**
     * Persist (not just push) a "manual payout needed" alert to every admin —
     * a live-only gateway push is lost forever if no admin happens to be
     * connected at that exact second, with zero trace anywhere afterward.
     */
    private async notifyAdminsPayoutNeedsAction(auctionId: string, title: string, message: string) {
        const admins = await this.prisma.user.findMany({
            where: { role: 'ADMIN', deletedAt: null },
            select: { id: true },
        });
        await Promise.all(
            admins.map((admin) =>
                this.notificationsService.create({
                    userId: admin.id,
                    type: 'SYSTEM',
                    title,
                    message,
                    entityType: 'AUCTION',
                    entityId: auctionId,
                    link: '/dashboard/admin/handovers',
                }).catch(() => {}),
            ),
        );
    }

    async approveHandover(auctionId: string) {
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { sellerId: true, title: true } } },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        // Idempotency guard — prevents double-payout if called more than once
        if (auction.sellerBonusReleased) {
            return auction;
        }

        const updated = await this.prisma.auction.update({
            where: { id: auctionId },
            data: {
                sellerBonusReleased: true,
                sellerBonusReleasedAt: new Date(),
            },
        });

        const sellerId = auction.listing?.sellerId;
        if (sellerId) {
            // Issue £100 payout to seller's connected Stripe account
            const seller = await this.prisma.user.findUnique({
                where: { id: sellerId },
                select: {
                    email: true,
                    firstName: true,
                    stripeConnectAccountId: true,
                    stripeConnectOnboardingComplete: true,
                },
            });

            let payoutSucceeded = false;
            // Distinguishes "seller never connected a payout method" (their action needed)
            // from "connected, but the transfer itself failed" (Carmazium's/Stripe's problem) —
            // conflating these produced the wrong "connect your bank account" message below
            // for sellers who'd already connected one.
            let payoutReason: 'not_connected' | 'transfer_failed' | 'test_mode' | null = null;
            const stripeInTestMode = this.paymentsService.isStripeInTestMode();

            if (stripeInTestMode) {
                // Sandbox window: existing sellers' stripeConnectAccountId values are live-mode
                // and can't accept a test-mode transfer. Skip the auto-transfer and route to
                // manual payout so no one hits a spurious "transfer failed" every time.
                payoutReason = 'test_mode';
                await this.prisma.auction.update({
                    where: { id: auctionId },
                    data: { stripePayoutError: 'Skipped: Stripe is in test mode, live-mode Connect accounts cannot receive a transfer.' },
                });
                await this.notifyAdminsPayoutNeedsAction(
                    auctionId,
                    'Manual payout needed (sandbox mode)',
                    `Auto-transfer of £100 to seller for "${auction.listing.title}" was skipped because Stripe is currently in test mode. Please pay manually when live mode is restored.`,
                );
            } else if (seller?.stripeConnectAccountId && seller?.stripeConnectOnboardingComplete) {
                try {
                    const transferId = await this.paymentsService.issueSellerPayout(
                        seller.stripeConnectAccountId,
                    );
                    // Record transfer ID for audit trail
                    await this.prisma.auction.update({
                        where: { id: auctionId },
                        data: { stripePayoutTransferId: transferId, stripePayoutError: null },
                    });
                    payoutSucceeded = true;
                } catch (err: any) {
                    const errMsg = err?.message || 'Unknown Stripe error';
                    console.error(`[Admin] Stripe payout failed for auction ${auctionId}:`, errMsg);
                    payoutReason = 'transfer_failed';
                    // Persist error so admins can see it in the handovers view
                    await this.prisma.auction.update({
                        where: { id: auctionId },
                        data: { stripePayoutError: errMsg },
                    });
                    await this.notifyAdminsPayoutNeedsAction(
                        auctionId,
                        '⚠️ Payout failed — manual action needed',
                        `Auto-transfer of £100 to seller for "${auction.listing.title}" failed: ${errMsg}. Please pay manually.`,
                    );
                }
            } else {
                // Seller has no Stripe Connect account (or onboarding incomplete) — this used
                // to fall through silently: no stripePayoutError, no admin notification, and
                // the auction still disappeared from the pending-handovers queue the moment
                // sellerBonusReleased flipped true, leaving no trace anywhere that £100 was
                // still owed.
                payoutReason = 'not_connected';
                await this.prisma.auction.update({
                    where: { id: auctionId },
                    data: { stripePayoutError: 'Seller has not connected a Stripe payout method.' },
                });
                await this.notifyAdminsPayoutNeedsAction(
                    auctionId,
                    'Manual payout needed — seller not connected',
                    `Seller for "${auction.listing.title}" has no Stripe payout method connected. £100 still needs to be paid manually.`,
                );
            }

            this.notificationsGateway.sendNotification(sellerId, {
                type: 'HANDOVER_APPROVED',
                title: 'Handover verified',
                message: payoutSucceeded
                    ? `Your handover proof for "${auction.listing.title}" has been approved. Your £100 bonus is on its way to your bank account.`
                    : payoutReason === 'not_connected'
                        ? `Your handover proof for "${auction.listing.title}" has been approved. Connect your bank account in Settings to receive your £100 bonus.`
                        : `Your handover proof for "${auction.listing.title}" has been approved. Your £100 bonus is being processed manually — our team will be in touch shortly.`,
                entityType: 'AUCTION',
                entityId: auctionId,
                link: '/dashboard/seller/auctions',
            });

            if (seller?.email) {
                this.emailService.sendHandoverApprovedEmail(seller.email, seller.firstName || 'there', auction.listing.title).catch(console.error);
            }
        }

        return updated;
    }

    /**
     * List approved handovers whose £100 seller bonus still hasn't actually
     * reached the seller — i.e. sellerBonusReleased is true (admin approved
     * it) but neither a Stripe transfer nor a manual bank payment has been
     * confirmed. Without this, an approved-but-unpaid auction had no
     * persistent home anywhere in the system once it left the pending queue.
     */
    async getPendingPayouts() {
        return this.prisma.auction.findMany({
            where: {
                deletedAt: null,
                sellerBonusReleased: true,
                stripePayoutTransferId: null,
                manualPayoutConfirmedAt: null,
            },
            orderBy: { sellerBonusReleasedAt: 'asc' },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        images: true,
                        make: true,
                        model: true,
                        year: true,
                        seller: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                stripeConnectAccountId: true,
                                stripeConnectOnboardingComplete: true,
                                bankAccountName: true,
                                bankSortCode: true,
                                bankAccountNumber: true,
                                payoutPreference: true,
                            },
                        },
                    },
                },
                winner: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }

    /**
     * Re-attempt the Stripe transfer for an approved handover that's still
     * owed — e.g. the seller has since connected Stripe, or a transient
     * Stripe error has cleared. Idempotent: no-ops if already paid.
     */
    async retryPayout(auctionId: string) {
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { sellerId: true, title: true } } },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        if (!auction.sellerBonusReleased) {
            throw new BadRequestException('This handover has not been approved yet.');
        }
        if (auction.stripePayoutTransferId || auction.manualPayoutConfirmedAt) {
            return auction; // already paid — nothing to retry
        }

        const sellerId = auction.listing?.sellerId;
        const seller = sellerId
            ? await this.prisma.user.findUnique({
                where: { id: sellerId },
                select: { stripeConnectAccountId: true, stripeConnectOnboardingComplete: true },
            })
            : null;

        if (this.paymentsService.isStripeInTestMode()) {
            throw new BadRequestException('Cannot retry via Stripe while in test mode — use "Mark Paid Manually" instead.');
        }
        if (!seller?.stripeConnectAccountId || !seller?.stripeConnectOnboardingComplete) {
            throw new BadRequestException('Seller still has no connected Stripe payout method.');
        }

        const transferId = await this.paymentsService.issueSellerPayout(seller.stripeConnectAccountId);
        return this.prisma.auction.update({
            where: { id: auctionId },
            data: { stripePayoutTransferId: transferId, stripePayoutError: null },
        });
    }

    /**
     * Admin confirms they've paid the seller's £100 bonus manually (bank
     * transfer outside Stripe) — the only way an approved-but-unpaid auction
     * could ever be marked resolved before this existed.
     */
    async markPayoutPaidManually(auctionId: string) {
        const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
        if (!auction) throw new NotFoundException('Auction not found');
        if (!auction.sellerBonusReleased) {
            throw new BadRequestException('This handover has not been approved yet.');
        }
        return this.prisma.auction.update({
            where: { id: auctionId },
            data: { manualPayoutConfirmedAt: new Date(), stripePayoutError: null },
        });
    }

    async denyHandover(auctionId: string) {
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: { listing: { select: { sellerId: true, title: true } } },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        // Idempotency guard — a successful denial clears handoverProofUrl. If it's
        // already null, either nothing has been submitted yet or this denial ran
        // already; either way, running the refund path a second time would try to
        // re-refund an already-refunded Stripe intent and page every admin twice.
        if (!auction.handoverProofUrl) {
            return auction;
        }

        // Rejecting evidence is not a failed sale. Do not refund the buyer here;
        // the seller simply gets another chance to upload clearer proof.

        // Purge the denied proof from Supabase storage — the URL is a public path
        // like `${supabaseUrl}/storage/v1/object/public/listings/handover/{id}/xxx.jpg`;
        // we take everything after `/listings/` as the object path. Failure is
        // logged but never blocks the denial from completing.
        try {
            const marker = '/storage/v1/object/public/listings/';
            const idx = auction.handoverProofUrl.indexOf(marker);
            if (idx !== -1) {
                const objectPath = auction.handoverProofUrl.slice(idx + marker.length);
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
                if (supabaseUrl && supabaseKey && objectPath) {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { createClient } = require('@supabase/supabase-js');
                    const supabase = createClient(supabaseUrl, supabaseKey);
                    await supabase.storage.from('listings').remove([objectPath]);
                }
            }
        } catch (err) {
            console.error(`[Admin] Failed to purge denied handover proof for auction ${auctionId}:`, err);
        }

        // Clear the proof URL so seller can resubmit
        const updated = await this.prisma.auction.update({
            where: { id: auctionId },
            data: {
                handoverProofUrl: null,
                handoverSubmittedAt: null,
            },
        });

        const sellerId = auction.listing?.sellerId;
        if (sellerId) {
            this.notificationsGateway.sendNotification(sellerId, {
                type: 'HANDOVER_DENIED',
                title: 'Handover proof rejected',
                message: `Your handover proof for "${auction.listing.title}" was not accepted. Please upload a clearer or more appropriate document to receive your £100 bonus.`,
                entityType: 'AUCTION',
                entityId: auctionId,
                link: '/dashboard/seller/auctions',
            });

            const seller = await this.prisma.user.findUnique({ where: { id: sellerId }, select: { email: true, firstName: true } });
            if (seller?.email) {
                this.emailService.sendHandoverDeniedEmail(seller.email, seller.firstName || 'there', auction.listing.title).catch(console.error);
            }
        }

        return updated;
    }

    async getAllTransactions(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.transaction.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true, email: true, firstName: true, lastName: true, phone: true,
                            dealerProfile: { select: { companyName: true, isVerified: true } },
                        },
                    },
                    // hpiReport rides along so an HPI_REPORT / HPI_REPORT_EMAIL row
                    // in the ledger can show whether that payment has actually
                    // been fulfilled, and let an admin attach the report right
                    // there rather than going looking for the listing.
                    listing: {
                        select: {
                            id: true, title: true, slug: true, make: true, model: true, year: true,
                            hpiReport: { select: { status: true, isClear: true, pdfUploadedAt: true, preparedAt: true } },
                        },
                    },
                },
            }),
            this.prisma.transaction.count(),
        ]);
        return { data, total };
    }

    // £25 of the £125 auction buyer fee is CarMazium's own cut — the other
    // £100 is a seller bonus paid out via Stripe Connect transfer
    // (issueSellerPayout). Mirrors AUCTION_PLATFORM_FEE in payments.service.ts.
    private readonly AUCTION_PLATFORM_FEE_CUT = 25;

    /**
     * "Revenue" here means money CarMazium actually retains, not gross Stripe
     * throughput. LISTING_FEE, HPI_REPORT (seller's report request) and
     * HPI_REPORT_EMAIL (buyer's paid emailed copy) are all kept in full.
     * COMMISSION (the £125 auction buyer fee) is counted per-transaction at
     * the fixed £25 platform cut, not by summing `amount` — the stored
     * amount is the full £125, £100 of which is seller pass-through. DEPOSIT
     * and FULL_PAYMENT are buyer funds for the vehicle itself — refundable or
     * a pass-through to the seller — and are excluded entirely; there's
     * currently no seller-payout mechanism for FULL_PAYMENT by design (retail
     * sales settle outside the fee flow), so none of that money is ever
     * CarMazium's to count. BOOST payments don't create Transaction rows at
     * all yet (see FeaturedBoostService) and so aren't reflected here either.
     */
    private async computeRealRevenue(dateRange?: { gte: Date; lte: Date }): Promise<number> {
        const createdAt = dateRange ? { createdAt: dateRange } : {};
        const [feeAgg, commissionCount] = await Promise.all([
            this.prisma.transaction.aggregate({
                where: { status: 'COMPLETED', deletedAt: null, type: { in: ['LISTING_FEE', 'HPI_REPORT', 'HPI_REPORT_EMAIL'] }, ...createdAt },
                _sum: { amount: true },
            }),
            this.prisma.transaction.count({
                where: { status: 'COMPLETED', deletedAt: null, type: 'COMMISSION', ...createdAt },
            }),
        ]);
        return Number(feeAgg._sum?.amount ?? 0) + commissionCount * this.AUCTION_PLATFORM_FEE_CUT;
    }

    async getPlatformStats() {
        const [users, listings, activeListings, soldListings, auctions, activeAuctions, endedAuctions, bids, totalRevenue] = await Promise.all([
            this.prisma.user.count(),
            // Phase 10: include SOLD in total count — no status filter, counts DRAFT + ACTIVE + SOLD
            this.prisma.listing.count({ where: { deletedAt: null } }),
            // Phase 10: activeListings intentionally ACTIVE only — current live count
            this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
            // Phase 10: soldListings correctly counts SOLD listings only
            this.prisma.listing.count({ where: { status: 'SOLD', deletedAt: null } }),
            this.prisma.auction.count({ where: { deletedAt: null } }),
            this.prisma.auction.count({ where: { status: 'ACTIVE', deletedAt: null } }),
            this.prisma.auction.count({ where: { status: 'ENDED', deletedAt: null } }),
            this.prisma.bid.count({ where: { deletedAt: null } }),
            this.computeRealRevenue(),
        ]);

        return {
            totalUsers: users,
            totalListings: listings,
            activeListings,
            soldListings,
            totalAuctions: auctions,
            activeAuctions,
            endedAuctions,
            totalBids: bids,
            totalRevenue,
        };
    }

    async getAnalyticsData() {
        // Last 6 months of data
        const now = new Date();
        const months: { label: string; start: Date; end: Date }[] = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
            months.push({
                label: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
                start,
                end,
            });
        }

        const data = await Promise.all(
            months.map(async ({ label, start, end }) => {
                const [newUsers, newListings, revenue] = await Promise.all([
                    this.prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
                    this.prisma.listing.count({ where: { createdAt: { gte: start, lte: end }, deletedAt: null } }),
                    this.computeRealRevenue({ gte: start, lte: end }),
                ]);
                return {
                    month: label,
                    newUsers,
                    newListings,
                    revenue,
                };
            }),
        );

        return data;
    }

    async getPendingKyc() {
        return this.prisma.dealerKyc.findMany({
            where: {
                status: {
                    in: ['PENDING', 'REJECTED']
                }
            },
            include: {
                dealerProfile: {
                    include: {
                        user: {
                            select: {
                                email: true,
                                firstName: true,
                                lastName: true,
                            }
                        }
                    }
                }
            },
            orderBy: { submittedAt: 'desc' },
        });
    }

    /**
     * Every dealer with a KYC record, regardless of status — getPendingKyc()
     * only shows PENDING/REJECTED, so an approved dealer's submission
     * (including document URLs) becomes permanently unreachable in the admin
     * panel the moment it's approved. This is the archive that fixes that.
     */
    async getAllDealersKycArchive(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.dealerKyc.findMany({
                skip,
                take: limit,
                include: {
                    dealerProfile: {
                        include: {
                            user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
                        },
                    },
                },
                orderBy: { submittedAt: 'desc' },
            }),
            this.prisma.dealerKyc.count(),
        ]);
        return { data, total };
    }

    async reviewKyc(kycId: string, dto: ReviewKycDto) {
        const kyc = await this.prisma.dealerKyc.findUnique({
            where: { id: kycId },
            include: {
                dealerProfile: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                            }
                        }
                    }
                }
            }
        });

        if (!kyc) {
            throw new NotFoundException('KYC record not found');
        }

        const currentDocStatuses = (kyc.documentStatuses as Record<string, any>) || {};
        const updatedDocStatuses = { ...currentDocStatuses };

        // Process the reviews granularly
        for (const review of dto.fields) {
            updatedDocStatuses[review.field] = {
                status: review.status,
                note: review.status === 'REJECTED' ? (review.note || '') : '',
            };
        }

        // Determine if all are approved, or if any is rejected
        const allFields = [
            'companyHouseName',
            'representativeName',
            'representativePosition',
            'vatNumber',
            'vatProof',
            'companyRegistrationNumber',
            'companyRegistrationProof',
            'personOfSignificantControl',
            'directorName',
            'directorIdProof',
            'businessWebsite',
            'businessRegisteredAddress',
            'tradingAddress',
            'googleReviewsLink',
            'paymentReference',
            'paymentScreenshot',
        ];

        let hasRejected = false;
        let hasPending = false;
        const rejectedFields: { field: string; note: string }[] = [];

        for (const field of allFields) {
            const fieldStatus = updatedDocStatuses[field]?.status || 'PENDING';
            if (fieldStatus === 'REJECTED') {
                hasRejected = true;
                rejectedFields.push({
                    field,
                    note: updatedDocStatuses[field]?.note || '',
                });
            } else if (fieldStatus === 'PENDING') {
                hasPending = true;
            }
        }

        let overallStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
        if (hasRejected) {
            overallStatus = 'REJECTED';
        } else if (!hasPending) {
            overallStatus = 'APPROVED';
        }

        // Update the KYC record
        const updatedKyc = await this.prisma.dealerKyc.update({
            where: { id: kycId },
            data: {
                status: overallStatus,
                documentStatuses: updatedDocStatuses,
                reviewedAt: new Date(),
            },
        });

        const dealerEmail = kyc.dealerProfile.user.email;
        const dealerName = kyc.dealerProfile.companyName || kyc.dealerProfile.user.firstName || 'Dealer';

        const dealerUserId = kyc.dealerProfile.user?.id ?? null;

        if (overallStatus === 'APPROVED') {
            // Unblock dealer dashboard
            await this.prisma.dealerProfile.update({
                where: { id: kyc.dealerProfileId },
                data: {
                    isVerified: true,
                    verificationDate: new Date(),
                },
            });

            // Send approval email
            await this.emailService.sendKycApprovedDealerAlert(dealerEmail, dealerName).catch(console.error);

            // In-app notification to dealer
            if (dealerUserId) {
                const notification = await this.notificationsService.create({
                    userId: dealerUserId,
                    type: 'KYC_APPROVED',
                    title: 'KYC Verification Approved',
                    message: 'Your dealership documents have been verified. Your dealer dashboard is now fully unlocked!',
                    link: '/dashboard/dealer',
                    entityType: 'DealerKyc',
                    entityId: kyc.id,
                    actionType: 'APPROVED',
                }).catch(() => null);
                if (notification) {
                    this.notificationsGateway.sendNotification(dealerUserId, notification);
                }
            }
        } else if (overallStatus === 'REJECTED') {
            // Keep blocked
            await this.prisma.dealerProfile.update({
                where: { id: kyc.dealerProfileId },
                data: {
                    isVerified: false,
                },
            });

            // Send rejection email
            await this.emailService.sendKycRejectedDealerAlert(dealerEmail, dealerName, rejectedFields).catch(console.error);

            // In-app notification to dealer
            if (dealerUserId) {
                const fieldNames = rejectedFields.map(f => f.field.replace(/([A-Z])/g, ' $1').trim()).join(', ');
                const notification = await this.notificationsService.create({
                    userId: dealerUserId,
                    type: 'KYC_REJECTED',
                    title: 'KYC Documents Need Attention',
                    message: `Some documents require revision: ${fieldNames}. Please log in and re-upload the flagged items.`,
                    link: '/dashboard/dealer',
                    entityType: 'DealerKyc',
                    entityId: kyc.id,
                    actionType: 'REJECTED',
                }).catch(() => null);
                if (notification) {
                    this.notificationsGateway.sendNotification(dealerUserId, notification);
                }
            }
        }

        return updatedKyc;
    }
}


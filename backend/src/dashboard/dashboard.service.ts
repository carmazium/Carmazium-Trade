import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { subDays } from 'date-fns';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    private buildPeriodFilter(period: '7d' | '30d'): { gte: Date } {
        return { gte: subDays(new Date(), period === '7d' ? 7 : 30) };
    }

    async getBuyerDashboard(userId: string, period: '7d' | '30d' = '30d') {
        const dateFilter = this.buildPeriodFilter(period);
        const [
            activeBids,
            activeOffers,
            watchlistCount,
            wonAuctions,
            bids,
            offers,
            history,
        ] = await Promise.all([
            this.prisma.bid.count({ where: { bidderId: userId, createdAt: dateFilter, cancelledAt: null } }),
            this.prisma.offer.count({ where: { buyerId: userId, status: { in: ['PENDING', 'COUNTERED'] }, createdAt: dateFilter } }),
            this.prisma.watchlistItem.count({ where: { userId, createdAt: dateFilter } }),
            this.prisma.auction.count({ where: { winnerId: userId, createdAt: dateFilter } }),
            this.prisma.bid.findMany({
                where: { bidderId: userId, createdAt: dateFilter, cancelledAt: null },
                take: 20,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    amount: true,
                    createdAt: true,
                    listingId: true,
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            images: true,
                            auction: {
                                select: {
                                    id: true,
                                    status: true,
                                    winnerId: true,
                                    winningBidAmount: true,
                                    endTime: true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.offer.findMany({
                where: { buyerId: userId, createdAt: dateFilter },
                take: 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            images: true,
                        },
                    },
                    seller: {
                        select: {
                            firstName: true,
                            lastName: true,
                            dealerProfile: { select: { companyName: true } },
                        },
                    },
                },
            }),
            this.prisma.sale.findMany({
                where: { buyerId: userId, createdAt: dateFilter },
                take: 20,
                orderBy: { createdAt: 'desc' },
                include: { listing: { select: { title: true } } },
            }),
        ]);

        return {
            activeBids,
            activeOffers,
            watchlistCount,
            wonAuctions,
            bids: (bids as any[]).map(b => ({
                id: b.id,
                amount: Number(b.amount),
                auctionStatus: b.listing?.auction?.status ?? 'ENDED',
                auctionId: b.listing?.auction?.id ?? null,
                isWinner: b.listing?.auction?.winnerId === userId,
                winningBidAmount: b.listing?.auction?.winningBidAmount
                    ? Number(b.listing.auction.winningBidAmount)
                    : null,
                paymentDeadline: b.listing?.auction?.endTime
                    ? new Date(new Date(b.listing.auction.endTime).getTime() + 24 * 60 * 60 * 1000).toISOString()
                    : null,
                bidCount: null,
                listing: {
                    id: b.listing?.id ?? null,
                    title: b.listing?.title ?? 'Vehicle',
                    images: b.listing?.images ?? [],
                },
                listingId: b.listingId,
                createdAt: b.createdAt,
            })),
            offers: (offers as any[]).map(o => ({
                id: o.id,
                amount: Number(o.amount),
                status: o.status,
                listing: {
                    id: o.listing?.id ?? null,
                    title: o.listing?.title ?? 'Vehicle',
                    images: o.listing?.images ?? [],
                },
                seller: o.seller
                    ? {
                          firstName: o.seller.firstName,
                          lastName: o.seller.lastName,
                          dealerProfile: o.seller.dealerProfile
                              ? { companyName: o.seller.dealerProfile.companyName }
                              : null,
                      }
                    : null,
                listingId: o.listingId,
                createdAt: o.createdAt,
            })),
            history: history.map(s => ({
                id: s.id,
                price: Number(s.soldPrice),
                listing: { title: s.listing?.title ?? 'Vehicle' },
                listingId: s.listingId,
                createdAt: s.createdAt,
            })),
        };
    }

    async getUnifiedDashboard(userId: string) {
        // Handle staff/owner logic to show dealership stats to staff
        let targetOwnerId = userId;
        try {
            const staffRecord = await this.prisma.dealerStaff.findFirst({
                where: { userId, isActive: true },
                select: { dealerProfile: { select: { userId: true } } }
            });
            if (staffRecord) {
                targetOwnerId = staffRecord.dealerProfile.userId;
            }
        } catch (err) {
            console.error('Staff lookup failed, falling back to user ID:', err.message);
        }

        const [
            activeBids,
            watchlistCount,
            buyerCounteredOffers,
            totalListings,
            activeListings,
            soldListings,
            totalViews,
            totalRevenue,
            unreadMessages,
            incomingOffers
        ] = await Promise.all([
            // Buyer stats (Always specific to the logged-in user)
            this.prisma.offer.count({ where: { buyerId: userId, status: 'PENDING' } }),
            this.prisma.watchlistItem.count({ where: { userId } }),
            // Buyer: seller countered — needs accept/decline in My Offers
            this.prisma.offer.count({ where: { buyerId: userId, status: 'COUNTERED' } }),
            
            // Seller/Dealer stats (Aggregated for the dealership if staff)
            // Phase 10: include SOLD in total count — no status filter intentional (DRAFT + ACTIVE + SOLD all count)
            this.prisma.listing.count({ where: { sellerId: targetOwnerId, deletedAt: null } }),
            // Phase 10: activeListings intentionally ACTIVE only — this is the current live inventory count
            this.prisma.listing.count({ where: { sellerId: targetOwnerId, status: 'ACTIVE', deletedAt: null } }),
            // Phase 10: soldListings correctly counts only SOLD — used for sold count stat
            this.prisma.listing.count({ where: { sellerId: targetOwnerId, status: 'SOLD', deletedAt: null } }),
            this.prisma.listing.aggregate({
                where: { sellerId: targetOwnerId, deletedAt: null },
                _sum: { viewCount: true }
            }),
            
            // Revenue tracking (Aggregated for the dealership if staff)
            this.prisma.sale.aggregate({
                where: { sellerId: targetOwnerId },
                _sum: { soldPrice: true }
            }),
            
            // Messaging & Notifications
            this.prisma.message.count({ 
                where: { 
                    chatRoom: { 
                        OR: [{ initiatorId: userId }, { participantId: userId }] 
                    },
                    senderId: { not: userId },
                    isRead: false
                }
            }),
            
            // Incoming offers for seller/dealer
            this.prisma.offer.count({
                where: {
                    listing: { sellerId: targetOwnerId },
                    status: 'PENDING'
                }
            })
        ]);

        return {
            buyer: {
                activeBids,
                watchlistCount,
                counteredOffersPending: buyerCounteredOffers,
            },
            seller: {
                totalListings,
                activeListings,
                soldListings,
                totalViews: totalViews._sum.viewCount || 0,
                totalRevenue: Number(totalRevenue._sum.soldPrice || 0),
                incomingOffers
            },
            unreadMessages
        };
    }

    async getSellerDashboard(userId: string, period: '7d' | '30d' = '30d') {
        const dateFilter = this.buildPeriodFilter(period);
        const [activeListings, activeAuctions, offerCount, savedCount, offers, earnings] = await Promise.all([
            this.prisma.listing.count({ where: { sellerId: userId, status: 'ACTIVE', deletedAt: null, createdAt: dateFilter } }),
            this.prisma.auction.count({
                where: { listing: { sellerId: userId }, endTime: { gt: new Date() }, createdAt: dateFilter },
            }),
            this.prisma.offer.count({
                where: { listing: { sellerId: userId }, status: { in: ['PENDING', 'COUNTERED'] }, createdAt: dateFilter },
            }),
            this.prisma.watchlistItem.count({
                where: { listing: { sellerId: userId }, createdAt: dateFilter },
            }),
            this.prisma.offer.findMany({
                where: { listing: { sellerId: userId }, status: { in: ['PENDING', 'COUNTERED'] }, createdAt: dateFilter },
                take: 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    listing: { select: { title: true } },
                    buyer: { select: { firstName: true, lastName: true } },
                },
            }),
            this.prisma.sale.findMany({
                where: { sellerId: userId, createdAt: dateFilter },
                take: 20,
                orderBy: { createdAt: 'desc' },
                include: { listing: { select: { title: true } } },
            }),
        ]);

        return {
            activeListings,
            activeAuctions,
            offerCount,
            savedCount,
            enquiries: offerCount,
            offers: offers.map(o => ({
                id: o.id,
                amount: Number(o.amount),
                status: o.status,
                listing: { title: o.listing.title },
                buyer: o.buyer,
            })),
            earnings: earnings.map(s => ({
                id: s.id,
                soldPrice: Number(s.soldPrice),
                // Vehicle purchase funds are paid directly buyer-to-seller.
                // CarMazium does not deduct a percentage commission from retail proceeds.
                platformFee: 0,
                net: Number(s.soldPrice),
                listing: { title: s.listing?.title ?? 'Vehicle' },
                createdAt: s.createdAt,
            })),
        };
    }

    async getDealerDashboard(userId: string, period: '7d' | '30d' = '30d') {
        const dateFilter = this.buildPeriodFilter(period);
        const dealerProfile = await this.prisma.dealerProfile.findUnique({ where: { userId } });

        const [
            activeListings,
            activeAuctions,
            soldThisMonth,
            leadCounts,
            viewAgg,
            totalListingsForViews,
        ] = await Promise.all([
            this.prisma.listing.count({ where: { sellerId: userId, status: 'ACTIVE', deletedAt: null, createdAt: dateFilter } }),
            this.prisma.auction.count({ where: { listing: { sellerId: userId }, endTime: { gt: new Date() }, createdAt: dateFilter } }),
            this.prisma.sale.count({ where: { sellerId: userId, createdAt: dateFilter } }),
            dealerProfile
                ? this.prisma.lead.groupBy({
                    by: ['status'],
                    where: { dealerProfileId: dealerProfile.id },
                    _count: { status: true },
                })
                : Promise.resolve([]),
            this.prisma.listing.aggregate({
                where: { sellerId: userId, deletedAt: null },
                _sum: { viewCount: true },
                _count: { id: true },
            }),
            this.prisma.listing.count({ where: { sellerId: userId, deletedAt: null } }),
        ]);

        const funnelMap: Record<string, number> = {};
        for (const row of leadCounts as any[]) {
            funnelMap[row.status] = row._count.status;
        }
        const totalLeads = Object.values(funnelMap).reduce((a, b) => a + b, 0);
        const wonLeads = funnelMap['WON'] ?? 0;

        return {
            activeListings,
            activeAuctions,
            totalLeads,
            soldThisMonth,
            leadFunnel: {
                NEW:         funnelMap['NEW']         ?? 0,
                CONTACTED:   funnelMap['CONTACTED']   ?? 0,
                QUALIFIED:   funnelMap['QUALIFIED']   ?? 0,
                NEGOTIATING: funnelMap['NEGOTIATING'] ?? 0,
                WON:         funnelMap['WON']         ?? 0,
                LOST:        funnelMap['LOST']        ?? 0,
            },
            conversionRate: totalLeads > 0 ? wonLeads / totalLeads : 0,
            avgViews: totalListingsForViews > 0
                ? Math.round((viewAgg._sum.viewCount ?? 0) / totalListingsForViews)
                : 0,
        };
    }

    async getContractorDashboard(userId: string) {
        const profile = await this.prisma.contractorProfile.findUnique({
            where: { userId },
        });

        if (!profile) return null;

        const [pending, active, completed] = await Promise.all([
            this.prisma.serviceRequest.count({ where: { contractorId: profile.id, status: 'PENDING' } }),
            this.prisma.serviceRequest.count({ where: { contractorId: profile.id, status: 'IN_PROGRESS' } }),
            this.prisma.serviceRequest.count({ where: { contractorId: profile.id, status: 'COMPLETED' } }),
        ]);

        const recentRequests = await this.prisma.serviceRequest.findMany({
            where: { contractorId: profile.id },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                requester: {
                    select: { id: true, firstName: true, lastName: true, email: true, role: true },
                },
            },
        });

        return {
            statusCounts: { pending, active, completed },
            recentRequests,
            profile,
        };
    }

    async getFinanceDashboard(userId: string) {
        const [pending, approved, rejected] = await Promise.all([
            this.prisma.financeApplication.count({ where: { status: 'PENDING' } }),
            this.prisma.financeApplication.count({ where: { status: 'APPROVED' } }),
            this.prisma.financeApplication.count({ where: { status: 'REJECTED' } }),
        ]);

        const recentApplications = await this.prisma.financeApplication.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                listing: { select: { id: true, title: true, price: true, status: true } },
            },
        });

        return {
            stats: { pending, approved, rejected },
            recentApplications,
        };
    }

    async getInsuranceDashboard(userId: string) {
        const [pending, quoted, declined] = await Promise.all([
            this.prisma.insuranceQuote.count({ where: { status: 'PENDING' } }),
            this.prisma.insuranceQuote.count({ where: { status: 'QUOTED' } }),
            this.prisma.insuranceQuote.count({ where: { status: 'REJECTED' } }),
        ]);

        const recentQuotes = await this.prisma.insuranceQuote.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                listing: { select: { id: true, title: true, price: true, status: true } },
            },
        });

        return {
            stats: { pending, quoted, declined },
            recentQuotes,
        };
    }

    async getAdminDashboard() {
        const [users, listings, auctions, revenue] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.listing.count(),
            this.prisma.auction.count({ where: { endTime: { gt: new Date() } } }),
            this.prisma.transaction.aggregate({
                _sum: { amount: true },
            }),
        ]);

        const recentUsers = await this.prisma.user.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
        });

        return {
            totalUsers: users,
            totalListings: listings,
            activeAuctions: auctions,
            totalRevenue: revenue._sum.amount || 0,
            recentUsers,
        };
    }
}

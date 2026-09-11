import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateListingDto,
    FuelType as DtoFuelType,
    Transmission as DtoTransmission,
    BodyType as DtoBodyType,
} from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingFilterDto } from './dto/listing-filter.dto';
// These types come from @prisma/client and are available once `prisma generate` has run.
// VehicleCondition and EuroStandard are new — resolve after the migration is applied.
import {
    Listing,
    FuelType,
    TransmissionType,
    BodyType,
    ListingType,
    ListingStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { SellersService } from '../sellers/sellers.service';
import { ScraperService } from '../scraper/scraper.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { buildListingActivationData } from './listing-activation';
import { brandAdminSeller, brandListingSeller } from './admin-seller-branding';

// ─── Enum mappers ─────────────────────────────────────────────────────────────

// Map DTO enums to Prisma enums
const mapFuelType = (fuel?: DtoFuelType): FuelType | null => {
    if (!fuel) return null;
    const map: Record<DtoFuelType, FuelType> = {
        [DtoFuelType.PETROL]: 'PETROL',
        [DtoFuelType.DIESEL]: 'DIESEL',
        [DtoFuelType.ELECTRIC]: 'ELECTRIC',
        [DtoFuelType.HYBRID]: 'HYBRID',
        [DtoFuelType.PLUGIN_HYBRID]: 'PLUGIN_HYBRID',
        [DtoFuelType.LPG]: 'LPG',
        [DtoFuelType.HYDROGEN_CELL]: 'HYDROGEN_CELL',
        [DtoFuelType.BI_FUEL]: 'BI_FUEL',
        [DtoFuelType.NATURAL_GAS]: 'NATURAL_GAS',
        [DtoFuelType.PETROL_HYBRID]: 'PETROL_HYBRID',
        [DtoFuelType.DIESEL_HYBRID]: 'DIESEL_HYBRID',
        [DtoFuelType.PETROL_PLUGIN_HYBRID]: 'PETROL_PLUGIN_HYBRID',
        [DtoFuelType.DIESEL_PLUGIN_HYBRID]: 'DIESEL_PLUGIN_HYBRID',
        [DtoFuelType.UNLISTED]: 'UNLISTED',
    };
    return map[fuel];
};

const mapTransmission = (trans?: DtoTransmission): TransmissionType | null => {
    if (!trans) return null;
    const map: Record<string, TransmissionType> = {
        MANUAL: 'MANUAL',
        AUTOMATIC: 'AUTOMATIC',
        SEMI_AUTOMATIC: 'SEMI_AUTOMATIC',
        CVT: 'CVT',
    };
    return map[trans] ?? null;
};

const mapBodyType = (body?: DtoBodyType): BodyType | null => {
    if (!body) return null;
    const map: Record<string, BodyType> = {
        SEDAN: 'SEDAN',
        SUV: 'SUV',
        HATCHBACK: 'HATCHBACK',
        COUPE: 'COUPE',
        CONVERTIBLE: 'CONVERTIBLE',
        ESTATE: 'ESTATE',
        CROSSOVER: 'CROSSOVER',
        SPORTS_CAR: 'SPORTS_CAR',
        MINIVAN: 'MINIVAN',
        PICKUP_TRUCK: 'PICKUP_TRUCK',
        STATION_WAGON: 'STATION_WAGON',
        MPV: 'MPV',
        VAN: 'VAN',
    };
    return map[body] ?? null;
};

@Injectable()
export class ListingsService {
    private readonly logger = new Logger(ListingsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly sellersService: SellersService,
        private readonly config: ConfigService,
        private readonly scraper: ScraperService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    /**
     * Notify a seller in-app + by email that their listing was submitted and is
     * awaiting admin review. Best-effort — failures here must never block the
     * status transition that triggered them.
     */
    private async notifySubmittedForReview(listing: { id: string; title: string; sellerId?: string | null }) {
        if (!listing.sellerId) return;
        try {
            const seller = await this.prisma.user.findUnique({
                where: { id: listing.sellerId },
                select: { email: true, firstName: true },
            });
            const notification = await this.notificationsService.create({
                userId: listing.sellerId,
                type: 'LISTING_SUBMITTED',
                title: 'Listing Submitted for Review',
                message: `"${listing.title}" has been submitted and is awaiting admin review before it goes live.`,
                link: '/dashboard/seller/listings',
                entityType: 'Listing',
                entityId: listing.id,
                actionType: 'SUBMITTED',
            }).catch(() => null);
            if (notification) {
                this.notificationsGateway.sendNotification(listing.sellerId, notification);
            }
        } catch {
            // best-effort only
        }
    }

    /**
     * Generate a URL-friendly slug from title + short UUID
     * Example: "Audi Q7 2015" -> "audi-q7-2015-x8d2"
     */
    private generateSlug(title: string): string {
        const baseSlug = title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '') // Remove special chars
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-'); // Replace multiple hyphens with single

        const uniqueSuffix = randomBytes(2).toString('hex'); // 4 char hex
        return `${baseSlug}-${uniqueSuffix}`;
    }

    /**
     * Re-hosts external images to Supabase Storage
     */
    private async rehostImage(url: string): Promise<string> {
        if (!url || url.includes('supabase.co')) return url;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            
            if (!supabaseUrl || !supabaseKey) return url;

            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(supabaseUrl, supabaseKey);

            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
            
            const { error } = await supabase.storage
                .from('listings')
                .upload(fileName, buffer, { contentType: response.headers.get('content-type') || 'image/jpeg' });
            
            if (error) throw error;
            
            return `${supabaseUrl}/storage/v1/object/public/listings/${fileName}`;
        } catch (err) {
            console.error('Failed to re-host image:', err);
            return url; // Fallback to original URL
        }
    }

    /**
     * Geocode a UK location string to lat/lng via OpenStreetMap Nominatim.
     * Returns null silently on any failure — never blocks listing creation.
     */
    private async geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&countrycodes=gb&format=json&limit=1`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Carmazium/1.0 (contact@carmazium.com)' },
                signal: AbortSignal.timeout(5000),
            });
            const data = await res.json();
            if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } catch { /* silent */ }
        return null;
    }

    /**
     * Create a new listing
     * Auto-generates slug and saves Supabase image URLs
     */
    async create(createListingDto: CreateListingDto, userId?: string): Promise<Listing> {
        const slug = this.generateSlug(createListingDto.title);

        const listingType: ListingType = createListingDto.listingType === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED';

        // Auctions are free to list; all classified listings require at minimum BASIC (£1)
        const rawBadgeTier = createListingDto.badgeTier ?? 'BASIC';
        const badgeTier = (rawBadgeTier === 'FREE' && listingType !== 'AUCTION') ? 'BASIC' : rawBadgeTier;
        const isPremium = badgeTier === 'PREMIUM';

        // Every new listing must pass admin review before it can go live — nothing
        // is ever created directly as ACTIVE. Paid tiers start DRAFT (moved to
        // PENDING_REVIEW once payment completes, see publishListing()/the Stripe
        // webhook). FREE tier (auctions) has no payment step, so it goes straight
        // to PENDING_REVIEW unless the caller explicitly asked to save as a DRAFT.
        const listingStatus: ListingStatus = createListingDto.status === 'DRAFT'
            ? 'DRAFT'
            : badgeTier !== 'FREE'
                ? 'DRAFT'
                : 'PENDING_REVIEW';

        // Cat A and Cat B are total-loss / body-salvage write-offs that cannot be
        // re-registered. They may only be listed for auction (parts/scrapping).
        const writeOff = createListingDto.writeOffCategory;
        if ((writeOff === 'CAT_A' || writeOff === 'CAT_B') && listingType === 'CLASSIFIED') {
            throw new BadRequestException(
                'Cat A and Cat B write-offs cannot be listed for retail sale. Switch to an Auction listing to proceed.',
            );
        }

        // Create listing immediately with original image URLs so the endpoint returns fast.
        // Image re-hosting (Supabase upload) runs in the background and updates the record.
        const originalImages = createListingDto.images ?? [];

        const listing = await this.prisma.listing.create({
            data: {
                title: createListingDto.title,
                price: createListingDto.price,
                priceMin: createListingDto.priceMin ?? null,
                priceMax: createListingDto.priceMax ?? null,
                images: originalImages,
                videoUrls: createListingDto.videoUrls ?? [],
                type: listingType,
                status: listingStatus,
                description: createListingDto.description ?? null,
                slug,
                // Vehicle identity
                make: createListingDto.make ?? null,
                model: createListingDto.model ?? null,
                year: createListingDto.year,
                mileage: createListingDto.mileage,
                vrm: createListingDto.vrm ?? null,
                vin: createListingDto.vin ?? null,
                // Technical specs
                fuelType: mapFuelType(createListingDto.fuelType),
                transmission: mapTransmission(createListingDto.transmission),
                color: createListingDto.color ?? null,
                doors: createListingDto.doors ?? null,
                seats: createListingDto.seats ?? null,
                engineSize: createListingDto.engineSize ?? null,
                bhp: createListingDto.bhp ?? null,
                bodyType: mapBodyType(createListingDto.bodyType),
                features: createListingDto.features ?? undefined,
                location: createListingDto.location ?? null,
                // Phase 3: condition & UK compliance
                condition: createListingDto.condition ?? null,
                ulezCompliant: createListingDto.ulezCompliant ?? null,
                euroStandard: createListingDto.euroStandard ?? null,
                // Phase 4: CO2 emissions (from DVLA)
                co2Emissions: createListingDto.co2Emissions ?? null,
                // DVLA extended fields
                motStatus: createListingDto.motStatus ?? null,
                taxStatus: createListingDto.taxStatus ?? null,
                motExpiryDate: createListingDto.motExpiryDate ?? null,
                taxDueDate: createListingDto.taxDueDate ?? null,
                markedForExport: createListingDto.markedForExport ?? null,
                monthOfFirstRegistration: createListingDto.monthOfFirstRegistration ?? null,
                wheelplan: createListingDto.wheelplan ?? null,
                typeApproval: createListingDto.typeApproval ?? null,
                // Phase 7: Badge tier
                badgeTier,
                // Premium tier → auto-activate featured boost (28 days)
                isFeatured: isPremium,
                featuredUntil: isPremium ? new Date(Date.now() + 28 * 24 * 60 * 60 * 1000) : null,
                // Seller
                sellerId: userId ?? null,
                // Vehicle type & import status
                vehicleType: createListingDto.vehicleType ?? 'CAR',
                isImported: createListingDto.isImported ?? false,
                // Legal declarations
                stolenRecovered: createListingDto.stolenRecovered ?? null,
                hasOutstandingFinance: createListingDto.hasOutstandingFinance ?? null,
                isLegalRegisteredKeeper: createListingDto.isLegalRegisteredKeeper ?? null,
                writeOffCategory: createListingDto.writeOffCategory ?? 'NONE',
                // Extended vehicle details
                variant: createListingDto.variant ?? null,
                driveType: createListingDto.driveType ?? null,
                numberOfKeys: createListingDto.numberOfKeys ?? null,
                serviceHistory: createListingDto.serviceHistory ?? null,
                owners: createListingDto.owners ?? null,
                torqueNm: createListingDto.torqueNm ?? null,
                topSpeedMph: createListingDto.topSpeedMph ?? null,
                zeroTo60Mph: createListingDto.zeroTo60Mph ?? null,
                combinedMpg: createListingDto.combinedMpg ?? null,
                extraUrbanMpg: createListingDto.extraUrbanMpg ?? null,
                // Exterior grade is never seller-set — it's computed automatically from
                // marked damage zones (see DamageAnalysisService.saveDamageRecords). A
                // fresh listing with no damage reported yet starts at the best grade.
                exteriorGrade: 1,
                bannerLabel: createListingDto.bannerLabel ?? null,
                // Phase 13: departed/estate sale
                isDepartedSale: createListingDto.isDepartedSale ?? false,
                departedRelationship: createListingDto.departedRelationship ?? null,
                notOwnerRelationship: createListingDto.notOwnerRelationship ?? null,
                // Phase 15: delivery options
                deliveryAvailable: createListingDto.deliveryAvailable ?? false,
                deliveryPricePerMile: createListingDto.deliveryPricePerMile ?? null,
                deliveryMaxMiles: createListingDto.deliveryMaxMiles ?? null,
            },
        });

        // Re-host images in background — non-blocking so the endpoint returns immediately
        if (originalImages.length > 0) {
            Promise.all(originalImages.map(img => this.rehostImage(img)))
                .then(hostedUrls => this.prisma.listing.update({
                    where: { id: listing.id },
                    data: { images: hostedUrls },
                }))
                .catch(err => console.warn(`Image re-host failed for listing ${listing.id}: ${err?.message}`));
        }

        // Geocode location in background — non-blocking
        if (createListingDto.location) {
            this.geocodeLocation(createListingDto.location)
                .then(coords => {
                    if (coords) return this.prisma.listing.update({
                        where: { id: listing.id },
                        data: { latitude: coords.lat, longitude: coords.lng },
                    });
                })
                .catch(() => { /* silent */ });
        }

        // FREE-tier (auction) listings have no payment step, so this create() call
        // is the only signal that the seller has finished submitting — notify them
        // it's now awaiting admin review. Paid tiers get this from publishListing()
        // / the Stripe webhook once payment completes instead.
        if (listingStatus === 'PENDING_REVIEW') {
            this.notifySubmittedForReview({ id: listing.id, title: listing.title, sellerId: userId ?? listing.sellerId }).catch(() => { });
        }

        return listing;
    }

    /**
     * Find all listings with filtering and pagination
     * Automatically excludes soft-deleted items
     */
    async findAll(filterDto: ListingFilterDto): Promise<{ data: Listing[]; total: number }> {
        const {
            minPrice, maxPrice,
            make, model,
            minYear, maxYear, year,  // year is deprecated alias for minYear
            minMileage, maxMileage,
            fuelType, fuelTypes, transmission, transmissions, bodyType,
            color, minDoors, minSeats,
            minEngine, maxEngine, maxCo2,
            conditions, ulezCompliant, euroStandard,
            isImported, markedForExport,
            vehicleType,
            minBhp, maxBhp,
            sellerType, location, listingType,
            sortBy, search, features,
            page = 1, limit = 20,
        } = filterDto;
        const where: any = { deletedAt: null, status: { in: ['ACTIVE', 'SOLD', 'OFFER_ACCEPTED'] } };

        // ─── Price range ────────────────────────────────────────────────────
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {};
            if (minPrice !== undefined) where.price.gte = minPrice;
            if (maxPrice !== undefined) where.price.lte = maxPrice;
        }

        // ─── Make / Model ───────────────────────────────────────────────────
        if (make) where.make = { contains: make, mode: 'insensitive' };
        if (model) where.model = { contains: model, mode: 'insensitive' };

        // ─── Year range ─────────────────────────────────────────────────────
        const effectiveMinYear = minYear ?? year; // backwards-compat alias
        if (effectiveMinYear !== undefined || maxYear !== undefined) {
            where.year = {};
            if (effectiveMinYear !== undefined) where.year.gte = effectiveMinYear;
            if (maxYear !== undefined) where.year.lte = maxYear;
        }

        // ─── Mileage range ──────────────────────────────────────────────────
        if (minMileage !== undefined || maxMileage !== undefined) {
            where.mileage = {};
            if (minMileage !== undefined) where.mileage.gte = minMileage;
            if (maxMileage !== undefined) where.mileage.lte = maxMileage;
        }

        // ─── Enum filters ───────────────────────────────────────────────────
        // fuelTypes (array) takes precedence over single fuelType for multi-select support
        if (fuelTypes?.length) where.fuelType = { in: fuelTypes };
        else if (fuelType) where.fuelType = fuelType;
        if (transmissions?.length) where.transmission = { in: transmissions };
        else if (transmission) where.transmission = transmission;
        if (bodyType) where.bodyType = bodyType;
        if (conditions?.length) where.condition = { in: conditions };
        if (euroStandard) where.euroStandard = euroStandard;
        if (vehicleType) where.vehicleType = vehicleType;

        // ─── Features (JSON array contains) ─────────────────────────────────
        // Filter listings where the JSON features array contains ALL requested features
        if (features?.length) where.features = { array_contains: features };

        // ─── Colour (case-insensitive) ──────────────────────────────────────
        if (color) where.color = { contains: color, mode: 'insensitive' };

        // ─── Door / Seat minimums ────────────────────────────────────────────
        if (minDoors !== undefined) where.doors = { gte: minDoors };
        if (minSeats !== undefined) where.seats = { gte: minSeats };

        // ─── Engine capacity (cc) ────────────────────────────────────────────
        if (minEngine !== undefined || maxEngine !== undefined) {
            where.engineCapacity = {};
            if (minEngine !== undefined) where.engineCapacity.gte = minEngine;
            if (maxEngine !== undefined) where.engineCapacity.lte = maxEngine;
        }

        // ─── CO₂ ceiling ─────────────────────────────────────────────────────
        if (maxCo2 !== undefined) where.co2Emissions = { lte: maxCo2 };

        // ─── Boolean compliance filter ───────────────────────────────────────
        if (ulezCompliant !== undefined) where.ulezCompliant = ulezCompliant;

        // ─── Imported / Export status ────────────────────────────────────────
        if (isImported !== undefined) where.isImported = isImported;
        if (markedForExport !== undefined) where.markedForExport = markedForExport;

        // ─── Delivery availability ────────────────────────────────────────────
        if (filterDto.deliveryAvailable !== undefined) {
            where.deliveryAvailable = filterDto.deliveryAvailable;
        }

        // ─── BHP / Power range ───────────────────────────────────────────────
        if (minBhp !== undefined || maxBhp !== undefined) {
            where.bhp = {};
            if (minBhp !== undefined) where.bhp.gte = minBhp;
            if (maxBhp !== undefined) where.bhp.lte = maxBhp;
        }

        // ─── Seller type ─────────────────────────────────────────────────────
        if (sellerType === 'DEALER') {
            where.seller = { role: 'DEALER' };
        } else if (sellerType === 'PRIVATE') {
            where.seller = { role: { in: ['BUYER', 'SELLER'] } };
        }

        // ─── Location text search ────────────────────────────────────────────
        if (location) where.location = { contains: location, mode: 'insensitive' };

        // ─── Listing type ────────────────────────────────────────────────────
        // Auction listings must never appear in the public retail search.
        // They live exclusively in /auctions. Only return CLASSIFIED listings
        // unless the caller explicitly requests AUCTION type.
        if (listingType) {
            where.type = listingType;
        } else {
            where.type = 'CLASSIFIED';
        }

        // ─── Full-text search ────────────────────────────────────────────────
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { make: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
            ];
        }

        // ─── Sort ────────────────────────────────────────────────────────────
        // Active listings always appear before SOLD ones (status: 'asc' puts ACTIVE before SOLD).
        // Featured listings appear first, then the selected sort.
        let orderBy: any[] = [{ status: 'asc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }];
        if (sortBy === 'price_asc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { price: 'asc' }];
        else if (sortBy === 'price_desc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { price: 'desc' }];
        else if (sortBy === 'mileage_asc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { mileage: 'asc' }];
        else if (sortBy === 'mileage_desc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { mileage: 'desc' }];
        else if (sortBy === 'year_desc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { year: 'desc' }];
        else if (sortBy === 'year_asc') orderBy = [{ status: 'asc' }, { isFeatured: 'desc' }, { year: 'asc' }];

        const skip = (page - 1) * limit;

        // Execute query with count
        const [data, total] = await Promise.all([
            this.prisma.listing.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    seller: {
                        select: {
                            id: true,
                            role: true,
                            firstName: true,
                            lastName: true,
                            sellerProfile: {
                                select: {
                                    reliabilityScore: true
                                }
                            }
                        }
                    },
                    // A result row carries `type: 'AUCTION'` but previously nothing
                    // that identified *which* auction, so no client could route an
                    // auction result to its auction — mobile opened every result in
                    // the retail detail screen, and web links every result to
                    // /buy-cars/[slug] for the same reason (BUY-017). There is no
                    // by-listing auction endpoint to look it up with either.
                    // Scalars only, no bids, so this adds one join and no N+1.
                    auction: {
                        select: { id: true, status: true, endTime: true },
                    },
                }
            }),
            this.prisma.listing.count({ where }),
        ]);

        // Admin-created listings are presented as CarMazium's own rather than
        // under the staff member's personal name — see admin-seller-branding.ts.
        return { data: data.map((l: any) => brandListingSeller(l)) as Listing[], total };
    }

    /**
     * Get currently featured listings (isFeatured = true, not expired)
     * Used for homepage carousel and "Featured" sections
     */
    async getFeaturedListings(limit = 8): Promise<Listing[]> {
        return this.prisma.listing.findMany({
            where: {
                deletedAt: null,
                status: 'ACTIVE',
                type: 'CLASSIFIED', // Auction listings never appear in featured retail sections
                isFeatured: true,
                featuredUntil: { gt: new Date() },
            },
            orderBy: { featuredUntil: 'desc' },
            take: limit,
            include: {
                seller: {
                    select: {
                        id: true,
                        role: true,
                        firstName: true,
                        lastName: true,
                        sellerProfile: {
                            select: { reliabilityScore: true },
                        },
                    },
                },
                hpiReport: {
                    select: { isClear: true }
                },
            },
        }) as Promise<Listing[]>;
    }

    /**
     * Find a single listing by slug (SEO-friendly) or ID.
     * `viewerId` is only present when the caller is authenticated (via
     * OptionalSessionAuthGuard) — used to gate the seller's phone number so
     * anonymous visitors never receive it in the response payload.
     */
    async findBySlug(slugOrId: string, viewerId?: string): Promise<Listing> {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);

        const listing = await this.prisma.listing.findFirst({
            where: {
                ...(isUuid ? { id: slugOrId } : { slug: slugOrId }),
                deletedAt: null,
            },
            include: {
                seller: {
                    // NOTE: explicit `select` (not `include`) — this is a public
                    // endpoint and must never leak passwordHash or other
                    // sensitive User columns to anonymous callers.
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        profileImage: true,
                        role: true,
                        phone: true,
                        createdAt: true,
                        sellerProfile: {
                            include: {
                                reviews: {
                                    take: 5,
                                    orderBy: { createdAt: 'desc' },
                                    include: {
                                        reviewer: {
                                            select: {
                                                firstName: true,
                                                lastName: true,
                                                profileImage: true
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        dealerProfile: true,
                        _count: {
                            select: {
                                listings: {
                                    where: { status: 'ACTIVE', deletedAt: null }
                                }
                            }
                        }
                    }
                },
                // Include the most recent offer so the buyer can see their offer status
                offers: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        message: true,
                        buyerId: true,
                        createdAt: true,
                    },
                },
                hpiReport: {
                    // `status` lets the buyer-facing page only show the "View
                    // Report" entry point once one has actually been requested
                    // — without it every listing showed the button regardless
                    // of whether the seller ever paid for a report at all.
                    select: { status: true, isClear: true, purchasedAt: true }
                },
                damageRecords: {
                    orderBy: { createdAt: 'asc' },
                },
                // This listing's own auction (not to be confused with linkedListing.auction
                // below, which is a *different* listing's auction for dual-channel cross-
                // linking) — needed for the auction-buyer-fee checkout page (winning bid,
                // auction reference).
                auction: {
                    select: {
                        id: true,
                        status: true,
                        reservePrice: true,
                        startTime: true,
                        endTime: true,
                        winnerId: true,
                        winningBidAmount: true,
                        buyItNowPrice: true,
                        buyItNowPendingBuyerId: true,
                    },
                },
                linkedListing: {
                    select: {
                        id: true,
                        type: true,
                        auction: {
                            select: { id: true, status: true, endTime: true },
                        },
                    },
                },
            }
        });

        if (!listing) {
            throw new NotFoundException(`Listing with slug/id "${slugOrId}" not found`);
        }

        // Fire-and-forget strictly incrementing the viewCount logic
        this.prisma.listing.update({
            where: { id: listing.id },
            data: { viewCount: { increment: 1 } },
        }).catch(err => console.error(`Failed to increment views for ${slugOrId}:`, err));

        // Map _count to listingCount on seller
        let sellerWithCount: any = listing.seller
            ? { ...listing.seller, listingCount: (listing.seller as any)._count?.listings ?? 0 }
            : listing.seller

        // Gate contact phone numbers behind login — anonymous visitors get a
        // `phoneAvailable` boolean instead of the real number so the frontend
        // can render a "log in to view" blurred placeholder.
        if (sellerWithCount) {
            const hasPersonalPhone = !!sellerWithCount.phone;
            const hasDealerPhone = !!sellerWithCount.dealerProfile?.phone;

            sellerWithCount = {
                ...sellerWithCount,
                phone: viewerId ? sellerWithCount.phone : null,
                phoneAvailable: hasPersonalPhone,
                ...(sellerWithCount.dealerProfile ? {
                    dealerProfile: {
                        ...sellerWithCount.dealerProfile,
                        phone: viewerId ? sellerWithCount.dealerProfile.phone : null,
                        phoneAvailable: hasDealerPhone,
                    },
                } : {}),
            };
        }

        const listingWithCount = { ...listing, seller: brandAdminSeller(sellerWithCount as any) }

        return listingWithCount as any;
    }

    /**
     * Find a single listing by ID (for updates/deletes)
     */
    async findById(id: string): Promise<Listing> {
        const listing = await this.prisma.listing.findUnique({
            where: { id },
        });

        if (!listing || listing.deletedAt) {
            throw new NotFoundException(`Listing with ID "${id}" not found`);
        }

        return listing;
    }

    /**
     * Update a listing
     * Includes ownership check - only the seller can update
     */
    async update(
        id: string,
        userId: string,
        updateListingDto: UpdateListingDto,
    ): Promise<Listing> {
        // First, fetch the listing to verify ownership
        const listing = await this.findById(id);

        // Ownership check (skip if no sellerId - for development)
        if (listing.sellerId && listing.sellerId !== userId) {
            throw new ForbiddenException('You do not have permission to update this listing');
        }

        // Build update data with proper type mapping
        const updateData: any = {};

        if (updateListingDto.title) updateData.title = updateListingDto.title;
        if (updateListingDto.price) updateData.price = updateListingDto.price;
        if (updateListingDto.priceMin !== undefined) updateData.priceMin = updateListingDto.priceMin ?? null;
        if (updateListingDto.priceMax !== undefined) updateData.priceMax = updateListingDto.priceMax ?? null;
        if (updateListingDto.description !== undefined) updateData.description = updateListingDto.description;
        if (updateListingDto.images) updateData.images = updateListingDto.images;
        if (updateListingDto.videoUrls !== undefined) updateData.videoUrls = updateListingDto.videoUrls;
        if (updateListingDto.make) updateData.make = updateListingDto.make;
        if (updateListingDto.model) updateData.model = updateListingDto.model;
        if (updateListingDto.year) updateData.year = updateListingDto.year;
        if (updateListingDto.mileage) updateData.mileage = updateListingDto.mileage;
        if (updateListingDto.vrm) updateData.vrm = updateListingDto.vrm;
        if (updateListingDto.fuelType) updateData.fuelType = mapFuelType(updateListingDto.fuelType);
        if (updateListingDto.transmission) updateData.transmission = mapTransmission(updateListingDto.transmission);
        if (updateListingDto.status) {
            updateData.status = updateListingDto.status === 'ACTIVE' ? 'ACTIVE' :
                updateListingDto.status === 'SOLD' ? 'SOLD' : 'DRAFT';
        }
        if (updateListingDto.listingType) {
            const targetType = updateListingDto.listingType === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED';
            if (listing.type === 'AUCTION' && targetType === 'CLASSIFIED') {
                throw new BadRequestException(
                    'Retail requires a new listing and a fresh HPI/history report. Create a new Retail Listing instead of converting this Auction listing.',
                );
            }
            updateData.type = targetType;
        }
        // DVLA extended fields
        if (updateListingDto.motStatus !== undefined) updateData.motStatus = updateListingDto.motStatus;
        if (updateListingDto.taxStatus !== undefined) updateData.taxStatus = updateListingDto.taxStatus;
        if (updateListingDto.motExpiryDate !== undefined) updateData.motExpiryDate = updateListingDto.motExpiryDate;
        if (updateListingDto.taxDueDate !== undefined) updateData.taxDueDate = updateListingDto.taxDueDate;
        if (updateListingDto.markedForExport !== undefined) updateData.markedForExport = updateListingDto.markedForExport;
        if (updateListingDto.monthOfFirstRegistration !== undefined) updateData.monthOfFirstRegistration = updateListingDto.monthOfFirstRegistration;
        if (updateListingDto.wheelplan !== undefined) updateData.wheelplan = updateListingDto.wheelplan;
        if (updateListingDto.typeApproval !== undefined) updateData.typeApproval = updateListingDto.typeApproval;
        if (updateListingDto.stolenRecovered !== undefined) updateData.stolenRecovered = updateListingDto.stolenRecovered;
        if (updateListingDto.hasOutstandingFinance !== undefined) updateData.hasOutstandingFinance = updateListingDto.hasOutstandingFinance;
        if (updateListingDto.isLegalRegisteredKeeper !== undefined) updateData.isLegalRegisteredKeeper = updateListingDto.isLegalRegisteredKeeper;
        if (updateListingDto.writeOffCategory !== undefined) {
            // Enforce the auction-only rule on update too
            const targetType = updateListingDto.listingType
                ? (updateListingDto.listingType === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED')
                : listing.type;
            if ((updateListingDto.writeOffCategory === 'CAT_A' || updateListingDto.writeOffCategory === 'CAT_B') && targetType === 'CLASSIFIED') {
                throw new BadRequestException(
                    'Cat A and Cat B write-offs cannot be listed for retail sale. Switch to an Auction listing to proceed.',
                );
            }
            updateData.writeOffCategory = updateListingDto.writeOffCategory;
        }
        // Extended vehicle details
        if (updateListingDto.variant !== undefined) updateData.variant = updateListingDto.variant;
        if (updateListingDto.driveType !== undefined) updateData.driveType = updateListingDto.driveType;
        if (updateListingDto.numberOfKeys !== undefined) updateData.numberOfKeys = updateListingDto.numberOfKeys;
        if (updateListingDto.serviceHistory !== undefined) updateData.serviceHistory = updateListingDto.serviceHistory;
        if (updateListingDto.owners !== undefined) updateData.owners = updateListingDto.owners;
        if (updateListingDto.torqueNm !== undefined) updateData.torqueNm = updateListingDto.torqueNm;
        if (updateListingDto.topSpeedMph !== undefined) updateData.topSpeedMph = updateListingDto.topSpeedMph;
        if (updateListingDto.zeroTo60Mph !== undefined) updateData.zeroTo60Mph = updateListingDto.zeroTo60Mph;
        if (updateListingDto.combinedMpg !== undefined) updateData.combinedMpg = updateListingDto.combinedMpg;
        if (updateListingDto.extraUrbanMpg !== undefined) updateData.extraUrbanMpg = updateListingDto.extraUrbanMpg;
        // exteriorGrade is intentionally not settable here — it's computed automatically
        // from damage records (see DamageAnalysisService.saveDamageRecords).
        if (updateListingDto.bannerLabel !== undefined) updateData.bannerLabel = updateListingDto.bannerLabel;
        // Phase 13: departed/estate sale
        if (updateListingDto.isDepartedSale !== undefined) updateData.isDepartedSale = updateListingDto.isDepartedSale;
        if (updateListingDto.departedRelationship !== undefined) updateData.departedRelationship = updateListingDto.departedRelationship ?? null;
        if (updateListingDto.notOwnerRelationship !== undefined) updateData.notOwnerRelationship = updateListingDto.notOwnerRelationship ?? null;
        // Phase 15: delivery options
        if (updateListingDto.deliveryAvailable !== undefined) updateData.deliveryAvailable = updateListingDto.deliveryAvailable;
        if (updateListingDto.deliveryPricePerMile !== undefined) updateData.deliveryPricePerMile = updateListingDto.deliveryPricePerMile ?? null;
        if (updateListingDto.deliveryMaxMiles !== undefined) updateData.deliveryMaxMiles = updateListingDto.deliveryMaxMiles ?? null;

        // Update the listing
        const updatedListing = await this.prisma.listing.update({
            where: { id },
            data: updateData,
        });

        // Re-geocode if location changed
        if (updateListingDto.location && updateListingDto.location !== listing.location) {
            this.geocodeLocation(updateListingDto.location)
                .then(coords => {
                    if (coords) return this.prisma.listing.update({
                        where: { id },
                        data: { latitude: coords.lat, longitude: coords.lng },
                    });
                })
                .catch(() => { /* silent */ });
        }

        // Phase 2: If status changed to ACTIVE, increment seller's listing count
        if (updateData.status === 'ACTIVE' && updatedListing.sellerId && listing.status !== 'ACTIVE') {
            await this.sellersService.incrementListings(updatedListing.sellerId);
        }

        return updatedListing;
    }

    /**
     * Update listing status
     * Allows specific transitions (Draft -> Active -> Sold/Withdrawn)
     *
     * NOTE: When transitioning to SOLD via this endpoint we ALSO record a Sale row
     * (using listing.price as the sold price) so the earnings/dashboard metrics stay
     * consistent. Sellers wanting to record a different sold price + buyer should
     * use the dedicated `recordSale` endpoint, which is idempotent against this one.
     */
    async updateStatus(
        id: string,
        userId: string,
        status: ListingStatus,
        buyerPostcode?: string,
    ): Promise<Listing> {
        const listing = await this.findById(id);

        if (listing.sellerId && listing.sellerId !== userId) {
            // Allow active dealer staff of the listing's owner to update status as well
            const staffMember = listing.sellerId
                ? await this.prisma.dealerStaff.findFirst({
                    where: {
                        userId,
                        dealerProfile: { userId: listing.sellerId },
                        isActive: true,
                    },
                })
                : null;
            if (!staffMember) {
                throw new ForbiddenException('You do not have permission to update this listing');
            }
        }

        // Going live must always go through payment + admin review (publishListing()
        // then an admin approval) — this generic status endpoint may only relist a
        // listing that has already been through that gate once (i.e. it's currently
        // ACTIVE, SOLD, WITHDRAWN, or OFFER_ACCEPTED). It may never be used to skip
        // review for a brand-new, still-DRAFT, still-PENDING_REVIEW, or REJECTED listing.
        if (status === 'ACTIVE' && !['ACTIVE', 'SOLD', 'WITHDRAWN', 'OFFER_ACCEPTED'].includes(listing.status)) {
            throw new BadRequestException(
                'This listing has not been approved yet. Submit it for review from the listing editor instead.',
            );
        }
        if (status === 'ACTIVE' && listing.type === 'CLASSIFIED' && ['SOLD', 'WITHDRAWN', 'OFFER_ACCEPTED'].includes(listing.status)) {
            throw new BadRequestException(
                'Retail relisting requires a new Retail Listing and a fresh HPI/history report. Create a new listing instead of reactivating this one.',
            );
        }

        // For SOLD transitions we wrap the listing update + Sale insert in a transaction
        // so total earnings can never drift from the listings.status state.
        const isNewSold = status === 'SOLD' && listing.status !== 'SOLD';
        const updated = isNewSold
            ? await this.prisma.$transaction(async (tx) => {
                const next = await tx.listing.update({
                    where: { id },
                    data: { status },
                });
                // Only insert a Sale row if one doesn't already exist for this listing
                // (defensive against double-clicks / race with `recordSale`).
                const existing = await tx.sale.findFirst({ where: { listingId: id } });
                if (!existing) {
                    await tx.sale.create({
                        data: {
                            listingId: id,
                            sellerId: listing.sellerId || userId,
                            buyerId: null,
                            soldPrice: listing.price,
                            buyerPostcode: buyerPostcode ?? null,
                        },
                    });
                }
                return next;
            })
            : await this.prisma.listing.update({
                where: { id },
                data: { status },
            });

        // Phase 2: Increment listing count if status changed TO Active from something else
        if (status === 'ACTIVE' && updated.sellerId && listing.status !== 'ACTIVE') {
            await this.sellersService.incrementListings(updated.sellerId);
        }

        // Phase 2: Increment sales count if marked as SOLD
        if (isNewSold && updated.sellerId) {
            await this.sellersService.incrementSales(updated.sellerId);
        }

        return updated;
    }

    /**
     * Activate a DRAFT listing after verifying a completed LISTING_FEE payment.
     * Safe to call at any time — idempotent if listing is already ACTIVE.
     *
     * Handles two cases:
     *   1. Transaction is COMPLETED (webhook already ran) — activate immediately.
     *   2. Transaction is PENDING with a stripePaymentId (webhook failed/delayed) —
     *      verify directly with Stripe; if paid, mark COMPLETED and activate.
     *
     * Returns { activated: true } or { activated: false, requiresPayment: true }.
     */
    async publishListing(id: string, userId: string): Promise<{ activated: boolean; requiresPayment?: boolean; pendingReview?: boolean }> {
        const listing = await this.findById(id);

        if (!listing || listing.sellerId !== userId) {
            throw new ForbiddenException('You do not have permission to publish this listing');
        }

        // Photo minimum guard — listings require at least 10 images before publishing
        if (listing.images.length < 10) {
            throw new BadRequestException(
                `Listings require at least 10 photos before publishing. You have ${listing.images.length}.`,
            );
        }

        const mandatoryHpi = await this.prisma.hpiReport.findUnique({
            where: { listingId: id },
            select: { id: true, status: true },
        });
        if (!mandatoryHpi) {
            throw new BadRequestException(
                'A HPI/history report request is required before this listing can be submitted for review.',
            );
        }

        // Already active — nothing to do
        if (listing.status === 'ACTIVE') {
            return { activated: true };
        }

        // Already submitted — nothing to do, still waiting on the admin
        if (listing.status === 'PENDING_REVIEW') {
            return { activated: false, pendingReview: true };
        }

        // A REJECTED listing may be resubmitted (the seller has presumably fixed the
        // issue the admin flagged) without paying again, since the fee was already
        // charged the first time.
        if (listing.status !== 'DRAFT' && listing.status !== 'REJECTED') {
            throw new BadRequestException('Only DRAFT or REJECTED listings can be submitted for review');
        }

        // Admins list at any tier without being charged. The tier they picked is
        // kept as-is (it drives badge display and search placement) — only the
        // payment step is skipped, so an admin listing is indistinguishable from
        // a paid one apart from the missing transaction.
        //
        // Enforced here rather than in the wizard on purpose: the frontend calls
        // publishListing() first and only redirects to Stripe when this returns
        // requiresPayment, so returning pendingReview is enough to bypass
        // checkout entirely — and being server-side, a non-admin can't fake it
        // by editing the client.
        const actor = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        const isAdmin = actor?.role === 'ADMIN';

        // Admin listings skip both the fee and the review queue — an admin
        // approving their own listing is a formality, and the review pipeline
        // exists to check other people's submissions.
        //
        // Uses the same activation shape as AdminService.approveListing rather
        // than just setting status: 'ACTIVE', because going live also grants
        // PREMIUM listings their 28-day featured window. Setting the status
        // alone would publish an admin's PREMIUM listing without the placement
        // that tier is supposed to buy.
        //
        // No approval email or notification is sent: those tell a seller that
        // someone reviewed their listing, and here nobody did.
        if (isAdmin) {
            await this.prisma.listing.update({
                where: { id },
                data: buildListingActivationData(listing.badgeTier),
            });
            if (listing.sellerId) {
                await this.sellersService.incrementListings(listing.sellerId).catch(() => { });
            }
            this.logger.log(
                `Listing ${id} published directly by admin ${userId} on the ${listing.badgeTier} tier — no fee, no review`,
            );
            return { activated: true };
        }

        // FREE tier listings have no fee — submit for review directly
        if (listing.badgeTier === 'FREE') {
            await this.prisma.listing.update({ where: { id }, data: { status: 'PENDING_REVIEW', rejectionReason: null } });
            await this.notifySubmittedForReview(listing);
            return { activated: false, pendingReview: true };
        }

        // Find ALL LISTING_FEE transactions for this listing (there may be several if the user
        // attempted payment more than once). Check newest-first — but a newer PENDING session that
        // the user never completed must not shadow an older session they actually paid.
        const transactions = await (this.prisma as any).transaction.findMany({
            where: { listingId: id, type: 'LISTING_FEE' },
            orderBy: { createdAt: 'desc' },
        });

        if (!transactions.length) {
            return { activated: false, requiresPayment: true };
        }

        // Case 1: any transaction already marked COMPLETED
        const completedTx = transactions.find((t: any) => t.status === 'COMPLETED');
        if (completedTx) {
            await this.prisma.listing.update({
                where: { id },
                data: { status: 'PENDING_REVIEW', rejectionReason: null },
            });
            await this.notifySubmittedForReview(listing);
            return { activated: false, pendingReview: true };
        }

        // Case 2: no COMPLETED transaction — verify each PENDING one against Stripe
        // until we find one that was actually paid (webhook-missed scenario).
        let verifiedTxId: string | null = null;
        try {
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
                apiVersion: '2026-02-25.clover',
            });
            for (const tx of transactions) {
                if (!tx.stripePaymentId) continue;
                try {
                    const session = await stripe.checkout.sessions.retrieve(tx.stripePaymentId);
                    if (session.payment_status === 'paid') {
                        // Heal this transaction so future calls are instant
                        await (this.prisma as any).transaction.update({
                            where: { id: tx.id },
                            data: {
                                status: 'COMPLETED',
                                stripePaymentId: (session.payment_intent as string) ?? session.id,
                            },
                        });
                        verifiedTxId = tx.id;
                        break;
                    }
                } catch {
                    // This specific session ID invalid/expired — try next
                }
            }
        } catch {
            // Stripe SDK init failed — fall through to requiresPayment
        }

        if (!verifiedTxId) {
            return { activated: false, requiresPayment: true };
        }

        await this.prisma.listing.update({
            where: { id },
            data: { status: 'PENDING_REVIEW', rejectionReason: null },
        });
        await this.notifySubmittedForReview(listing);

        return { activated: false, pendingReview: true };
    }

    /**
     * Record a final sale for a listing
     * Marks listing as SOLD and creates a Sale record for earnings tracking
     */
    async recordSale(
        id: string,
        userId: string,
        dto: { soldPrice: number; buyerId?: string; buyerName?: string; buyerEmail?: string; buyerPostcode?: string },
    ): Promise<Listing> {
        const listing = await this.findById(id);

        // Authorization: Only the seller or authorized dealer staff can mark as sold
        if (listing.sellerId && listing.sellerId !== userId) {
            // Check dealer staff permissions
            const staffMember = await this.prisma.dealerStaff.findFirst({
                where: { 
                    userId, 
                    dealerProfile: { userId: listing.sellerId },
                    isActive: true 
                }
            });
            if (!staffMember) {
                throw new ForbiddenException('You do not have permission to mark this listing as sold');
            }
        }

        if (listing.status === 'SOLD') {
            throw new BadRequestException('This listing is already marked as sold');
        }

        const effectiveSellerId = listing.sellerId || userId;

        // Atomically set listing SOLD and upsert the Sale record
        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedListing = await tx.listing.update({
                where: { id },
                data: { status: 'SOLD' },
            });

            await tx.sale.upsert({
                where: { listingId: id },
                create: {
                    listingId: id,
                    sellerId: effectiveSellerId,
                    buyerId: dto.buyerId ?? null,
                    buyerName: dto.buyerName ?? null,
                    buyerEmail: dto.buyerEmail ?? null,
                    buyerPostcode: dto.buyerPostcode ?? null,
                    soldPrice: dto.soldPrice,
                },
                update: {
                    sellerId: effectiveSellerId,
                    buyerId: dto.buyerId ?? null,
                    buyerName: dto.buyerName ?? null,
                    buyerEmail: dto.buyerEmail ?? null,
                    buyerPostcode: dto.buyerPostcode ?? null,
                    soldPrice: dto.soldPrice,
                },
            });

            return updatedListing;
        });

        // Increment seller profile stats outside the transaction — a failure here
        // should never roll back the sale that was just committed.
        if (effectiveSellerId) {
            this.sellersService.incrementSales(effectiveSellerId).catch((err) => {
                console.error(`recordSale: incrementSales failed for ${effectiveSellerId}:`, err?.message);
            });
        }

        return updated;
    }

    /**
     * Create a linked CLASSIFIED retail listing alongside an existing AUCTION listing.
     * Copies all vehicle data; the new listing starts as DRAFT pending payment.
     * Returns the new listing's ID so the caller can initiate a Stripe checkout.
     */
    async alsoListRetail(
        listingId: string,
        userId: string,
        dto: { price: number; badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM' },
    ): Promise<{ linkedListingId: string }> {
        const source = await this.findById(listingId);
        if (source.sellerId !== userId) throw new ForbiddenException('You do not own this listing');
        if (source.type !== 'AUCTION') throw new BadRequestException('Source listing must be of type AUCTION');

        // Idempotency: if a linked listing already exists, check its state
        const existingLinkedId = (source as any).linkedListingId as string | null;
        if (existingLinkedId) {
            const existingLinked = await this.prisma.listing.findUnique({
                where: { id: existingLinkedId },
                select: { id: true, status: true },
            });
            if (existingLinked?.status === 'ACTIVE') {
                // Already paid and active — return it so frontend can redirect to pay again if needed
                return { linkedListingId: existingLinkedId };
            }
            // DRAFT + no completed payment — clean up the stale draft so we can start fresh
            if (existingLinked) {
                await this.prisma.listing.update({ where: { id: listingId }, data: { linkedListingId: null } as any });
                await this.prisma.listing.delete({ where: { id: existingLinked.id } });
            }
        }

        const slug = this.generateSlug(source.title);

        const newListing = await this.prisma.listing.create({
            data: {
                title: source.title,
                price: dto.price,
                images: source.images,
                videoUrls: source.videoUrls,
                type: 'CLASSIFIED',
                status: 'DRAFT',
                description: source.description,
                slug,
                make: source.make, model: source.model, year: source.year, mileage: source.mileage,
                vrm: source.vrm, vin: source.vin,
                fuelType: source.fuelType, transmission: source.transmission,
                color: source.color, doors: source.doors, seats: source.seats,
                engineSize: source.engineSize, bhp: source.bhp, bodyType: source.bodyType,
                features: source.features ?? undefined,
                location: source.location, latitude: source.latitude, longitude: source.longitude,
                condition: source.condition, ulezCompliant: source.ulezCompliant,
                euroStandard: source.euroStandard, co2Emissions: source.co2Emissions,
                motStatus: source.motStatus, taxStatus: source.taxStatus,
                motExpiryDate: source.motExpiryDate, taxDueDate: source.taxDueDate,
                markedForExport: source.markedForExport,
                monthOfFirstRegistration: source.monthOfFirstRegistration,
                wheelplan: source.wheelplan, typeApproval: source.typeApproval,
                variant: source.variant, driveType: source.driveType,
                numberOfKeys: source.numberOfKeys, serviceHistory: source.serviceHistory,
                owners: source.owners, torqueNm: source.torqueNm,
                topSpeedMph: source.topSpeedMph, zeroTo60Mph: source.zeroTo60Mph,
                combinedMpg: source.combinedMpg, extraUrbanMpg: source.extraUrbanMpg,
                exteriorGrade: source.exteriorGrade,
                bannerLabel: source.bannerLabel,
                badgeTier: dto.badgeTier,
                sellerId: userId,
                vehicleType: source.vehicleType,
                isImported: source.isImported,
                stolenRecovered: source.stolenRecovered,
                hasOutstandingFinance: source.hasOutstandingFinance,
                isLegalRegisteredKeeper: source.isLegalRegisteredKeeper,
                writeOffCategory: source.writeOffCategory,
                linkedListingId: listingId,
            } as any,
        });

        // Link the source AUCTION listing back to the new retail listing
        await this.prisma.listing.update({
            where: { id: listingId },
            data: { linkedListingId: newListing.id } as any,
        });

        return { linkedListingId: newListing.id };
    }

    /**
     * Create a linked AUCTION listing alongside an existing CLASSIFIED retail listing.
     * Copies all vehicle data; the auction listing is FREE and goes live immediately.
     * Returns the new auction listing ID and the Auction record ID.
     */
    async alsoAuction(
        listingId: string,
        userId: string,
        dto: { startTime: string; reservePrice: number; startingBid: number; minIncrement?: number; buyItNowPrice?: number },
    ): Promise<{ linkedListingId: string; auctionId: string }> {
        const source = await this.findById(listingId);
        if (source.sellerId !== userId) throw new ForbiddenException('You do not own this listing');
        if (source.type !== 'CLASSIFIED') throw new BadRequestException('Source listing must be of type CLASSIFIED');
        if ((source as any).linkedListingId) throw new BadRequestException('This listing already has a linked auction listing');
        const sourceHpi = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (!sourceHpi) throw new BadRequestException('The Retail Listing must have its HPI/history report before it can also be listed at Auction.');
        if (dto.reservePrice > Number(source.price)) {
            throw new BadRequestException(
                `Reserve price (£${dto.reservePrice.toLocaleString('en-GB')}) cannot exceed the retail listing price (£${Number(source.price).toLocaleString('en-GB')}). Lower the reserve or raise the retail price first.`,
            );
        }
        const maxStartingBid = Number(source.price) * 0.7;
        if (dto.startingBid > maxStartingBid) {
            throw new BadRequestException(
                `Starting bid must be at least 30% below the retail listing price of £${Number(source.price).toLocaleString('en-GB')} (max £${maxStartingBid.toLocaleString('en-GB', { maximumFractionDigits: 2 })})`,
            );
        }

        const startTime = new Date(dto.startTime);
        if (isNaN(startTime.getTime()) || startTime.getTime() < Date.now() - 60_000) {
            throw new BadRequestException('Invalid or past startTime');
        }
        const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000); // 24h auction

        const slug = this.generateSlug(source.title);

        const auctionListing = await this.prisma.listing.create({
            data: {
                title: source.title,
                price: source.price,
                images: source.images,
                videoUrls: source.videoUrls,
                type: 'AUCTION',
                status: 'PENDING_REVIEW',
                description: source.description,
                slug,
                make: source.make, model: source.model, year: source.year, mileage: source.mileage,
                vrm: source.vrm, vin: source.vin,
                fuelType: source.fuelType, transmission: source.transmission,
                color: source.color, doors: source.doors, seats: source.seats,
                engineSize: source.engineSize, bhp: source.bhp, bodyType: source.bodyType,
                features: source.features ?? undefined,
                location: source.location, latitude: source.latitude, longitude: source.longitude,
                condition: source.condition, ulezCompliant: source.ulezCompliant,
                euroStandard: source.euroStandard, co2Emissions: source.co2Emissions,
                motStatus: source.motStatus, taxStatus: source.taxStatus,
                motExpiryDate: source.motExpiryDate, taxDueDate: source.taxDueDate,
                markedForExport: source.markedForExport,
                monthOfFirstRegistration: source.monthOfFirstRegistration,
                wheelplan: source.wheelplan, typeApproval: source.typeApproval,
                variant: source.variant, driveType: source.driveType,
                numberOfKeys: source.numberOfKeys, serviceHistory: source.serviceHistory,
                owners: source.owners, torqueNm: source.torqueNm,
                topSpeedMph: source.topSpeedMph, zeroTo60Mph: source.zeroTo60Mph,
                combinedMpg: source.combinedMpg, extraUrbanMpg: source.extraUrbanMpg,
                exteriorGrade: source.exteriorGrade,
                bannerLabel: source.bannerLabel,
                badgeTier: 'FREE',
                sellerId: userId,
                vehicleType: source.vehicleType,
                isImported: source.isImported,
                stolenRecovered: source.stolenRecovered,
                hasOutstandingFinance: source.hasOutstandingFinance,
                isLegalRegisteredKeeper: source.isLegalRegisteredKeeper,
                writeOffCategory: source.writeOffCategory,
                linkedListingId: listingId,
            } as any,
        });

        await this.prisma.hpiReport.create({
            data: {
                listingId: auctionListing.id,
                vrm: sourceHpi.vrm,
                data: sourceHpi.data ?? undefined,
                isClear: sourceHpi.isClear,
                purchasedAt: sourceHpi.purchasedAt,
                transactionId: null,
                status: sourceHpi.status,
                source: sourceHpi.source,
                reportData: sourceHpi.reportData ?? undefined,
                pdfData: sourceHpi.pdfData ?? undefined,
                pdfFileName: sourceHpi.pdfFileName,
                pdfSizeBytes: sourceHpi.pdfSizeBytes,
                pdfUploadedAt: sourceHpi.pdfUploadedAt,
                preparedById: sourceHpi.preparedById,
                preparedAt: sourceHpi.preparedAt,
                reminderSentAt: sourceHpi.reminderSentAt,
            },
        });

        const auction = await this.prisma.auction.create({
            data: {
                listingId: auctionListing.id,
                startTime,
                endTime,
                reservePrice: dto.reservePrice,
                startingBid: dto.startingBid,
                minIncrement: dto.minIncrement ?? 100,
                status: 'SCHEDULED',
                ...(dto.buyItNowPrice ? { buyItNowPrice: dto.buyItNowPrice } : {}),
            },
        });

        // Link the source CLASSIFIED listing back to the new auction listing
        await this.prisma.listing.update({
            where: { id: listingId },
            data: { linkedListingId: auctionListing.id } as any,
        });

        return { linkedListingId: auctionListing.id, auctionId: auction.id };
    }

    /**
     * Soft delete a listing
     * Sets deletedAt to current timestamp
     * Includes ownership check
     */
    async softDelete(id: string, userId: string): Promise<Listing> {
        // First, fetch the listing to verify ownership
        const listing = await this.findById(id);

        // Ownership check (skip if no sellerId - for development)
        if (listing.sellerId && listing.sellerId !== userId) {
            throw new ForbiddenException('You do not have permission to delete this listing');
        }

        // Soft delete by setting deletedAt
        const deletedListing = await this.prisma.listing.update({
            where: { id },
            data: {
                deletedAt: new Date(),
            },
        });

        return deletedListing;
    }

    /**
     * Find all listings belonging to a specific seller
     *
     * By default this excludes SOLD listings so the seller's "Inventory" view stays clean.
     * Pages that need to render offers tied to already-sold listings (e.g. the Offers
     * dashboard, where an accepted offer must remain visible after the sale closes)
     * should pass `includeSold = true`.
     */
    async findMyListings(sellerId: string, filterDto?: ListingFilterDto): Promise<{ data: Listing[]; total: number }> {
        const page = filterDto?.page || 1;
        const limit = filterDto?.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {
            sellerId,
            deletedAt: null,
        };
        if (!filterDto?.includeSold) {
            where.status = { not: 'SOLD' };
        }

        // Apply optional filters
        if (filterDto?.minPrice !== undefined || filterDto?.maxPrice !== undefined) {
            where.price = {};
            if (filterDto.minPrice !== undefined) where.price.gte = filterDto.minPrice;
            if (filterDto.maxPrice !== undefined) where.price.lte = filterDto.maxPrice;
        }

        if (filterDto?.make) {
            where.make = { contains: filterDto.make, mode: 'insensitive' };
        }

        const [data, total] = await Promise.all([
            this.prisma.listing.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { offers: { _count: 'desc' } },
                    { createdAt: 'desc' }
                ],
                include: {
                    hpiReport: true,
                    linkedListing: { select: { id: true, status: true, badgeTier: true } },
                    // Dealer inventory (mobile's DealerInventoryScreen, web's
                    // inventory table) needs real per-listing lead/offer
                    // counts — this endpoint previously only used the offers
                    // relation for sort order (below) without ever selecting
                    // it, so consumers always got 0.
                    _count: { select: { offers: true, leads: true } },
                },
            }),
            this.prisma.listing.count({ where }),
        ]);

        return { data, total };
    }

    /**
     * Resolve the effective dealership owner ID for a given user.
     * If the user is active dealer staff, returns the dealership owner's userId
     * so all aggregations (revenue, listings) reflect the dealership as a unit.
     */
    private async resolveOwnerId(userId: string): Promise<string> {
        try {
            const staffRecord = await this.prisma.dealerStaff.findFirst({
                where: { userId, isActive: true },
                select: { dealerProfile: { select: { userId: true } } },
            });
            if (staffRecord?.dealerProfile?.userId) {
                return staffRecord.dealerProfile.userId;
            }
        } catch {
            // Fall through and return the original userId on any lookup failure
        }
        return userId;
    }

    /**
     * Get seller dashboard statistics
     *
     * Total revenue is sourced from `Sale.soldPrice` (the canonical earnings table),
     * not from `Listing.price`, so the metric stays consistent with the unified
     * dashboard and the earnings page.
     */
    async getSellerStats(userId: string): Promise<{
        totalListings: number;
        activeListings: number;
        soldListings: number;
        draftListings: number;
        totalViews: number;
        totalRevenue: number;
    }> {
        const sellerId = await this.resolveOwnerId(userId);
        const baseWhere = { sellerId, deletedAt: null };

        const [totalListings, activeListings, soldListings, draftListings, viewsAggregate, salesAggregate] = await Promise.all([
            this.prisma.listing.count({ where: baseWhere }),
            this.prisma.listing.count({ where: { ...baseWhere, status: 'ACTIVE' } }),
            this.prisma.listing.count({ where: { ...baseWhere, status: 'SOLD' } }),
            this.prisma.listing.count({ where: { ...baseWhere, status: 'DRAFT' } }),
            this.prisma.listing.aggregate({
                where: baseWhere,
                _sum: { viewCount: true },
            }),
            this.prisma.sale.aggregate({
                where: { sellerId },
                _sum: { soldPrice: true },
            }),
        ]);

        return {
            totalListings,
            activeListings,
            soldListings,
            draftListings,
            totalViews: viewsAggregate._sum.viewCount || 0,
            totalRevenue: Number(salesAggregate._sum.soldPrice || 0),
        };
    }

    /**
     * Get seller performance analytics
     * Returns metrics + per-listing view data for charts
     *
     * Revenue is sourced from the `Sale` table for consistency with other dashboards.
     */
    async getSellerPerformance(userId: string) {
        const sellerId = await this.resolveOwnerId(userId);
        const baseWhere = { sellerId, deletedAt: null };

        const [totalListings, soldCount, viewsAggregate, recentListings, salesAggregate, sellerProfile, reviewAggregate, respondedOffers] = await Promise.all([
            this.prisma.listing.count({ where: baseWhere }),
            this.prisma.listing.count({ where: { ...baseWhere, status: 'SOLD' } }),
            this.prisma.listing.aggregate({
                where: baseWhere,
                _sum: { viewCount: true },
            }),
            this.prisma.listing.findMany({
                where: baseWhere,
                select: { id: true, title: true, viewCount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 12,
            }),
            this.prisma.sale.aggregate({
                where: { sellerId },
                _sum: { soldPrice: true },
            }),
            this.prisma.sellerProfile.findUnique({
                where: { userId: sellerId },
                select: { reliabilityScore: true, avgResponseHours: true },
            }),
            this.prisma.sellerReview.aggregate({
                where: { sellerProfile: { userId: sellerId } },
                _avg: { rating: true },
                _count: { id: true },
            }),
            // Offers where the seller actually responded — used to compute avg response time
            this.prisma.offer.findMany({
                where: {
                    listing: { sellerId, deletedAt: null },
                    status: { in: ['ACCEPTED', 'REJECTED', 'COUNTERED'] },
                },
                select: { createdAt: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take: 100,
            }),
        ]);

        const totalViews = viewsAggregate._sum.viewCount || 0;
        const conversionRate = totalViews > 0
            ? ((soldCount / totalViews) * 100).toFixed(1)
            : '0.0';

        // Prefer stored avgResponseHours; calculate live from offer latency as fallback
        let avgResponseHours: number | null = sellerProfile?.avgResponseHours ?? null;
        if (avgResponseHours === null && respondedOffers.length > 0) {
            const totalMs = respondedOffers.reduce(
                (sum, o) => sum + (o.updatedAt.getTime() - o.createdAt.getTime()), 0
            );
            avgResponseHours = parseFloat(
                (totalMs / respondedOffers.length / (1000 * 60 * 60)).toFixed(1)
            );
        }

        const sellerRating = reviewAggregate._avg.rating != null
            ? parseFloat(reviewAggregate._avg.rating.toFixed(1))
            : null;
        const totalReviews = reviewAggregate._count.id ?? 0;

        return {
            totalRevenue: Number(salesAggregate._sum.soldPrice || 0),
            totalViews,
            totalListings,
            conversionRate: parseFloat(conversionRate),
            recentListingViews: recentListings.map(l => ({
                id: l.id,
                title: l.title,
                views: l.viewCount,
                date: l.createdAt,
            })),
            avgResponseHours,
            sellerRating,
            totalReviews,
        };
    }

    /**
     * Get earnings history for a seller or dealer
     */
    async getEarnings(userId: string, page = 1, limit = 20) {
        // Handle staff/owner logic
        let targetOwnerId = userId;
        const staffRecord = await this.prisma.dealerStaff.findFirst({
            where: { userId, isActive: true },
            select: { dealerProfile: { select: { userId: true } } }
        });
        if (staffRecord) {
            targetOwnerId = staffRecord.dealerProfile.userId;
        }

        const skip = (page - 1) * limit;
        const where = { sellerId: targetOwnerId };

        const [sales, totalSales, revenueAgg] = await Promise.all([
            this.prisma.sale.findMany({
                where,
                include: {
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            images: true,
                            vrm: true,
                            price: true,
                            status: true,
                            offers: {
                                orderBy: { createdAt: 'desc' },
                                take: 10,
                                select: {
                                    id: true,
                                    amount: true,
                                    initialAmount: true,
                                    counterAmount: true,
                                    sellerCounterAmount: true,
                                    buyerCounterAmount: true,
                                    finalAmount: true,
                                    status: true,
                                    createdAt: true,
                                    buyer: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true,
                                        }
                                    }
                                }
                            }
                        }
                    },
                    buyer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.sale.count({ where }),
            this.prisma.sale.aggregate({ where, _sum: { soldPrice: true } }),
        ]);

        // Auctions the seller has actually been paid out on — sellerBonusReleased is
        // only ever set true once an admin has approved the handover proof, so this
        // can't include auctions that are still mid-handover or were denied/refunded.
        // The vehicle price itself (winningBidAmount) is settled directly between
        // buyer and seller — Carmazium never processes that payment — but retail
        // Sale.soldPrice is the same kind of self-reported figure, so counting both
        // the same way in totalRevenue keeps "how much business have I done here"
        // accurate across both channels. The £100 bonus is the only amount Carmazium
        // itself actually paid out, tracked separately so that distinction stays clear.
        const AUCTION_SELLER_BONUS = 100;
        const auctionWhere = {
            listing: { sellerId: targetOwnerId },
            status: 'ENDED' as const,
            winnerId: { not: null },
            sellerBonusReleased: true,
            deletedAt: null,
        };
        const auctionSalesRaw = await this.prisma.auction.findMany({
            where: auctionWhere,
            include: {
                listing: { select: { id: true, title: true, images: true, vrm: true } },
                winner: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
            orderBy: { sellerBonusReleasedAt: 'desc' },
        });

        const totalAuctionSales = auctionSalesRaw.length;
        const totalAuctionRevenue = auctionSalesRaw.reduce((sum, a) => sum + Number(a.winningBidAmount ?? 0), 0);
        const totalAuctionBonus = totalAuctionSales * AUCTION_SELLER_BONUS;

        const auctionSales = auctionSalesRaw.map(a => ({
            id: a.id,
            listingId: a.listingId,
            winningBidAmount: Number(a.winningBidAmount ?? 0),
            sellerBonus: AUCTION_SELLER_BONUS,
            sellerBonusReleasedAt: a.sellerBonusReleasedAt,
            createdAt: a.sellerBonusReleasedAt ?? a.updatedAt,
            listing: a.listing,
            winner: a.winner,
        }));

        const totalRevenue = Number(revenueAgg._sum.soldPrice ?? 0) + totalAuctionRevenue;

        return {
            sales,
            totalRevenue,
            totalSales: totalSales + totalAuctionSales,
            auctionSales,
            totalAuctionRevenue,
            totalAuctionSales,
            totalAuctionBonus,
            page,
            totalPages: Math.ceil(totalSales / limit),
        };
    }

    /**
     * Scrape an external listing URL and return extracted data for user review.
     * Nothing is saved — this is a preview-only endpoint.
     */
    async previewImport(url: string) {
        return this.scraper.scrape(url);
    }

    /**
     * Import a listing from an external platform URL.
     * Creates a DRAFT CLASSIFIED listing owned by the requesting user.
     * The user must still go through the normal listing payment flow to activate it.
     */
    async importFromUrl(
        url: string,
        userId: string,
        overrides: {
            price: number;
            vrm: string;
            badgeTier?: string;
            title?: string;
        },
    ): Promise<Listing> {
        const scraped = await this.scraper.scrape(url);

        const title = overrides.title ?? scraped.title ?? 'Imported Listing';
        const slug = this.generateSlug(title);

        const fuelMap: Record<string, FuelType> = {
            PETROL: 'PETROL', DIESEL: 'DIESEL', ELECTRIC: 'ELECTRIC',
            HYBRID: 'HYBRID', PLUGIN_HYBRID: 'PLUGIN_HYBRID', LPG: 'LPG', HYDROGEN_CELL: 'HYDROGEN_CELL',
            BI_FUEL: 'BI_FUEL', NATURAL_GAS: 'NATURAL_GAS',
            PETROL_HYBRID: 'PETROL_HYBRID', DIESEL_HYBRID: 'DIESEL_HYBRID',
            PETROL_PLUGIN_HYBRID: 'PETROL_PLUGIN_HYBRID', DIESEL_PLUGIN_HYBRID: 'DIESEL_PLUGIN_HYBRID',
            UNLISTED: 'UNLISTED',
        };
        const transMap: Record<string, TransmissionType> = {
            MANUAL: 'MANUAL', AUTOMATIC: 'AUTOMATIC', SEMI_AUTOMATIC: 'SEMI_AUTOMATIC', CVT: 'CVT',
        };
        const bodyMap: Record<string, BodyType> = {
            SEDAN: 'SEDAN', SUV: 'SUV', HATCHBACK: 'HATCHBACK', COUPE: 'COUPE',
            CONVERTIBLE: 'CONVERTIBLE', ESTATE: 'ESTATE', CROSSOVER: 'CROSSOVER',
            SPORTS_CAR: 'SPORTS_CAR', MINIVAN: 'MINIVAN', PICKUP_TRUCK: 'PICKUP_TRUCK',
            STATION_WAGON: 'STATION_WAGON', MPV: 'MPV', VAN: 'VAN',
        };

        const badgeTier = overrides.badgeTier ?? 'BASIC';

        const listing = await this.prisma.listing.create({
            data: {
                title,
                price: overrides.price,
                images: scraped.images,
                type: 'CLASSIFIED',
                status: 'DRAFT',
                slug,
                description: scraped.description ?? null,
                make: scraped.make ?? null,
                model: scraped.model ?? null,
                year: scraped.year ?? null,
                mileage: scraped.mileage ?? null,
                vrm: overrides.vrm,
                vin: scraped.vin ?? null,
                fuelType: scraped.fuelType ? (fuelMap[scraped.fuelType] ?? null) : null,
                transmission: scraped.transmission ? (transMap[scraped.transmission] ?? null) : null,
                color: scraped.color ?? null,
                doors: scraped.doors ?? null,
                engineSize: scraped.engineSize ?? null,
                bhp: scraped.bhp ?? null,
                bodyType: scraped.bodyType ? (bodyMap[scraped.bodyType] ?? null) : null,
                location: scraped.location ?? null,
                badgeTier,
                sellerId: userId,
                importedFromUrl: scraped.originalUrl,
                importedSource: scraped.platform,
            } as any,
        });

        // Re-host external CDN images to Supabase in the background so they don't expire
        if (scraped.images.length > 0) {
            Promise.all(scraped.images.map(img => this.rehostImage(img)))
                .then(hostedUrls => this.prisma.listing.update({
                    where: { id: listing.id },
                    data: { images: hostedUrls },
                }))
                .catch(err => console.warn(`Import image re-host failed for listing ${listing.id}: ${err?.message}`));
        }

        return listing;
    }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HpiPdfService } from './hpi-pdf.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import {
    HPI_CHECK_KEYS,
    HpiReportData,
    defaultChecks,
    deriveIsClear,
} from './hpi-report.types';

/**
 * HPI reports are prepared by CarMazium staff, not fetched from an API.
 *
 * Every listing enters a PENDING vehicle-history review before publication;
 * an admin then completes it one of two ways:
 *   - the structured form, which computes `isClear` from the checks and lets
 *     us render our own branded PDF (saveAdminReport), or
 *   - uploading the supplied third-party PDF wholesale, where `isClear` is a
 *     deliberate admin call rather than derived (saveAdminPdf).
 *
 * A PENDING report blocks admin approval, so the listing cannot go live until
 * the check is completed. Buyers can still separately request a paid emailed
 * copy of the completed report where that feature is offered.
 *
 * Rows created before this change came from OneAutoAPI and carry
 * source=ONE_AUTO_API with the raw response in `data` — they still render
 * through parseLegacySummary so nothing a seller already paid for breaks.
 */
/** Third-party HPI PDFs run well under this; the cap is a sanity bound. */
const HPI_PDF_MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class HpiService {
    private readonly logger = new Logger(HpiService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly hpiPdfService: HpiPdfService,
        private readonly emailService: EmailService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    /**
     * Create the listing's HPI review row. Idempotent so admin-review seeding,
     * legacy payment callbacks and retries can all call it without creating a
     * duplicate or clobbering a completed report.
     */
    async createPendingReport(listingId: string, vrm: string, transactionId?: string) {
        const existing = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (existing) {
            this.logger.log(`HPI report already exists for listing ${listingId} — leaving as-is`);
            return existing;
        }

        const report = await this.prisma.hpiReport.create({
            data: {
                listingId,
                vrm,
                transactionId,
                status: 'PENDING',
                source: 'ADMIN',
                isClear: false,
                purchasedAt: new Date(),
            },
        });

        this.logger.log(`HPI report requested for listing ${listingId} (VRM ${vrm}) — awaiting admin`);
        return report;
    }

    async getReportForListing(listingId: string) {
        const report = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (!report) {
            throw new NotFoundException('HPI Report not found for this listing');
        }
        return report;
    }

    /**
     * Start a fresh mandatory report cycle for a retail relist. The current
     * schema stores one report row per listing, so the row is reset in place;
     * already-sent buyer email records remain as delivery history.
     */
    async resetForFreshListingReview(listingId: string, vrm: string) {
        const existing = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (!existing) return this.createPendingReport(listingId, vrm);

        return this.prisma.hpiReport.update({
            where: { listingId },
            data: {
                vrm,
                status: 'PENDING',
                source: 'ADMIN',
                isClear: false,
                transactionId: null,
                // A retail relist requires a genuinely fresh history check. Do not
                // let the previous raw/structured report survive behind PENDING.
                data: Prisma.DbNull,
                reportData: Prisma.DbNull,
                pdfData: null,
                pdfFileName: null,
                pdfSizeBytes: null,
                pdfUploadedAt: null,
                preparedById: null,
                preparedAt: null,
                reminderSentAt: null,
            },
        });
    }

    /**
     * Mandatory listing reports that have not been produced yet. The queue
     * also carries the number of buyers whose separately paid emailed copy is
     * waiting on the same report.
     */
    async getPendingReports() {
        const reports = await this.prisma.hpiReport.findMany({
            where: { status: 'PENDING' },
            orderBy: { purchasedAt: 'asc' },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        status: true,
                        type: true,
                        vrm: true,
                        make: true,
                        model: true,
                        year: true,
                        seller: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                },
                _count: { select: { emailRequests: { where: { status: 'PENDING' } } } },
            },
        });

        return reports.map(({ _count, ...report }) => ({
            ...report,
            waitingBuyers: _count.emailRequests,
        }));
    }

    /**
     * Seeds the admin form from what the listing already knows (mostly DVLA
     * data captured during the wizard), so the admin only types what's unique
     * to the third-party check rather than re-keying the whole vehicle.
     */
    async buildPrefill(listingId: string): Promise<HpiReportData> {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: {
                vrm: true, make: true, model: true, year: true, color: true,
                fuelType: true, transmission: true, bodyType: true, engineSize: true,
                vin: true, co2Emissions: true, owners: true, mileage: true,
                motExpiryDate: true, monthOfFirstRegistration: true,
            },
        });

        if (!listing) throw new NotFoundException('Listing not found');

        const existing = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        // Re-editing a completed report should reopen exactly what was saved,
        // not silently reset the admin's work back to listing defaults.
        if (existing?.reportData) {
            return existing.reportData as unknown as HpiReportData;
        }

        // motExpiryDate is stored as an ISO string and monthOfFirstRegistration
        // as "YYYY-MM", so both arrive as strings rather than Dates.
        const fmtDate = (d: Date | string | null | undefined) => {
            if (!d) return '';
            const parsed = new Date(d);
            return Number.isNaN(parsed.getTime())
                ? String(d)
                : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        };

        return {
            sourceName: 'AutoTrader Vehicle Check',
            sourceCheckDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            vehicle: {
                make: listing.make ?? '',
                model: listing.model ?? '',
                bodyType: listing.bodyType ?? '',
                fuelType: listing.fuelType ?? '',
                transmission: listing.transmission ?? '',
                engineCapacity: listing.engineSize ? `${listing.engineSize} cc` : '',
                vrm: listing.vrm ?? '',
                vin: listing.vin ?? '',
                engineNumber: '',
                colour: listing.color ?? '',
                firstRegistered: fmtDate(listing.monthOfFirstRegistration),
                yearOfManufacture: listing.year ? String(listing.year) : '',
                previousOwners: listing.owners != null ? String(listing.owners) : '',
                currentV5cIssueDate: '',
                co2Emissions: listing.co2Emissions ? `${listing.co2Emissions} g/km` : '',
            },
            checks: defaultChecks(),
            motStatus: '',
            motExpiry: fmtDate(listing.motExpiryDate),
            motMileageRecording: listing.mileage != null ? `${Number(listing.mileage).toLocaleString('en-GB')} miles` : '',
            motCurrentAdvisory: '',
            motHistory: [],
            mileageHistory: [],
            previousKeepers: listing.owners != null ? String(listing.owners) : '',
            lastKeeperChange: '',
            previousSearches: [],
        };
    }

    /**
     * Saves an admin-prepared report and marks it COMPLETED.
     * `isClear` is derived from the checks rather than accepted from the
     * client, so the badge shown on listings can never disagree with the
     * checks printed on the PDF.
     */
    async saveAdminReport(listingId: string, data: HpiReportData, adminId: string) {
        const report = await this.ensureReportRow(listingId);
        const wasPending = report.status === 'PENDING';

        this.validate(data);

        const normalised: HpiReportData = {
            ...data,
            checks: HPI_CHECK_KEYS.reduce(
                (acc, key) => {
                    const entry = data.checks?.[key];
                    acc[key] = { passed: entry?.passed !== false, ...(entry?.note ? { note: entry.note } : {}) };
                    return acc;
                },
                {} as HpiReportData['checks'],
            ),
            motHistory: data.motHistory ?? [],
            mileageHistory: data.mileageHistory ?? [],
            previousSearches: data.previousSearches ?? [],
        };

        const updated = await this.prisma.hpiReport.update({
            where: { listingId },
            data: {
                reportData: normalised as unknown as object,
                isClear: deriveIsClear(normalised.checks),
                status: 'COMPLETED',
                source: 'ADMIN',
                preparedById: adminId,
                preparedAt: new Date(),
                ...(normalised.vehicle?.vrm ? { vrm: normalised.vehicle.vrm } : {}),
            },
        });

        this.logger.log(`HPI report completed for listing ${listingId} by admin ${adminId}`);
        this.announceCompletion(updated.id, listingId, wasPending);

        return updated;
    }

    /**
     * The other way to complete a report: an admin uploads the third-party PDF
     * as supplied instead of re-keying it into the form. There is no check data
     * to derive from, so `isClear` is an explicit call by the admin — the badge
     * on the listing has to come from somewhere, and a human reading the PDF is
     * the only source available on this path.
     */
    async saveAdminPdf(
        listingId: string,
        file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
        isClear: boolean,
        adminId: string,
    ) {
        const report = await this.ensureReportRow(listingId);

        if (!file?.buffer?.length) {
            throw new BadRequestException('No file was uploaded');
        }
        if (file.buffer.length > HPI_PDF_MAX_BYTES) {
            throw new BadRequestException(`The PDF must be ${HPI_PDF_MAX_BYTES / (1024 * 1024)}MB or smaller`);
        }
        // Trust the bytes, not the declared type — the magic number is the only
        // thing that actually proves we aren't about to serve buyers a renamed
        // executable as their paid report.
        if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
            throw new BadRequestException('That file is not a PDF');
        }

        const wasPending = report.status === 'PENDING';
        const vrm = (report.vrm || 'vehicle').replace(/[^A-Za-z0-9]/g, '');

        const updated = await this.prisma.hpiReport.update({
            where: { listingId },
            data: {
                // Copied into a plain Uint8Array — Prisma's Bytes field rejects a
                // Buffer whose backing store is typed as ArrayBufferLike.
                pdfData: new Uint8Array(file.buffer),
                pdfFileName: `CarMazium_Vehicle_History_Report_${vrm}.pdf`,
                pdfSizeBytes: file.buffer.length,
                pdfUploadedAt: new Date(),
                isClear,
                status: 'COMPLETED',
                source: 'ADMIN',
                preparedById: adminId,
                preparedAt: new Date(),
            },
        });

        this.logger.log(
            `HPI report PDF uploaded for listing ${listingId} by admin ${adminId} ` +
            `(${file.buffer.length} bytes, ${isClear ? 'clear' : 'not clear'})`,
        );
        this.announceCompletion(updated.id, listingId, wasPending);

        return this.stripPdfBytes(updated);
    }

    /**
     * Removes an uploaded PDF. If nothing was ever entered into the form the
     * report drops back to PENDING and returns to the admin queue — leaving it
     * COMPLETED would advertise a report to buyers that no longer exists.
     */
    async removeAdminPdf(listingId: string) {
        const report = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (!report) {
            throw new NotFoundException('No HPI report was requested for this listing');
        }
        if (!report.pdfData) {
            throw new BadRequestException('There is no uploaded PDF on this report');
        }

        const hasFormReport = !!report.reportData;
        const updated = await this.prisma.hpiReport.update({
            where: { listingId },
            data: {
                pdfData: null,
                pdfFileName: null,
                pdfSizeBytes: null,
                pdfUploadedAt: null,
                ...(hasFormReport ? {} : { status: 'PENDING', isClear: false, preparedAt: null }),
            },
        });

        this.logger.log(
            `HPI report PDF removed for listing ${listingId} ` +
            `(falls back to ${hasFormReport ? 'form data' : 'PENDING'})`,
        );
        return this.stripPdfBytes(updated);
    }

    /**
     * Returns the listing's report row, creating a PENDING one if it's missing.
     *
     * Normally the row is created when a listing enters PENDING_REVIEW. This
     * fallback keeps older records and webhook/review edge cases serviceable if
     * the row was never seeded. Admin-only, so the worst case is a report attached
     * to a listing that did not
     * strictly ask for one, which is recoverable; the alternative isn't.
     */
    private async ensureReportRow(listingId: string) {
        const existing = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (existing) return existing;

        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: { vrm: true },
        });
        if (!listing) throw new NotFoundException('Listing not found');

        this.logger.warn(
            `No HPI report row for listing ${listingId} — creating one so an admin can attach the report`,
        );
        return this.createPendingReport(listingId, listing.vrm || '');
    }

    /** Never let raw PDF bytes ride back out on a JSON response. */
    private stripPdfBytes<T extends { pdfData?: Buffer | Uint8Array | null }>(report: T) {
        const { pdfData, ...rest } = report;
        return { ...rest, hasPdf: !!pdfData };
    }

    /**
     * Everything that has to happen once a report exists, whichever way it was
     * produced. All fire-and-forget: a slow email must never make the admin's
     * save appear to fail, and the report itself is already committed.
     *
     * `wasPending` guards the seller notification — re-saving a report to fix a
     * typo shouldn't tell the seller their report is ready all over again.
     */
    private announceCompletion(reportId: string, listingId: string, wasPending: boolean) {
        // Fan out to every buyer who paid to have this emailed while it was
        // still pending.
        this.deliverAllPendingForReport(reportId).catch(err =>
            this.logger.error(`Failed to fan out queued HPI report emails for report ${reportId}: ${err.message}`),
        );

        if (wasPending) {
            this.notifySellerReportReady(listingId).catch(err =>
                this.logger.error(`Failed to notify seller of ready HPI report for listing ${listingId}: ${err.message}`),
            );
        }
    }

    /**
     * Tell the seller that the mandatory vehicle-history review is complete.
     * Re-saving an already completed report does not repeat this notification.
     */
    private async notifySellerReportReady(listingId: string) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: {
                id: true,
                title: true,
                slug: true,
                sellerId: true,
                seller: { select: { email: true, firstName: true } },
            },
        });
        if (!listing?.sellerId) return;

        const notification = await this.notificationsService.create({
            userId: listing.sellerId,
            type: 'HPI_REPORT_READY',
            title: 'Your vehicle history report is ready',
            message: `The report you requested for "${listing.title}" is now attached to your listing.`,
            link: `/buy-cars/${listing.slug}`,
            entityType: 'Listing',
            entityId: listing.id,
        }).catch(() => null);

        if (notification) {
            this.notificationsGateway.sendNotification(listing.sellerId, notification);
        }

        if (listing.seller?.email) {
            await this.emailService.sendHpiReportReadyAlert({
                toEmail: listing.seller.email,
                firstName: listing.seller.firstName || 'there',
                vehicleTitle: listing.title,
                listingSlug: listing.slug,
            }).catch(err =>
                this.logger.error(`Failed to email seller about ready HPI report for listing ${listingId}: ${err.message}`),
            );
        }
    }

    private validate(data: HpiReportData) {
        if (!data) throw new BadRequestException('Report data is required');
        if (!data.sourceName?.trim()) {
            throw new BadRequestException('Source name is required — the report must disclose where the check came from');
        }
        if (!data.sourceCheckDate?.trim()) {
            throw new BadRequestException('Source check date is required');
        }
        if (!data.vehicle?.vrm?.trim()) {
            throw new BadRequestException('Vehicle registration (VRM) is required');
        }
    }

    /**
     * Serves the report PDF. An admin-uploaded file wins over the structured
     * form — if staff went to the trouble of attaching the real third-party
     * document, that is the authoritative one to hand out. Otherwise the
     * branded PDF is rendered on demand and never stored — see HpiController.
     */
    async renderPdf(listingId: string): Promise<{ buffer: Buffer; filename: string }> {
        const report = await this.getReportForListing(listingId);

        if (report.pdfData) {
            const vrm = (report.vrm || 'vehicle').replace(/[^A-Za-z0-9]/g, '');
            return {
                buffer: Buffer.from(report.pdfData),
                filename: report.pdfFileName || `CarMazium_Vehicle_History_Report_${vrm}.pdf`,
            };
        }

        if (report.status !== 'COMPLETED' || !report.reportData) {
            throw new BadRequestException('This HPI report has not been prepared yet');
        }

        const data = report.reportData as unknown as HpiReportData;
        const buffer = await this.hpiPdfService.render(data);
        const vrm = (data.vehicle?.vrm || report.vrm || 'vehicle').replace(/[^A-Za-z0-9]/g, '');
        return { buffer, filename: `CarMazium_Vehicle_History_Report_${vrm}.pdf` };
    }

    // ── Buyer-paid email delivery ───────────────────────────────────────────
    //
    // Separate from the mandatory listing-review flow above: a buyer pays £9.99 to have
    // the *same* report emailed to them personally. Payment and delivery are
    // deliberately decoupled — a buyer can pay before a report exists at all,
    // which also ensures the report is present in the admin queue. Delivery either fires immediately (report
    // already COMPLETED) or waits and is picked up by the fan-out in
    // saveAdminReport() above.

    /**
     * Called when a buyer's "email me this report" payment clears.
     * Idempotent against duplicate webhook delivery in the same way
     * createPendingReport is — Stripe can retry, so this must be safe to
     * call twice for one payment without double-emailing.
     */
    async requestEmailDelivery(listingId: string, buyerId: string, transactionId?: string) {
        // Never trust a client-supplied address for a paid deliverable —
        // always the buyer's own verified account email.
        const buyer = await this.prisma.user.findUnique({ where: { id: buyerId }, select: { email: true } });
        if (!buyer?.email) {
            throw new BadRequestException('No email on file for this account');
        }

        if (transactionId) {
            const already = await this.prisma.hpiReportEmailRequest.findFirst({ where: { transactionId } });
            if (already) {
                this.logger.log(`Email delivery already registered for transaction ${transactionId} — skipping duplicate`);
                return already;
            }
        }

        const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { vrm: true } });
        if (!listing) throw new NotFoundException('Listing not found');

        let report = await this.prisma.hpiReport.findUnique({ where: { listingId } });
        if (!report) {
            // First person to ever request a report for this vehicle — could
            // be this buyer, not necessarily the seller.
            report = await this.createPendingReport(listingId, listing.vrm || '', transactionId);
        }

        const request = await this.prisma.hpiReportEmailRequest.create({
            data: {
                hpiReportId: report.id,
                buyerId,
                buyerEmail: buyer.email,
                transactionId,
                status: 'PENDING',
            },
        });

        if (report.status === 'COMPLETED') {
            // Common case: the listing's report already exists, so this is
            // effectively instant rather than actually queued.
            this.deliverEmailRequest(request.id).catch(err =>
                this.logger.error(`Failed to send HPI report email immediately for request ${request.id}: ${err.message}`),
            );
        }

        return request;
    }

    /** The current buyer's latest delivery request for this listing, if any. */
    async getMyEmailRequest(listingId: string, buyerId: string) {
        const report = await this.prisma.hpiReport.findUnique({ where: { listingId }, select: { id: true } });
        if (!report) return null;

        return this.prisma.hpiReportEmailRequest.findFirst({
            where: { hpiReportId: report.id, buyerId },
            orderBy: { requestedAt: 'desc' },
            select: { status: true, requestedAt: true, sentAt: true },
        });
    }

    private async deliverAllPendingForReport(hpiReportId: string) {
        const pending = await this.prisma.hpiReportEmailRequest.findMany({
            where: { hpiReportId, status: 'PENDING' },
            select: { id: true },
        });
        for (const { id } of pending) {
            this.deliverEmailRequest(id).catch(err =>
                this.logger.error(`Failed to deliver queued HPI report email ${id}: ${err.message}`),
            );
        }
    }

    private async deliverEmailRequest(requestId: string) {
        const request = await this.prisma.hpiReportEmailRequest.findUnique({
            where: { id: requestId },
            include: {
                hpiReport: {
                    include: { listing: { select: { title: true, slug: true, make: true, model: true, year: true } } },
                },
            },
        });
        if (!request || request.status === 'SENT') return;

        const report = request.hpiReport;
        if (report.status !== 'COMPLETED' || !report.reportData) return; // not ready yet — stays PENDING

        try {
            const { buffer } = await this.renderPdf(report.listingId);
            const listing = report.listing;
            const vehicleTitle = listing?.title
                || [listing?.year, listing?.make, listing?.model].filter(Boolean).join(' ')
                || 'Vehicle';

            const sent = await this.emailService.sendHpiReportEmail({
                toEmail: request.buyerEmail,
                vehicleTitle,
                vrm: report.vrm,
                isClear: report.isClear,
                listingSlug: listing?.slug || '',
                pdfBuffer: buffer,
            });

            await this.prisma.hpiReportEmailRequest.update({
                where: { id: requestId },
                data: sent ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED' },
            });
        } catch (err: any) {
            this.logger.error(`Failed to render/send HPI report email for request ${requestId}: ${err.message}`);
            await this.prisma.hpiReportEmailRequest.update({ where: { id: requestId }, data: { status: 'FAILED' } }).catch(() => {});
        }
    }

    /**
     * Legacy OneAutoAPI reports only. New admin-prepared reports are returned
     * as their structured `reportData` instead — see HpiController.getSummary.
     */
    parseLegacySummary(rawData: any): HpiReportSummary {
        const items = rawData?.Response?.DataItems || rawData?.result || rawData || {};

        const vehicleReg = items?.VehicleRegistration || {};
        const vehicleStatus = items?.VehicleStatus || {};
        const stolenDetails = items?.StolenDetails || {};
        const financeDetails = items?.FinanceDetails || {};
        const writeOffDetails = items?.WriteOffDetails || {};
        const plateChangeDetails = items?.PlateChangeDetails || {};
        const mileageDetails = items?.MileageDetails || {};
        const technicalDetails = items?.TechnicalDetails || {};

        return {
            vrm: vehicleReg.Vrm || items.vrm || '',
            make: vehicleReg.Make || items.make || '',
            model: vehicleReg.Model || items.model || '',
            colour: vehicleReg.Colour || items.colour || '',
            yearOfManufacture: vehicleReg.YearOfManufacture || items.yearOfManufacture || '',
            registrationDate: vehicleReg.DateFirstRegistered || items.registrationDate || '',
            engineSize: technicalDetails?.SmmtDetails?.EngineCapacity || vehicleReg.EngineSize || items.engineSize || '',
            fuelType: vehicleReg.FuelType || items.fuelType || '',
            checks: {
                stolen: {
                    passed: !(stolenDetails?.IsStolen === true),
                    detail: stolenDetails?.IsStolen === true ? 'Vehicle reported as stolen' : 'No record of being reported stolen',
                },
                writeOff: {
                    passed: !(writeOffDetails?.IsWrittenOff === true),
                    detail: writeOffDetails?.IsWrittenOff === true
                        ? `Written off: Category ${writeOffDetails?.Category || 'Unknown'}`
                        : 'No insurance write-off recorded',
                    category: writeOffDetails?.Category || null,
                },
                scrapped: {
                    passed: !(vehicleStatus?.IsScrapped === true),
                    detail: vehicleStatus?.IsScrapped === true ? 'Vehicle recorded as scrapped' : 'Not recorded as scrapped',
                },
                financeOutstanding: {
                    passed: !(financeDetails?.IsOnFinance === true),
                    detail: financeDetails?.IsOnFinance === true
                        ? `Outstanding finance of £${financeDetails?.AgreementAmount || 'unknown'}`
                        : 'No outstanding finance detected',
                    agreementId: financeDetails?.AgreementId || null,
                },
                plateChange: {
                    passed: !(plateChangeDetails?.HasPlateChange === true),
                    detail: plateChangeDetails?.HasPlateChange === true
                        ? `${plateChangeDetails?.NumberOfPlateChanges || 1} plate change(s) recorded`
                        : 'No plate changes recorded',
                },
                mileageAnomaly: {
                    passed: !(mileageDetails?.HasMileageAnomaly === true),
                    detail: mileageDetails?.HasMileageAnomaly === true
                        ? 'Possible mileage discrepancy detected'
                        : 'Mileage appears consistent',
                },
            },
        };
    }
}

export interface HpiCheckResult {
    passed: boolean;
    detail: string;
    category?: string | null;
    agreementId?: string | null;
}

export interface HpiReportSummary {
    vrm: string;
    make: string;
    model: string;
    colour: string;
    yearOfManufacture: string;
    registrationDate: string;
    engineSize: string;
    fuelType: string;
    checks: {
        stolen: HpiCheckResult;
        writeOff: HpiCheckResult;
        scrapped: HpiCheckResult;
        financeOutstanding: HpiCheckResult;
        plateChange: HpiCheckResult;
        mileageAnomaly: HpiCheckResult;
    };
}

/**
 * End-to-end test of the Delivery & Recovery loop against an in-memory fake
 * of the Prisma models involved. Runs the real ServicesService — every rule,
 * every transition, every money calculation — with only the database, Stripe,
 * email and notifications replaced.
 *
 * It is one story, told in order, because the bugs that matter in a
 * marketplace are sequence bugs: "accept declined the wrong quote", "release
 * paid twice", "the loser saw the address".
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';

type Row = Record<string, any>;
let seq = 0;
const uid = (p: string) => `${p}_${++seq}`;

const RELATIONS: Record<string, Record<string, (row: Row, db: FakeDb) => any>> = {
    contractorProfile: {
        user: (r, db) => db.one('user', { id: r.userId }),
        capabilities: (r, db) => db.many('contractorCapability', { contractorId: r.id }),
    },
    contractorCapability: {
        contractor: (r, db) => db.one('contractorProfile', { id: r.contractorId }),
        reviewedBy: (r, db) => (r.reviewedById ? db.one('user', { id: r.reviewedById }) : null),
    },
    serviceJob: {
        customer: (r, db) => db.one('user', { id: r.customerId }),
        contractor: (r, db) => (r.contractorId ? db.one('contractorProfile', { id: r.contractorId }) : null),
        vehicles: (r, db) => db.many('serviceJobVehicle', { jobId: r.id }),
        quotes: (r, db) => db.many('serviceQuote', { jobId: r.id }),
        payment: (r, db) => db.one('servicePayment', { jobId: r.id }),
    },
    serviceQuote: {
        contractor: (r, db) => db.one('contractorProfile', { id: r.contractorId }),
        job: (r, db) => db.one('serviceJob', { id: r.jobId }),
    },
    servicePayment: {
        job: (r, db) => db.one('serviceJob', { id: r.jobId }),
    },
    serviceJobVehicle: { listing: () => null },
    user: {}, offer: {}, auction: {},
};

const DEFAULTS: Record<string, () => Row> = {
    contractorCapability: () => ({ status: 'PENDING', appliedAt: new Date(), reviewedAt: null, reviewedById: null, reviewNote: null }),
    contractorProfile: () => ({ rating: 0, totalReviews: 0, serviceTypes: [], certifications: [], businessName: null, phone: null, serviceArea: null }),
    serviceJob: () => ({ status: 'OPEN', isRecovery: false, acceptedQuoteId: null, contractorId: null, agreedAmountPence: null, platformFeeRate: null, platformFeePence: null, contractorAmountPence: null, sourceOfferId: null, sourceAuctionId: null, acceptedAt: null, startedAt: null, completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: null, description: null, pickupAddress: null, deliveryAddress: null, servicePostcode: null, serviceAddress: null, requestedFor: null }),
    serviceQuote: () => ({ status: 'ACTIVE', message: null, validUntil: null }),
    servicePayment: () => ({ status: 'PENDING', stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeTransferId: null, paidAt: null, releasedAt: null, refundedAt: null }),
    serviceJobVehicle: () => ({ registration: null, make: null, model: null, year: null, notes: null, listingId: null }),
};

function matches(row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => {
        if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
        if (k.includes('_') && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && k.split('_').every((f) => f in v)) return matches(row, v);
        const val = row[k];
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
            if ('in' in v) return (v.in as any[]).includes(val);
            if ('not' in v) return val !== v.not;
            if ('gt' in v) return val > v.gt;
            if ('lt' in v) return val < v.lt;
            return true;
        }
        if (val instanceof Date && v instanceof Date) return val.getTime() === v.getTime();
        return val === v;
    });
}

class FakeDb {
    tables: Record<string, Row[]> = {};
    constructor() { for (const m of Object.keys(RELATIONS)) this.tables[m] = []; }
    one(model: string, where: Row): Row | null { return this.tables[model].find((r) => matches(r, where)) ?? null; }
    many(model: string, where?: Row): Row[] { return this.tables[model].filter((r) => matches(r, where)); }

    private hydrate(model: string, row: Row | null, args: Row | undefined): any {
        if (!row) return null;
        const out: Row = { ...row };
        const inc = args?.include ?? (args?.select ? Object.fromEntries(Object.entries(args.select).filter(([, v]) => v && typeof v === 'object')) : null);
        if (inc) {
            for (const [rel, spec] of Object.entries(inc)) {
                if (!spec) continue;
                const resolver = RELATIONS[model]?.[rel];
                if (!resolver) continue;
                let val = resolver(row, this);
                const sub = typeof spec === 'object' ? (spec as Row) : undefined;
                if (Array.isArray(val)) {
                    if (sub?.where) val = val.filter((r: Row) => matches(r, sub.where));
                    if (sub?.take) val = val.slice(0, sub.take);
                    if (sub?.orderBy) {
                        const [[f, dir]] = Object.entries(Array.isArray(sub.orderBy) ? sub.orderBy[0] : sub.orderBy);
                        val = [...val].sort((a: Row, b: Row) => (a[f] > b[f] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
                    }
                    const relModel = rel === 'vehicles' ? 'serviceJobVehicle' : rel === 'quotes' ? 'serviceQuote' : rel === 'capabilities' ? 'contractorCapability' : rel;
                    val = val.map((r: Row) => this.hydrate(relModel, r, sub));
                } else if (val) {
                    const relModel = rel === 'customer' || rel === 'user' || rel === 'reviewedBy' ? 'user' : rel === 'contractor' ? 'contractorProfile' : rel === 'payment' ? 'servicePayment' : rel === 'job' ? 'serviceJob' : rel;
                    val = this.hydrate(relModel, val, sub);
                }
                out[rel] = val;
            }
        }
        if (args?.include?._count) {
            out._count = Object.fromEntries(Object.entries(args.include._count.select).map(([rel, spec]: [string, any]) => {
                let rows = RELATIONS[model][rel](row, this) as Row[];
                if (spec?.where) rows = rows.filter((r) => matches(r, spec.where));
                return [rel, rows.length];
            }));
        }
        return out;
    }

    private applyData(model: string, row: Row, data: Row) {
        for (const [k, v] of Object.entries(data)) {
            if (k === 'vehicles' && (v as any)?.create) {
                for (const veh of (v as any).create) this.tables.serviceJobVehicle.push({ id: uid('veh'), jobId: row.id, ...DEFAULTS.serviceJobVehicle(), ...veh });
                continue;
            }
            row[k] = v;
        }
        row.updatedAt = new Date();
    }

    client(model: string) {
        const t = this.tables[model];
        return {
            findUnique: async (a: Row) => this.hydrate(model, this.one(model, a.where), a),
            findFirst: async (a: Row) => this.hydrate(model, this.one(model, a.where), a),
            findMany: async (a: Row = {}) => {
                let rows = this.many(model, a.where);
                if (a.orderBy) {
                    const ob = Array.isArray(a.orderBy) ? a.orderBy[0] : a.orderBy;
                    const [[f, dir]] = Object.entries(ob);
                    rows = [...rows].sort((x, y) => (x[f] > y[f] ? 1 : x[f] < y[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
                }
                if (a.take) rows = rows.slice(0, a.take);
                return rows.map((r) => this.hydrate(model, r, a));
            },
            count: async (a: Row = {}) => this.many(model, a.where).length,
            create: async (a: Row) => { const row: Row = { id: uid(model), createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model]?.() ?? {}) }; this.applyData(model, row, a.data); t.push(row); return this.hydrate(model, row, a); },
            update: async (a: Row) => { const row = this.one(model, a.where); if (!row) throw new Error(`update: no ${model} matching ${JSON.stringify(a.where)}`); this.applyData(model, row, a.data); return this.hydrate(model, row, a); },
            updateMany: async (a: Row) => { const rows = this.many(model, a.where); rows.forEach((r) => this.applyData(model, r, a.data)); return { count: rows.length }; },
            upsert: async (a: Row) => { const existing = this.one(model, a.where); if (existing) { this.applyData(model, existing, a.update); return this.hydrate(model, existing, a); } const row: Row = { id: uid(model), createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[model]?.() ?? {}) }; this.applyData(model, row, a.create); t.push(row); return this.hydrate(model, row, a); },
        };
    }
    prisma(): any { const p: Row = { $transaction: async (ops: any) => (typeof ops === 'function' ? ops(p) : Promise.all(ops)) }; for (const m of Object.keys(RELATIONS)) p[m] = this.client(m); return p; }
}

const db = new FakeDb();
const notify = jest.fn().mockResolvedValue(null);
const sendBrandedEmail = jest.fn().mockResolvedValue({ id: 'email' });
const sessionsCreate = jest.fn();
const refundsCreate = jest.fn();
const issueSellerPayout = jest.fn();
const CUSTOMER = { id: 'u_cust', role: 'BUYER', email: 'cust@example.com', firstName: 'Cara', lastName: 'Customer', phone: '07000000001', postcode: null };
const TRUCKER = { id: 'u_truck', role: 'CONTRACTOR', email: 'kent@example.com', firstName: 'Ken', lastName: 'Trucker', phone: '07000000002', stripeConnectAccountId: 'acct_kent', stripeConnectOnboardingComplete: true };
const RIVAL = { id: 'u_rival', role: 'CONTRACTOR', email: 'rival@example.com', firstName: 'Rae', lastName: 'Rival', phone: null, stripeConnectAccountId: 'acct_rival', stripeConnectOnboardingComplete: true };
const NOSTRIPE = { id: 'u_nostripe', role: 'CONTRACTOR', email: 'ns@example.com', firstName: 'Nia', stripeConnectAccountId: null, stripeConnectOnboardingComplete: false };
const ADMIN = { id: 'u_admin', role: 'ADMIN', email: 'admin@example.com', firstName: 'Ada', deletedAt: null };
let svc: ServicesService;

beforeAll(async () => {
    db.tables.user.push(CUSTOMER, TRUCKER, RIVAL, NOSTRIPE, ADMIN);
    const mod = await Test.createTestingModule({ providers: [
        ServicesService,
        { provide: PrismaService, useValue: db.prisma() },
        { provide: NotificationsService, useValue: { create: notify } },
        { provide: EmailService, useValue: { sendBrandedEmail } },
        { provide: PaymentsService, useValue: { getStripeClient: async () => ({ checkout: { sessions: { create: sessionsCreate } }, refunds: { create: refundsCreate } }), issueSellerPayout } },
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'FRONTEND_URL' ? 'https://www.carmazium.com' : undefined) } },
    ] }).compile();
    svc = mod.get(ServicesService);
});

const notificationsTo = (userId: string) => notify.mock.calls.filter((c) => c[0].userId === userId).map((c) => c[0].type);

describe('Delivery & Recovery — end to end', () => {
    let kentProfileId: string; let rivalProfileId: string; let kentCapId: string; let jobId: string; let kentQuoteId: string; let rivalQuoteId: string;

    it('a buyer cannot apply to be a provider', async () => { await expect(svc.applyCapability(CUSTOMER.id, { serviceType: 'DELIVERY' } as any)).rejects.toThrow(ForbiddenException); });
    it('applying creates the contractor profile that nothing else ever did', async () => {
        expect(db.one('contractorProfile', { userId: TRUCKER.id })).toBeNull();
        const cap = await svc.applyCapability(TRUCKER.id, { serviceType: 'DELIVERY', businessName: 'Kent Vehicle Transport', phone: '01234 567890', serviceArea: 'South East' } as any);
        const profile = db.one('contractorProfile', { userId: TRUCKER.id })!; expect(profile.businessName).toBe('Kent Vehicle Transport'); expect(cap.status).toBe('PENDING'); kentProfileId = profile.id; kentCapId = cap.id; expect(notificationsTo(ADMIN.id)).toContain('SERVICE_CAPABILITY_APPLIED');
    });
    it('applying twice while pending is idempotent', async () => { const again = await svc.applyCapability(TRUCKER.id, { serviceType: 'DELIVERY' } as any); expect(again.id).toBe(kentCapId); expect(db.many('contractorCapability', { contractorId: kentProfileId })).toHaveLength(1); });
    it('admin cannot approve a provider without Stripe Connect', async () => { const cap = await svc.applyCapability(NOSTRIPE.id, { serviceType: 'DELIVERY' } as any); await expect(svc.adminReviewCapability(ADMIN.id, cap.id, { status: 'APPROVED' } as any)).rejects.toThrow(/Stripe Connect/); });
    it('admin approves Kent and the rival', async () => {
        const approved = await svc.adminReviewCapability(ADMIN.id, kentCapId, { status: 'APPROVED' } as any); expect(approved.status).toBe('APPROVED'); expect(approved.reviewedById).toBe(ADMIN.id); expect(notificationsTo(TRUCKER.id)).toContain('SERVICE_CAPABILITY_APPROVED');
        const rc = await svc.applyCapability(RIVAL.id, { serviceType: 'DELIVERY', businessName: 'Rival Recovery' } as any); await svc.adminReviewCapability(ADMIN.id, rc.id, { status: 'APPROVED' } as any); rivalProfileId = db.one('contractorProfile', { userId: RIVAL.id })!.id;
    });
    it('re-approving is a conflict, not a duplicate row', async () => { await expect(svc.applyCapability(TRUCKER.id, { serviceType: 'DELIVERY' } as any)).rejects.toThrow(ConflictException); });
    it('rejects a delivery job with no route', async () => { await expect(svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'x', vehicles: [{}] } as any)).rejects.toThrow(BadRequestException); });
    it('rejects an enquiry-based service as a job', async () => { await expect(svc.createJob(CUSTOMER.id, { serviceType: 'FINANCE', title: 'x', vehicles: [{}] } as any)).rejects.toThrow(/enquiry/); });
    it('posts a two-car recovery job, normalising registrations and postcodes', async () => {
        const job = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', isRecovery: true, title: 'Two non-runners to the yard', pickupPostcode: ' ls1  4ap ', pickupAddress: '12 Mill Street', deliveryPostcode: 'bs1 4dj', deliveryAddress: '4 Dock Road', vehicles: [{ registration: 'ab12 cde', make: 'BMW', model: '320d', year: 2018 }, { registration: 'xy 65 zzz', make: 'Audi', model: 'A4', notes: 'no keys' }] } as any);
        jobId = job.id; expect(job.status).toBe('OPEN'); expect(job.isRecovery).toBe(true); expect(job.pickupPostcode).toBe('LS1 4AP'); expect(job.deliveryPostcode).toBe('BS1 4DJ'); expect(job.vehicles).toHaveLength(2); expect(job.vehicles.map((v: any) => v.registration)).toEqual(['AB12CDE', 'XY65ZZZ']); expect(job.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    });
    it('the feed shows the job to approved contractors with the address redacted', async () => { const feed = await svc.feed(kentProfileId, ['DELIVERY'] as any); expect(feed.map((j) => j.id)).toContain(jobId); const j = feed.find((x) => x.id === jobId)!; expect(j.pickupPostcode).toBe('LS1 4AP'); expect(j.pickupAddress).toBeNull(); expect(j.deliveryAddress).toBeNull(); expect((j as any).customer).toEqual({ id: CUSTOMER.id, firstName: 'Cara' }); });
    it('the feed is empty for a service the contractor is not approved for', async () => { expect(await svc.feed(kentProfileId, ['INSPECTION'] as any)).toEqual([]); });
    it('a contractor cannot quote outside their approved services', async () => { await expect(svc.upsertQuote(kentProfileId, ['INSPECTION'] as any, TRUCKER.id, jobId, { amountPence: 10000 } as any)).rejects.toThrow(ForbiddenException); });
    it('Kent quotes £180, rival quotes £150, and the customer hears about both', async () => {
        const q1 = await svc.upsertQuote(kentProfileId, ['DELIVERY'] as any, TRUCKER.id, jobId, { amountPence: 18000, message: 'Flatbed, tomorrow AM' } as any); const q2 = await svc.upsertQuote(rivalProfileId, ['DELIVERY'] as any, RIVAL.id, jobId, { amountPence: 15000 } as any); kentQuoteId = q1.id; rivalQuoteId = q2.id; expect(notificationsTo(CUSTOMER.id).filter((t) => t === 'SERVICE_QUOTE_RECEIVED')).toHaveLength(2); expect(sendBrandedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: CUSTOMER.email, subject: expect.stringContaining('£180.00') }));
    });
    it('updating a quote edits in place rather than stacking', async () => { const q = await svc.upsertQuote(kentProfileId, ['DELIVERY'] as any, TRUCKER.id, jobId, { amountPence: 17000 } as any); expect(q.id).toBe(kentQuoteId); expect(db.many('serviceQuote', { jobId })).toHaveLength(2); });
    it('the customer sees both quotes cheapest-first; a bidder sees only their own', async () => {
        const asCustomer = await svc.getJob({ userId: CUSTOMER.id, role: 'BUYER' as any }, jobId); expect(asCustomer.viewerRole).toBe('customer'); expect(asCustomer.quotes!.map((q: any) => q.amountPence)).toEqual([15000, 17000]); expect(asCustomer.pickupAddress).toBe('12 Mill Street');
        const asKent = await svc.getJob({ userId: TRUCKER.id, role: 'CONTRACTOR' as any, contractorProfileId: kentProfileId }, jobId); expect(asKent.viewerRole).toBe('bidder'); expect(asKent.quotes!.map((q: any) => q.id)).toEqual([kentQuoteId]); expect(asKent.pickupAddress).toBeNull(); expect((asKent as any).customer.phone).toBeUndefined();
    });
    it('a stranger with no quote and no capability cannot open the job', async () => { await expect(svc.getJob({ userId: 'u_nobody', role: 'BUYER' as any }, jobId)).rejects.toThrow(ForbiddenException); });
    it('accepting Kent freezes the 9% split, declines the rival, and returns checkout', async () => {
        sessionsCreate.mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' }); const { checkoutUrl } = await svc.acceptQuote(CUSTOMER.id, jobId, kentQuoteId); expect(checkoutUrl).toBe('https://checkout.stripe.com/cs_1');
        const job = db.one('serviceJob', { id: jobId })!; expect(job.status).toBe('ACCEPTED'); expect(job.contractorId).toBe(kentProfileId); expect(job.agreedAmountPence).toBe(17000); expect(job.platformFeePence).toBe(1530); expect(job.contractorAmountPence).toBe(15470); expect(db.one('serviceQuote', { id: kentQuoteId })!.status).toBe('ACCEPTED'); expect(db.one('serviceQuote', { id: rivalQuoteId })!.status).toBe('DECLINED'); expect(notificationsTo(RIVAL.id)).toContain('SERVICE_QUOTE_DECLINED');
        const pay = db.one('servicePayment', { jobId })!; expect(pay).toMatchObject({ grossPence: 17000, platformFeePence: 1530, contractorPence: 15470, status: 'PENDING', stripeCheckoutSessionId: 'cs_1' }); const session = sessionsCreate.mock.calls[0][0]; expect(session.line_items[0].price_data.unit_amount).toBe(17000); expect(session.metadata).toMatchObject({ type: 'SERVICE_JOB', jobId, paymentId: pay.id });
    });
    it('the rival quoting again after acceptance is refused', async () => { await expect(svc.upsertQuote(rivalProfileId, ['DELIVERY'] as any, RIVAL.id, jobId, { amountPence: 100 } as any)).rejects.toThrow(/no longer accepting/); });
    it('cancelling after acceptance is refused and points at dispute', async () => { await expect(svc.cancelJob(CUSTOMER.id, jobId, {} as any)).rejects.toThrow(/dispute/i); });
    it('an abandoned checkout can be re-entered without re-accepting', async () => { sessionsCreate.mockResolvedValueOnce({ id: 'cs_2', url: 'https://checkout.stripe.com/cs_2' }); const { checkoutUrl } = await svc.acceptQuote(CUSTOMER.id, jobId, kentQuoteId); expect(checkoutUrl).toBe('https://checkout.stripe.com/cs_2'); expect(db.one('servicePayment', { jobId })!.stripeCheckoutSessionId).toBe('cs_2'); expect(db.many('servicePayment', { jobId })).toHaveLength(1); });
    it('the contractor cannot start before payment', async () => { await expect(svc.startJob(kentProfileId, jobId)).rejects.toThrow(/paid/); });
    it('the webhook marks it paid, unlocks contact details, and is replay-safe', async () => {
        const pay = db.one('servicePayment', { jobId })!; await svc.markPaid(jobId, pay.id, 'pi_123'); expect(db.one('serviceJob', { id: jobId })!.status).toBe('PAID'); expect(pay.status).toBe('PAID'); expect(pay.stripePaymentIntentId).toBe('pi_123'); expect(notificationsTo(TRUCKER.id)).toContain('SERVICE_JOB_PAID'); expect(notificationsTo(CUSTOMER.id)).toContain('SERVICE_JOB_PAID');
        const asKent = await svc.getJob({ userId: TRUCKER.id, role: 'CONTRACTOR' as any, contractorProfileId: kentProfileId }, jobId); expect(asKent.viewerRole).toBe('contractor'); expect(asKent.pickupAddress).toBe('12 Mill Street'); expect((asKent as any).customer.phone).toBe('07000000001'); const asCustomer = await svc.getJob({ userId: CUSTOMER.id, role: 'BUYER' as any }, jobId); expect((asCustomer as any).contractor.phone).toBe('01234 567890'); const before = notify.mock.calls.length; await svc.markPaid(jobId, pay.id, 'pi_123'); expect(notify.mock.calls.length).toBe(before);
    });
    it('a rejected payment webhook for the wrong job changes nothing', async () => { const pay = db.one('servicePayment', { jobId })!; await svc.markPaid('some_other_job', pay.id, 'pi_evil'); expect(pay.stripePaymentIntentId).toBe('pi_123'); });
    it('the rival cannot start or complete a job that is not theirs', async () => { await expect(svc.startJob(rivalProfileId, jobId)).rejects.toThrow(ForbiddenException); await expect(svc.completeJob(rivalProfileId, jobId)).rejects.toThrow(ForbiddenException); });
    it('Kent starts and completes; the customer is asked to confirm', async () => { await svc.startJob(kentProfileId, jobId); expect(db.one('serviceJob', { id: jobId })!.status).toBe('IN_PROGRESS'); await svc.completeJob(kentProfileId, jobId); const job = db.one('serviceJob', { id: jobId })!; expect(job.status).toBe('COMPLETED'); expect(job.completedAt).toBeInstanceOf(Date); expect(notificationsTo(CUSTOMER.id)).toContain('SERVICE_JOB_COMPLETED'); });
    it('confirming before completion is refused', async () => { const other = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'other', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); await expect(svc.confirmCompletion(CUSTOMER.id, other.id)).rejects.toThrow(/not marked/); });
    it('the customer confirms: exactly the contractor share is transferred, once', async () => { issueSellerPayout.mockResolvedValueOnce('tr_1'); const r = await svc.confirmCompletion(CUSTOMER.id, jobId); expect(r).toEqual({ success: true, transferId: 'tr_1' }); expect(issueSellerPayout).toHaveBeenCalledWith('acct_kent', 15470); expect(issueSellerPayout).toHaveBeenCalledTimes(1); const job = db.one('serviceJob', { id: jobId })!; const pay = db.one('servicePayment', { jobId })!; expect(job.status).toBe('RELEASED'); expect(pay.status).toBe('RELEASED'); expect(pay.stripeTransferId).toBe('tr_1'); expect(notificationsTo(TRUCKER.id)).toContain('SERVICE_PAYOUT_RELEASED'); });
    it('a second confirm cannot pay twice', async () => { await expect(svc.confirmCompletion(CUSTOMER.id, jobId)).rejects.toThrow(); expect(issueSellerPayout).toHaveBeenCalledTimes(1); });
    it('a failed transfer leaves the job releasable rather than half-released', async () => {
        const j = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'flaky', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); const q = await svc.upsertQuote(kentProfileId, ['DELIVERY'] as any, TRUCKER.id, j.id, { amountPence: 10000 } as any); sessionsCreate.mockResolvedValueOnce({ id: 'cs_f', url: 'u' }); await svc.acceptQuote(CUSTOMER.id, j.id, q.id); await svc.markPaid(j.id, db.one('servicePayment', { jobId: j.id })!.id, 'pi_f'); await svc.startJob(kentProfileId, j.id); await svc.completeJob(kentProfileId, j.id); issueSellerPayout.mockRejectedValueOnce(new Error('Stripe is down')); await expect(svc.confirmCompletion(CUSTOMER.id, j.id)).rejects.toThrow('Stripe is down'); expect(db.one('serviceJob', { id: j.id })!.status).toBe('COMPLETED'); expect(db.one('servicePayment', { jobId: j.id })!.status).toBe('PAID'); issueSellerPayout.mockResolvedValueOnce('tr_retry'); await svc.confirmCompletion(CUSTOMER.id, j.id); expect(db.one('servicePayment', { jobId: j.id })!.stripeTransferId).toBe('tr_retry');
    });
    it('a dispute freezes a paid job; admin refunds the customer in full', async () => {
        const j = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'bad', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); const q = await svc.upsertQuote(rivalProfileId, ['DELIVERY'] as any, RIVAL.id, j.id, { amountPence: 20000 } as any); sessionsCreate.mockResolvedValueOnce({ id: 'cs_d', url: 'u' }); await svc.acceptQuote(CUSTOMER.id, j.id, q.id); await svc.markPaid(j.id, db.one('servicePayment', { jobId: j.id })!.id, 'pi_d'); await svc.openDispute(CUSTOMER.id, j.id, 'Car arrived scratched'); expect(db.one('serviceJob', { id: j.id })!.status).toBe('DISPUTED'); expect(notificationsTo(ADMIN.id)).toContain('SERVICE_JOB_DISPUTED'); refundsCreate.mockResolvedValueOnce({ id: 're_1' }); await svc.adminResolveDispute(ADMIN.id, j.id, { outcome: 'REFUND', note: 'Photos confirm damage' } as any); expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_d' }); expect(db.one('servicePayment', { jobId: j.id })!.status).toBe('REFUNDED'); expect(db.one('serviceJob', { id: j.id })!.status).toBe('CANCELLED'); expect(issueSellerPayout).not.toHaveBeenCalledWith('acct_rival', expect.anything());
    });
    it('cancelling an open job expires its quotes and tells the quoters', async () => { const j = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'changed my mind', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); await svc.upsertQuote(kentProfileId, ['DELIVERY'] as any, TRUCKER.id, j.id, { amountPence: 5000 } as any); const before = notificationsTo(TRUCKER.id).length; await svc.cancelJob(CUSTOMER.id, j.id, { reason: 'sold locally' } as any); expect(db.one('serviceJob', { id: j.id })!.status).toBe('CANCELLED'); expect(db.one('serviceQuote', { jobId: j.id })!.status).toBe('EXPIRED'); expect(notificationsTo(TRUCKER.id).slice(before)).toContain('SERVICE_JOB_CANCELLED'); });
    it('the cron expires stale open jobs and auto-confirms stale completions', async () => {
        const stale = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'stale', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); db.one('serviceJob', { id: stale.id })!.expiresAt = new Date(Date.now() - 1000); expect(await svc.expireOpenJobs()).toBe(1); expect(db.one('serviceJob', { id: stale.id })!.status).toBe('EXPIRED');
        const done = await svc.createJob(CUSTOMER.id, { serviceType: 'DELIVERY', title: 'forgotten', pickupPostcode: 'A1 1AA', deliveryPostcode: 'B2 2BB', vehicles: [{ make: 'x', model: 'y' }] } as any); const q = await svc.upsertQuote(kentProfileId, ['DELIVERY'] as any, TRUCKER.id, done.id, { amountPence: 8000 } as any); sessionsCreate.mockResolvedValueOnce({ id: 'cs_a', url: 'u' }); await svc.acceptQuote(CUSTOMER.id, done.id, q.id); await svc.markPaid(done.id, db.one('servicePayment', { jobId: done.id })!.id, 'pi_a'); await svc.completeJob(kentProfileId, done.id); db.one('serviceJob', { id: done.id })!.completedAt = new Date(Date.now() - 49 * 3_600_000); issueSellerPayout.mockResolvedValueOnce('tr_auto'); expect(await svc.autoConfirmCompleted()).toBe(1); expect(db.one('serviceJob', { id: done.id })!.status).toBe('RELEASED'); expect(issueSellerPayout).toHaveBeenLastCalledWith('acct_kent', 7280);
    });
});

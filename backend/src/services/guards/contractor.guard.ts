import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { UserRole, CapabilityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Lets through CONTRACTORs holding at least one APPROVED capability, and ADMINs.
 *
 * Deliberately not per-service. The route usually does not know which service
 * a request concerns until it has loaded the job, so the per-service check
 * ("may THIS contractor quote on THIS job?") lives in ServicesService, next to
 * the job it is about. This guard only answers "is this account a working
 * contractor at all?" — enough to keep the feed and the quote endpoints away
 * from everyone else without a second round trip.
 *
 * Reads from the database, not the session user, for the same reason
 * VerifiedDealerGuard does: a contractor approved partway through a session
 * should get in immediately, not after signing out and back in.
 *
 * Attaches `req.contractorProfileId` so handlers do not repeat the lookup.
 */
@Injectable()
export class ContractorGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();
        const user = req.user;

        if (!user?.id) throw new ForbiddenException('Not authenticated');
        if (user.role === UserRole.ADMIN) return true;

        if (user.role !== UserRole.CONTRACTOR) {
            throw new ForbiddenException('This area is for approved service providers.');
        }

        const profile = await this.prisma.contractorProfile.findUnique({
            where: { userId: user.id },
            select: {
                id: true,
                capabilities: {
                    where: { status: CapabilityStatus.APPROVED },
                    select: { serviceType: true },
                },
            },
        });

        if (!profile || profile.capabilities.length === 0) {
            // Distinct from the wrong-role message: this account is a
            // contractor with nothing approved yet, and the UI sends them to
            // their capabilities page rather than telling them to sign up.
            throw new ForbiddenException(
                'Your provider account has no approved services yet. Apply for a service area and wait for approval.',
            );
        }

        req.contractorProfileId = profile.id;
        req.approvedServiceTypes = profile.capabilities.map((c) => c.serviceType);
        return true;
    }
}

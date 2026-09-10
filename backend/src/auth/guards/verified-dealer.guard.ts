import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Restricts a route to dealers whose KYC has been approved.
 *
 * WHY THIS EXISTS ON TOP OF RolesGuard: role DEALER alone is self-serve. A
 * buyer can switch their own account to DEALER from the profile page and get
 * the dealer dashboard in limited mode — that is intended, it is how a dealer
 * onboards. What it must NOT buy them is the trade stock: live trade bids are
 * the dealers' cost base, and a retail buyer who reads them learns what their
 * next car cost the forecourt. Checking the role and not the verification left
 * exactly that door open.
 *
 * ADMIN passes without a dealer profile — staff operate this room (approving
 * auction listings, resolving disputes, cancelling bids) and none of that is
 * possible from behind the wall.
 *
 * Reads isVerified from the database rather than from the session user. The
 * session caches the user object, so a dealer approved partway through a
 * session would otherwise keep being refused until they signed out and back
 * in — the one moment they are most likely to be watching.
 */
@Injectable()
export class VerifiedDealerGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const { user } = context.switchToHttp().getRequest();

        if (!user?.id) {
            throw new ForbiddenException('Not authenticated');
        }

        if (user.role === UserRole.ADMIN) {
            return true;
        }

        if (user.role !== UserRole.DEALER) {
            throw new ForbiddenException(
                'The Trade Exchange is restricted to dealer accounts.',
            );
        }

        const profile = await this.prisma.dealerProfile.findUnique({
            where: { userId: user.id },
            select: { isVerified: true },
        });

        if (!profile?.isVerified) {
            // Distinct message from the wrong-role one on purpose: this dealer
            // has the right account and an unfinished application, and the UI
            // sends them to KYC rather than telling them to sign up again.
            throw new ForbiddenException(
                'Your dealer account is awaiting verification. Complete your KYC to access the Trade Exchange.',
            );
        }

        return true;
    }
}

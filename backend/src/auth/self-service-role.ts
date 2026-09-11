import { UserRole } from '@prisma/client';

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

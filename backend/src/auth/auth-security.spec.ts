import { validate } from 'class-validator';
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

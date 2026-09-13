import { Injectable } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

import { administrationError } from './administration.errors';

export const ADMIN_CAPABILITIES = [
    'ADMIN_SESSION_ACCESS',
    'ROLE_GRANT_MANAGE',
    'USER_LOOKUP',
    'SAFETY_CASE_ROUTE',
    'SAFETY_CASE_DECIDE',
    'USER_RESTRICT',
    'VENUE_MODERATE',
    'AUDIT_SEARCH',
    'BREAK_GLASS_MANAGE',
    'GAMIFICATION_DEFINITION_READ',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

const ROLE_CAPABILITIES = {
    SUPERADMIN: [
        'ADMIN_SESSION_ACCESS',
        'ROLE_GRANT_MANAGE',
        'USER_LOOKUP',
        'SAFETY_CASE_ROUTE',
        'AUDIT_SEARCH',
        'BREAK_GLASS_MANAGE',
        'GAMIFICATION_DEFINITION_READ',
    ],
    MODERATOR: [
        'ADMIN_SESSION_ACCESS',
        'USER_LOOKUP',
        'SAFETY_CASE_ROUTE',
        'SAFETY_CASE_DECIDE',
        'USER_RESTRICT',
        'VENUE_MODERATE',
        'AUDIT_SEARCH',
    ],
    EDITOR: ['ADMIN_SESSION_ACCESS'],
    ADS_MANAGER: ['ADMIN_SESSION_ACCESS'],
} as const satisfies Record<PlatformRole, readonly AdminCapability[]>;

@Injectable()
export class AdministrationPolicy {
    capabilities(role: PlatformRole): readonly AdminCapability[] {
        return ROLE_CAPABILITIES[role];
    }

    assert(role: PlatformRole, capability: AdminCapability): void {
        if (!this.capabilities(role).includes(capability)) {
            throw administrationError('CAPABILITY_REQUIRED', 403);
        }
    }
}

import type { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PlatformRole } from '@prisma/client';
import type { Request } from 'express';

import { BrowserSecurityService } from '../../src/identity/browser-security.service';
import { AdministrationController } from '../../src/administration/administration.controller';
import { administrationError } from '../../src/administration/administration.errors';
import { AdministrationPolicy, type AdminCapability } from '../../src/administration/administration.policy';
import { AdministrationRateLimitService } from '../../src/administration/administration-rate-limit.service';
import { AdministrationService } from '../../src/administration/administration.service';
import {
    AdministrationSessionService,
    type AuthenticatedAdmin,
} from '../../src/administration/administration-session.service';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-11T12:00:00.000Z';

interface Endpoint {
    action:
        | 'session'
        | 'grantRole'
        | 'revokeRole'
        | 'lookupUser'
        | 'listCases'
        | 'caseDetail'
        | 'assignCase'
        | 'decideCase'
        | 'restrictUser'
        | 'revokeRestriction'
        | 'listVenues'
        | 'venueDetail'
        | 'decideVenue'
        | 'mergeVenue'
        | 'audit'
        | 'createBreakGlass'
        | 'revokeBreakGlass';
    capability: AdminCapability;
    method: 'get' | 'post';
    path: string;
    body?: object;
}

const mutation = {
    expectedRevision: 0,
    policyVersion: 'admin-v1',
    reasonCode: 'ACCESS_REVIEW',
};

const endpoints: readonly Endpoint[] = [
    { action: 'session', capability: 'ADMIN_SESSION_ACCESS', method: 'get', path: '/v1/admin/session' },
    {
        action: 'grantRole',
        capability: 'ROLE_GRANT_MANAGE',
        method: 'post',
        path: '/v1/admin/role-grants',
        body: {
            ...mutation,
            approvalReference: 'SEC-101',
            reviewAt: '2026-09-12T12:00:00.000Z',
            role: 'MODERATOR',
            subjectUserId: id,
        },
    },
    {
        action: 'revokeRole',
        capability: 'ROLE_GRANT_MANAGE',
        method: 'post',
        path: `/v1/admin/role-grants/${id}/revoke`,
        body: mutation,
    },
    {
        action: 'lookupUser',
        capability: 'USER_LOOKUP',
        method: 'post',
        path: '/v1/admin/users/lookup',
        body: { key: { userId: id }, purpose: 'SUPPORT' },
    },
    { action: 'listCases', capability: 'SAFETY_CASE_ROUTE', method: 'get', path: '/v1/admin/cases' },
    { action: 'caseDetail', capability: 'SAFETY_CASE_ROUTE', method: 'get', path: `/v1/admin/cases/${id}` },
    {
        action: 'assignCase',
        capability: 'SAFETY_CASE_ROUTE',
        method: 'post',
        path: `/v1/admin/cases/${id}/assignment`,
        body: { ...mutation, assigneeUserId: secondId },
    },
    {
        action: 'decideCase',
        capability: 'SAFETY_CASE_DECIDE',
        method: 'post',
        path: `/v1/admin/cases/${id}/decision`,
        body: { ...mutation, outcome: 'NO_VIOLATION' },
    },
    {
        action: 'restrictUser',
        capability: 'USER_RESTRICT',
        method: 'post',
        path: `/v1/admin/users/${id}/restrictions`,
        body: {
            ...mutation,
            decisionId: secondId,
            expiresAt: '2026-09-12T12:00:00.000Z',
            scope: 'DIRECT_INTERACTIONS',
        },
    },
    {
        action: 'revokeRestriction',
        capability: 'USER_RESTRICT',
        method: 'post',
        path: `/v1/admin/users/${id}/restrictions/${secondId}/revoke`,
        body: mutation,
    },
    { action: 'listVenues', capability: 'VENUE_MODERATE', method: 'get', path: '/v1/admin/venue-candidates' },
    { action: 'venueDetail', capability: 'VENUE_MODERATE', method: 'get', path: `/v1/admin/venue-candidates/${id}` },
    {
        action: 'decideVenue',
        capability: 'VENUE_MODERATE',
        method: 'post',
        path: `/v1/admin/venue-candidates/${id}/decision`,
        body: { ...mutation, decision: 'REJECT' },
    },
    {
        action: 'mergeVenue',
        capability: 'VENUE_MODERATE',
        method: 'post',
        path: `/v1/admin/venue-candidates/${id}/merge`,
        body: { ...mutation, duplicateVenueId: id, survivorVenueId: secondId },
    },
    {
        action: 'audit',
        capability: 'AUDIT_SEARCH',
        method: 'get',
        path: `/v1/admin/audit?from=${encodeURIComponent(now)}&to=${encodeURIComponent('2026-09-12T12:00:00.000Z')}`,
    },
    {
        action: 'createBreakGlass',
        capability: 'BREAK_GLASS_MANAGE',
        method: 'post',
        path: '/v1/admin/break-glass-grants',
        body: {
            ...mutation,
            caseId: id,
            expiresAt: '2026-09-11T12:30:00.000Z',
            incidentReference: 'INC-101',
            justification: 'Incident response',
        },
    },
    {
        action: 'revokeBreakGlass',
        capability: 'BREAK_GLASS_MANAGE',
        method: 'post',
        path: `/v1/admin/break-glass-grants/${id}/revoke`,
        body: mutation,
    },
];

const roles: readonly PlatformRole[] = ['SUPERADMIN', 'MODERATOR', 'EDITOR', 'ADS_MANAGER'];

describe('administration direct API authorization matrix', () => {
    let controller: AdministrationController;
    const policy = new AdministrationPolicy();
    const operation = jest.fn().mockResolvedValue({});
    const deniedAudit = jest.fn().mockResolvedValue(undefined);

    beforeAll(async () => {
        const sessions = {
            assertCapability(admin: AuthenticatedAdmin, capability: AdminCapability) {
                policy.assert(admin.role, capability);
            },
            assertFreshReauthentication: jest.fn(),
            authenticate(authorization: string | undefined): Promise<AuthenticatedAdmin> {
                const token = authorization?.replace(/^Bearer /u, '');
                if (!roles.includes(token as PlatformRole)) throw administrationError('ADMIN_SESSION_INVALID', 401);
                return Promise.resolve({
                    absoluteExpiresAt: new Date('2026-09-11T18:00:00.000Z'),
                    actorId: id,
                    idleExpiresAt: new Date('2026-09-11T12:15:00.000Z'),
                    mfaVerifiedAt: new Date('2026-09-11T11:50:00.000Z'),
                    reauthenticatedAt: new Date('2026-09-11T11:59:00.000Z'),
                    role: token as PlatformRole,
                    roleGrantId: secondId,
                    sessionId: secondId,
                });
            },
            context(admin: AuthenticatedAdmin) {
                return { activeRole: admin.role, capabilities: policy.capabilities(admin.role) };
            },
        };
        const administration = Object.fromEntries(
            [
                'grantRole',
                'revokeRole',
                'lookupUser',
                'listCases',
                'caseDetail',
                'assignCase',
                'decideCase',
                'createRestriction',
                'revokeRestriction',
                'listVenues',
                'venueDetail',
                'decideVenue',
                'mergeVenue',
                'searchAudit',
                'createBreakGlass',
                'revokeBreakGlass',
            ].map((name) => [name, operation])
        );
        administration.auditAuthorizationDenied = deniedAudit;
        const module = await Test.createTestingModule({
            controllers: [AdministrationController],
            providers: [
                { provide: AdministrationSessionService, useValue: sessions },
                { provide: AdministrationService, useValue: administration },
                { provide: BrowserSecurityService, useValue: { assertMutation: jest.fn() } },
                { provide: AdministrationRateLimitService, useValue: { consume: jest.fn() } },
            ],
        }).compile();
        controller = module.get(AdministrationController);
    });

    async function call(endpoint: Endpoint, actor?: string): Promise<number> {
        const authorization = actor === undefined ? undefined : `Bearer ${actor}`;
        const key = '33333333-3333-4333-8333-333333333333';
        const browserRequest = {} as Request;
        try {
            switch (endpoint.action) {
                case 'session':
                    await controller.session(authorization);
                    break;
                case 'grantRole':
                    await controller.grantRole(authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'revokeRole':
                    await controller.revokeRole(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'lookupUser':
                    await controller.lookupUser(authorization, endpoint.body as never, browserRequest);
                    break;
                case 'listCases':
                    await controller.listCases(authorization, { limit: 25 });
                    break;
                case 'caseDetail':
                    await controller.caseDetail(id, authorization);
                    break;
                case 'assignCase':
                    await controller.assignCase(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'decideCase':
                    await controller.decideCase(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'restrictUser':
                    await controller.restrictUser(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'revokeRestriction':
                    await controller.revokeRestriction(
                        id,
                        secondId,
                        authorization,
                        key,
                        endpoint.body as never,
                        browserRequest
                    );
                    break;
                case 'listVenues':
                    await controller.listVenues(authorization, { limit: 25 });
                    break;
                case 'venueDetail':
                    await controller.venueDetail(id, authorization);
                    break;
                case 'decideVenue':
                    await controller.decideVenue(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'mergeVenue':
                    await controller.mergeVenue(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'audit':
                    await controller.audit(authorization, {
                        from: now,
                        limit: 25,
                        to: '2026-09-12T12:00:00.000Z',
                    });
                    break;
                case 'createBreakGlass':
                    await controller.createBreakGlass(authorization, key, endpoint.body as never, browserRequest);
                    break;
                case 'revokeBreakGlass':
                    await controller.revokeBreakGlass(id, authorization, key, endpoint.body as never, browserRequest);
                    break;
            }
            return endpoint.method === 'post' ? 201 : 200;
        } catch (error) {
            return (error as HttpException).getStatus();
        }
    }

    it.each(endpoints)('$method $path rejects a guest and a player bearer', async (endpoint) => {
        await expect(call(endpoint)).resolves.toBe(401);
        await expect(call(endpoint, 'PLAYER_SESSION')).resolves.toBe(401);
    });

    for (const role of roles) {
        it.each(endpoints)(`${role} is checked for $capability on $method $path`, async (endpoint) => {
            const status = await call(endpoint, role);
            const allowed = policy.capabilities(role).includes(endpoint.capability);
            if (allowed) expect(status).toBeLessThan(400);
            else expect(status).toBe(403);
        });
    }

    it('audits a known admin actor when a direct capability check is denied', async () => {
        deniedAudit.mockClear();
        const endpoint = endpoints.find(({ action }) => action === 'listCases');
        if (endpoint === undefined) throw new Error('Case-list authorization fixture is missing');
        await expect(call(endpoint, 'EDITOR')).resolves.toBe(403);
        expect(deniedAudit).toHaveBeenCalledWith(expect.objectContaining({ role: 'EDITOR' }), 'SAFETY_CASE_ROUTE');
    });
});

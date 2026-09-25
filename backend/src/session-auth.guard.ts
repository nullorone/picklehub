import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { hashSessionToken } from './telegram-auth.js';
import { PrismaService } from './prisma.service.js';

export interface AuthenticatedRequest extends Request {
    userId: string;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const authorization = request.header('authorization');
        const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/);
        if (!match) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        const session = await this.prisma.session.findFirst({
            where: { tokenHash: hashSessionToken(match[1]!), expiresAt: { gt: new Date() } },
            select: { userId: true },
        });
        if (!session) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
        request.userId = session.userId;
        return true;
    }
}

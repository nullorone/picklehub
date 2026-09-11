import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export enum AdminReasonCodeDto {
    APPROVED_ACCESS_REQUEST = 'APPROVED_ACCESS_REQUEST',
    STAFF_DUTY_CHANGE = 'STAFF_DUTY_CHANGE',
    ACCESS_REVIEW = 'ACCESS_REVIEW',
    POLICY_VIOLATION = 'POLICY_VIOLATION',
    USER_SAFETY = 'USER_SAFETY',
    DUPLICATE_VENUE = 'DUPLICATE_VENUE',
    INVALID_VENUE = 'INVALID_VENUE',
    INCIDENT_RESPONSE = 'INCIDENT_RESPONSE',
    OTHER = 'OTHER',
}

export enum AdminPurposeDto {
    SUPPORT = 'SUPPORT',
    SECURITY = 'SECURITY',
    MODERATION = 'MODERATION',
    VENUE_QUALITY = 'VENUE_QUALITY',
    ACCESS_GOVERNANCE = 'ACCESS_GOVERNANCE',
    INCIDENT_RESPONSE = 'INCIDENT_RESPONSE',
}

export class AdminMutationDto {
    @IsEnum(AdminReasonCodeDto)
    reasonCode!: AdminReasonCodeDto;

    @IsString()
    @Length(1, 128)
    policyVersion!: string;

    @IsInt()
    @Min(0)
    expectedRevision!: number;

    @IsOptional()
    @IsString()
    @Length(1, 64)
    confirmationToken?: string;
}

export class CreateRoleGrantDto extends AdminMutationDto {
    @IsUUID()
    subjectUserId!: string;

    @IsEnum(['SUPERADMIN', 'MODERATOR', 'EDITOR', 'ADS_MANAGER'])
    role!: 'SUPERADMIN' | 'MODERATOR' | 'EDITOR' | 'ADS_MANAGER';

    @IsString()
    @Length(1, 160)
    approvalReference!: string;

    @IsOptional()
    @IsISO8601({ strict: true })
    validUntil?: string;

    @IsISO8601({ strict: true })
    reviewAt!: string;
}

export class AssignCaseDto extends AdminMutationDto {
    @IsUUID()
    assigneeUserId!: string;
}

export class DecideCaseDto extends AdminMutationDto {
    @IsEnum([
        'NO_VIOLATION',
        'CONTENT_RESTRICTED',
        'WARNING',
        'INTERACTION_RESTRICTED',
        'ACCOUNT_RESTRICTED',
        'NO_SHOW_CONFIRMED',
        'RESULT_CORRECTED',
        'VENUE_ROUTED',
    ])
    outcome!:
        | 'NO_VIOLATION'
        | 'CONTENT_RESTRICTED'
        | 'WARNING'
        | 'INTERACTION_RESTRICTED'
        | 'ACCOUNT_RESTRICTED'
        | 'NO_SHOW_CONFIRMED'
        | 'RESULT_CORRECTED'
        | 'VENUE_ROUTED';

    @IsOptional()
    @IsEnum(['DIRECT_INTERACTIONS', 'MATCH_CREATION', 'PLATFORM_ACCESS'])
    restrictionScope?: 'DIRECT_INTERACTIONS' | 'MATCH_CREATION' | 'PLATFORM_ACCESS';

    @IsOptional()
    @IsISO8601({ strict: true })
    restrictionExpiresAt?: string;
}

export class ChangeRestrictionDto extends AdminMutationDto {
    @IsUUID()
    decisionId!: string;

    @IsEnum(['DIRECT_INTERACTIONS', 'MATCH_CREATION', 'PLATFORM_ACCESS'])
    scope!: 'DIRECT_INTERACTIONS' | 'MATCH_CREATION' | 'PLATFORM_ACCESS';

    @IsOptional()
    @IsISO8601({ strict: true })
    expiresAt?: string;
}

export class DecideVenueDto extends AdminMutationDto {
    @IsEnum(['APPROVE', 'REJECT'])
    decision!: 'APPROVE' | 'REJECT';
}

export class MergeVenueDto extends AdminMutationDto {
    @IsUUID()
    survivorVenueId!: string;

    @IsUUID()
    duplicateVenueId!: string;
}

export class CreateBreakGlassDto extends AdminMutationDto {
    @IsUUID()
    caseId!: string;

    @IsString()
    @Length(1, 160)
    incidentReference!: string;

    @IsString()
    @Length(1, 500)
    justification!: string;

    @IsISO8601({ strict: true })
    expiresAt!: string;
}

export class UserLookupDto {
    @IsEnum(AdminPurposeDto)
    purpose!: AdminPurposeDto;

    @IsObject()
    key!: Record<string, unknown>;

    @IsOptional()
    @IsBoolean()
    includeMaskedIdentity?: boolean;
}

export class PaginationDto {
    @IsOptional()
    @IsString()
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit = 25;
}

export class CaseQueryDto extends PaginationDto {
    @IsOptional()
    @IsEnum(['NO_SHOW', 'SAFETY', 'CONTENT', 'VENUE', 'RESULT'])
    kind?: string;

    @IsOptional()
    @IsEnum(['OPEN', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'DECIDED', 'CLOSED', 'REOPENED'])
    state?: string;

    @IsOptional()
    @IsEnum(['URGENT', 'HIGH', 'NORMAL'])
    priority?: string;

    @IsOptional()
    @IsEnum(['UNASSIGNED', 'ASSIGNED_TO_ME', 'ASSIGNED_TO_OTHER'])
    assignment?: string;

    @IsOptional()
    @IsEnum(['LT_1_HOUR', 'H1_24', 'D1_7', 'D8_30', 'GT_30_DAYS'])
    age?: string;
}

export class VenueQueryDto extends PaginationDto {
    @IsOptional()
    @IsEnum(['CANDIDATE', 'REVISION', 'REPORT'])
    kind?: string;

    @IsOptional()
    @IsEnum(['AWAITING_MATCH_COMPLETION', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PENDING', 'RESOLVED', 'MERGED'])
    state?: string;

    @IsOptional()
    @IsEnum(['PLAYER', 'OSM', 'PROVIDER'])
    sourceClass?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    locality?: string;

    @IsOptional()
    @IsEnum(['LT_1_HOUR', 'H1_24', 'D1_7', 'D8_30', 'GT_30_DAYS'])
    age?: string;
}

export class AuditQueryDto extends PaginationDto {
    @IsISO8601({ strict: true })
    from!: string;

    @IsISO8601({ strict: true })
    to!: string;

    @IsOptional()
    @IsUUID()
    actorId?: string;

    @IsOptional()
    @IsString()
    action?: string;

    @IsOptional()
    @IsString()
    targetType?: string;

    @IsOptional()
    @IsUUID()
    targetId?: string;

    @IsOptional()
    @IsEnum(['SUCCEEDED', 'DENIED', 'FAILED', 'CONFLICT'])
    outcome?: string;

    @IsOptional()
    @IsUUID()
    requestId?: string;

    @IsOptional()
    @IsUUID()
    correlationId?: string;
}

export class RevokeDto extends AdminMutationDto {}

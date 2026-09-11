import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';

import {
    BookingStateDto,
    DraftMatchDto,
    MatchFormatDto,
    MatchJoinModeDto,
    MatchVisibilityDto,
} from '../matches/match.dto';

export enum ClubMembershipPolicyDto {
    OPEN = 'OPEN',
    APPROVAL = 'APPROVAL',
    INVITE_ONLY = 'INVITE_ONLY',
}

export enum ClubAssignableRoleDto {
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
}

export enum RecurringOverlapPolicyDto {
    EARLIER_OFFSET = 'EARLIER_OFFSET',
    LATER_OFFSET = 'LATER_OFFSET',
}

export class ClubSearchDto {
    @IsOptional() @IsString() @MinLength(1) @MaxLength(120) query?: string;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(120) locality?: string;
    @IsOptional() @IsUUID() venueId?: string;
    @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class CreateClubDto {
    @IsString() @MinLength(1) @MaxLength(120) name!: string;
    @IsString() @MaxLength(1000) description!: string;
    @IsString() @MinLength(1) @MaxLength(120) locality!: string;
    @IsEnum(ClubMembershipPolicyDto) membershipPolicy!: ClubMembershipPolicyDto;
}

export class ExpectedClubVersionDto {
    @IsInt() @Min(0) expectedVersion!: number;
}

export class UpdateClubDto extends ExpectedClubVersionDto {
    @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
    @IsOptional() @IsString() @MaxLength(1000) description?: string;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(120) locality?: string;
    @IsOptional() @IsEnum(ClubMembershipPolicyDto) membershipPolicy?: ClubMembershipPolicyDto;
}

export class ExpectedClubResourceDto {
    @IsInt() @Min(0) expectedClubVersion!: number;
    @IsInt() @Min(0) expectedRevision!: number;
}

export class ClubReasonDto extends ExpectedClubVersionDto {
    @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,95}$/u) reasonCode!: string;
}

export class ClubResourceReasonDto extends ExpectedClubResourceDto {
    @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,95}$/u) reasonCode!: string;
}

export class InviteClubMemberDto extends ExpectedClubVersionDto {
    @IsUUID() inviteeId!: string;
}

export class ChangeClubRoleDto extends ClubResourceReasonDto {
    @IsEnum(ClubAssignableRoleDto) role!: ClubAssignableRoleDto;
}

export class TransferClubOwnershipDto extends ClubReasonDto {
    @IsUUID() targetMembershipId!: string;
}

export class ClubVenueDto extends ExpectedClubVersionDto {
    @IsUUID() venueId!: string;
}

export class CreateClubMatchDto extends ExpectedClubVersionDto {
    @ValidateNested() @Type(() => DraftMatchDto) match!: DraftMatchDto;
}

export class RecurringMatchTemplateDto {
    @IsEnum(MatchFormatDto) format!: MatchFormatDto;
    @IsEnum(MatchVisibilityDto) visibility!: MatchVisibilityDto;
    @IsEnum(MatchJoinModeDto) joinMode!: MatchJoinModeDto;
    @IsUUID() venueId!: string;
    @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5) skillMin!: number;
    @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5) skillMax!: number;
    @IsString() @MinLength(1) @MaxLength(1000) description!: string;
    @IsEnum(BookingStateDto) bookingState!: BookingStateDto;
    @IsOptional() @IsString() @MaxLength(280) bookingNote?: string | null;
}

export class CreateRecurringRuleDto extends ExpectedClubVersionDto {
    @IsString() @Matches(/^WEEKLY$/u) frequency!: 'WEEKLY';
    @IsInt() @Min(1) @Max(12) intervalWeeks!: number;
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) weekdays!: number[];
    @IsString() @Matches(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u) localStartTime!: string;
    @IsString() @MinLength(1) @MaxLength(64) timeZone!: string;
    @IsString() @Matches(/^SKIP$/u) dstGapPolicy!: 'SKIP';
    @IsEnum(RecurringOverlapPolicyDto) dstOverlapPolicy!: RecurringOverlapPolicyDto;
    @IsDateString() startsOn!: string;
    @IsOptional() @IsDateString() endsOn?: string | null;
    @ValidateNested() @Type(() => RecurringMatchTemplateDto) template!: RecurringMatchTemplateDto;
}

export class UpdateRecurringRuleDto extends ExpectedClubResourceDto {
    @IsOptional() @IsInt() @Min(1) @Max(12) intervalWeeks?: number;
    @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) weekdays?: number[];
    @IsOptional() @IsString() @Matches(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u) localStartTime?: string;
    @IsOptional() @IsDateString() endsOn?: string | null;
    @IsOptional() @IsEnum(RecurringOverlapPolicyDto) dstOverlapPolicy?: RecurringOverlapPolicyDto;
    @IsOptional() @ValidateNested() @Type(() => RecurringMatchTemplateDto) template?: RecurringMatchTemplateDto;
}

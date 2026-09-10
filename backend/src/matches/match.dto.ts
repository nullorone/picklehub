import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';

export enum MatchFormatDto {
    SINGLES = 'SINGLES',
    DOUBLES = 'DOUBLES',
}
export enum MatchVisibilityDto {
    PUBLIC = 'PUBLIC',
    UNLISTED = 'UNLISTED',
}
export enum MatchJoinModeDto {
    AUTO = 'AUTO',
    APPROVAL = 'APPROVAL',
}
export enum MatchTeamDto {
    TEAM_A = 'TEAM_A',
    TEAM_B = 'TEAM_B',
}
export enum MatchTeamChoiceDto {
    TEAM_A = 'TEAM_A',
    TEAM_B = 'TEAM_B',
    ANY = 'ANY',
}
export enum BookingStateDto {
    UNKNOWN = 'UNKNOWN',
    NOT_BOOKED = 'NOT_BOOKED',
    BOOKED_EXTERNALLY = 'BOOKED_EXTERNALLY',
}
export enum MatchResultModeDto {
    SCORED = 'SCORED',
    PLAYED_WITHOUT_SCORE = 'PLAYED_WITHOUT_SCORE',
}
export enum MatchSeriesFormatDto {
    BEST_OF_1 = 'BEST_OF_1',
    BEST_OF_3 = 'BEST_OF_3',
    BEST_OF_5 = 'BEST_OF_5',
}

export class GuestDto {
    @IsEnum(MatchTeamDto) team!: MatchTeamDto;
    @IsString() @MinLength(1) @MaxLength(50) label!: string;
}

export class DraftMatchDto {
    @IsOptional() @IsEnum(MatchFormatDto) format?: MatchFormatDto | null;
    @IsOptional() @IsEnum(MatchVisibilityDto) visibility?: MatchVisibilityDto | null;
    @IsOptional() @IsEnum(MatchJoinModeDto) joinMode?: MatchJoinModeDto | null;
    @IsOptional() @IsDateString() startsAt?: string | null;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(64) timeZone?: string | null;
    @IsOptional() @IsUUID() venueId?: string | null;
    @IsOptional() @IsUUID() venueCandidateId?: string | null;
    @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5) skillMin?: number | null;
    @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5) skillMax?: number | null;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) description?: string | null;
    @IsOptional() @IsEnum(BookingStateDto) bookingState?: BookingStateDto;
    @IsOptional() @IsString() @MaxLength(280) bookingNote?: string | null;
    @IsOptional() @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => GuestDto) guests?: GuestDto[];
}

export class UpdateMatchDto extends DraftMatchDto {
    @IsInt() @Min(0) expectedVersion!: number;
}
export class VersionDto {
    @IsInt() @Min(0) expectedVersion!: number;
}
export class JoinMatchDto extends VersionDto {
    @IsEnum(MatchTeamChoiceDto) teamChoice!: MatchTeamChoiceDto;
}

export class GameScoreDto {
    @IsInt() @Min(1) @Max(5) gameNumber!: number;
    @IsInt() @Min(0) @Max(99) teamAPoints!: number;
    @IsInt() @Min(0) @Max(99) teamBPoints!: number;
}

export class ProposeResultDto extends VersionDto {
    @IsEnum(MatchResultModeDto) mode!: MatchResultModeDto;
    @IsOptional() @IsEnum(MatchSeriesFormatDto) seriesFormat?: MatchSeriesFormatDto;
    @IsOptional() @IsEnum(MatchTeamDto) winningTeam?: MatchTeamDto;
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5)
    @ValidateNested({ each: true })
    @Type(() => GameScoreDto)
    games?: GameScoreDto[];
}

export class ResolveResultDto extends VersionDto {
    @IsInt() @Min(1) resultVersion!: number;
}

export class MatchSearchDto {
    @IsOptional() @IsEnum(MatchFormatDto) format?: MatchFormatDto;
    @IsOptional() @IsDateString() startsFrom?: string;
    @IsOptional() @IsDateString() startsTo?: string;
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5) skillLevel?: number;
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) longitude?: number;
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) latitude?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50_000) radiusMeters?: number;
    @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

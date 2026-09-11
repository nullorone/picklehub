import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    Equals,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export enum ReviewTagDto {
    RESPECT = 'RESPECT',
    COMMUNICATION = 'COMMUNICATION',
    FAIR_PLAY = 'FAIR_PLAY',
}
export enum NoShowReasonDto {
    DID_NOT_ARRIVE = 'DID_NOT_ARRIVE',
    LEFT_BEFORE_PLAY = 'LEFT_BEFORE_PLAY',
    UNREACHABLE_AT_START = 'UNREACHABLE_AT_START',
}
export enum ReportKindDto {
    SAFETY = 'SAFETY',
    CONTENT = 'CONTENT',
    VENUE = 'VENUE',
    RESULT = 'RESULT',
}
export enum ReportSourceKindDto {
    MATCH = 'MATCH',
    CHAT_MESSAGE = 'CHAT_MESSAGE',
    PROFILE = 'PROFILE',
    VENUE = 'VENUE',
    MATCH_RESULT = 'MATCH_RESULT',
}
export enum ReportTimeBucketDto {
    NOW = 'NOW',
    TODAY = 'TODAY',
    LAST_7_DAYS = 'LAST_7_DAYS',
    LAST_30_DAYS = 'LAST_30_DAYS',
    OVER_30_DAYS = 'OVER_30_DAYS',
}
export enum SafetyReasonDto {
    THREAT = 'THREAT',
    HARASSMENT = 'HARASSMENT',
    HATE_OR_DISCRIMINATION = 'HATE_OR_DISCRIMINATION',
    STALKING = 'STALKING',
    PHYSICAL_SAFETY = 'PHYSICAL_SAFETY',
    OTHER_SAFETY = 'OTHER_SAFETY',
}
export enum ContentReasonDto {
    SPAM = 'SPAM',
    HARASSMENT = 'HARASSMENT',
    HATE = 'HATE',
    THREAT = 'THREAT',
    OTHER = 'OTHER',
}
export enum VenueReasonDto {
    PRIVATE_RESIDENCE = 'PRIVATE_RESIDENCE',
    DUPLICATE = 'DUPLICATE',
    CLOSED = 'CLOSED',
}
export enum ResultReasonDto {
    WRONG_SCORE = 'WRONG_SCORE',
    WRONG_WINNER = 'WRONG_WINNER',
    MATCH_NOT_PLAYED = 'MATCH_NOT_PLAYED',
    OTHER = 'OTHER',
}
export enum ResponseDispositionDto {
    AGREE = 'AGREE',
    DISPUTE = 'DISPUTE',
    PROVIDE_CONTEXT = 'PROVIDE_CONTEXT',
}
export enum AppealReasonDto {
    FACTUAL_ERROR = 'FACTUAL_ERROR',
    POLICY_MISAPPLIED = 'POLICY_MISAPPLIED',
    NEW_INFORMATION = 'NEW_INFORMATION',
    OTHER = 'OTHER',
}

const normalize = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.normalize('NFKC').trim() : value;

export class ReviewSubmissionDto {
    @IsInt() @Min(1) @Max(5) experienceRating!: number;
    @IsArray() @ArrayMaxSize(3) @IsEnum(ReviewTagDto, { each: true }) tags!: ReviewTagDto[];
    @IsOptional() @Transform(normalize) @IsString() @MinLength(1) @MaxLength(500) text?: string;
}
export class NoShowSubmissionDto {
    @IsUUID() subjectPlayerId!: string;
    @IsEnum(NoShowReasonDto) reason!: NoShowReasonDto;
    @IsOptional() @Transform(normalize) @IsString() @MinLength(1) @MaxLength(2000) evidence?: string;
}
export class ReportSubmissionDto {
    @IsEnum(ReportKindDto) kind!: ReportKindDto;
    @IsString() @MaxLength(64) reason!: string;
    @IsOptional() @IsUUID() subjectPlayerId?: string;
    @IsEnum(ReportSourceKindDto) sourceKind!: ReportSourceKindDto;
    @IsUUID() sourceId!: string;
    @IsInt() @Min(1) sourceRevision!: number;
    @IsOptional() @IsEnum(ReportTimeBucketDto) timeBucket?: ReportTimeBucketDto;
    @IsOptional() @Transform(normalize) @IsString() @MinLength(1) @MaxLength(2000) evidence?: string;
}
export class WithdrawalDto {
    @Equals(true) requested!: true;
}
export class CaseResponseDto {
    @IsOptional() @IsEnum(ResponseDispositionDto) noShowDisposition?: ResponseDispositionDto;
    @Transform(normalize) @IsString() @MinLength(1) @MaxLength(2000) text!: string;
}
export class AppealDto {
    @IsEnum(AppealReasonDto) reason!: AppealReasonDto;
    @IsOptional() @Transform(normalize) @IsString() @MinLength(1) @MaxLength(2000) text?: string;
}

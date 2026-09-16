import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEmail,
    IsEnum,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator';

export enum ClientPlatform {
    WEB = 'WEB',
    TMA = 'TMA',
    MOBILE = 'MOBILE',
}

export enum MobileDeepLinkKind {
    MATCHES = 'MATCHES',
    MATCH = 'MATCH',
    MATCH_CHAT = 'MATCH_CHAT',
    VENUES = 'VENUES',
    VENUE = 'VENUE',
    NOTIFICATIONS = 'NOTIFICATIONS',
    PROFILE = 'PROFILE',
    PLAYER = 'PLAYER',
    ACCOUNT = 'ACCOUNT',
    SAFETY = 'SAFETY',
    SAFETY_RECEIPT = 'SAFETY_RECEIPT',
}

export class MobileDeepLinkTargetDto {
    @IsEnum(MobileDeepLinkKind)
    kind!: MobileDeepLinkKind;

    @IsOptional()
    @IsUUID()
    matchId?: string;

    @IsOptional()
    @IsUUID()
    venueId?: string;

    @IsOptional()
    @IsUUID()
    playerId?: string;

    @IsOptional()
    @IsUUID()
    receiptId?: string;
}

export enum ProofSide {
    CURRENT = 'CURRENT',
    TARGET = 'TARGET',
}

export class TelegramLoginDto {
    @IsString()
    @MinLength(1)
    @MaxLength(8192)
    initData!: string;

    @IsIn([ClientPlatform.WEB, ClientPlatform.TMA])
    platform!: ClientPlatform.WEB | ClientPlatform.TMA;
}

export class EmailRequestDto {
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsEmail({ allow_utf8_local_part: false })
    @MaxLength(320)
    email!: string;

    @IsIn([ClientPlatform.WEB, ClientPlatform.TMA])
    platform!: ClientPlatform.WEB | ClientPlatform.TMA;
}

export class MagicConsumeDto {
    @IsString()
    @Length(43, 43)
    token!: string;

    @IsIn([ClientPlatform.WEB, ClientPlatform.TMA])
    platform!: ClientPlatform.WEB | ClientPlatform.TMA;
}

export class NativeEmailRequestDto {
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsEmail({ allow_utf8_local_part: false })
    @MaxLength(320)
    email!: string;

    @IsIn([ClientPlatform.MOBILE])
    platform!: ClientPlatform.MOBILE;

    @IsString()
    @Length(43, 43)
    @Matches(/^[A-Za-z0-9_-]{43}$/u)
    codeChallenge!: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => MobileDeepLinkTargetDto)
    destination?: MobileDeepLinkTargetDto;
}

export class NativeMagicConsumeDto {
    @IsString()
    @Length(43, 43)
    token!: string;

    @IsIn([ClientPlatform.MOBILE])
    platform!: ClientPlatform.MOBILE;

    @IsString()
    @MinLength(43)
    @MaxLength(128)
    @Matches(/^[A-Za-z0-9._~-]+$/u)
    codeVerifier!: string;
}

export class NativeRefreshDto {
    @IsString()
    @Length(43, 43)
    refreshToken!: string;
}

export class EmptyDto {}

export class StartAttemptDto {
    @IsIn(['LINK', 'UNLINK', 'DELETE_ACCOUNT'])
    action!: 'LINK' | 'UNLINK' | 'DELETE_ACCOUNT';

    @IsOptional()
    @IsIn(['TELEGRAM', 'EMAIL'])
    targetProvider?: 'TELEGRAM' | 'EMAIL';

    @IsOptional()
    @IsUUID()
    identityId?: string;
}

export class TelegramProofDto {
    @IsEnum(ProofSide)
    side!: ProofSide;

    @IsString()
    @MinLength(1)
    @MaxLength(8192)
    initData!: string;
}

export class EmailProofRequestDto {
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsEmail({ allow_utf8_local_part: false })
    @MaxLength(320)
    email!: string;

    @IsEnum(ProofSide)
    side!: ProofSide;
}

export class EmailProofConsumeDto {
    @IsString()
    @Length(43, 43)
    token!: string;
}

export class FinishAttemptDto {
    @IsUUID()
    attemptId!: string;
}

export class UpdateDraftDto {
    @IsNumber()
    expectedVersion!: number;

    @IsOptional()
    @IsString()
    @Length(2, 50)
    displayName?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    timeZone?: string | null;

    @IsOptional()
    @IsUUID()
    localityId?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(2)
    @ArrayUnique()
    @IsIn(['SINGLES', 'DOUBLES'], { each: true })
    gameFormats?: string[];

    @IsOptional()
    @IsIn([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
    skillSelfAssessment?: number | null;

    @IsOptional()
    @IsString()
    @MaxLength(2048)
    duprProfileUrl?: string | null;
}

export class CompleteOnboardingDto {
    @IsNumber()
    expectedVersion!: number;

    @IsString()
    @Length(1, 128)
    termsVersion!: string;

    @IsString()
    @Length(1, 128)
    personalDataVersion!: string;
}

export class ConsentChangeDto {
    @IsIn(['TERMS', 'PERSONAL_DATA', 'ANALYTICS', 'MARKETING'])
    purpose!: 'TERMS' | 'PERSONAL_DATA' | 'ANALYTICS' | 'MARKETING';

    @IsString()
    @Length(1, 128)
    version!: string;

    @IsIn(['ACCEPTED', 'WITHDRAWN'])
    action!: 'ACCEPTED' | 'WITHDRAWN';

    @IsEnum(ClientPlatform)
    platform!: ClientPlatform;
}

export class DeleteAccountDto extends FinishAttemptDto {
    @IsBoolean()
    @IsIn([true])
    confirmed!: true;
}

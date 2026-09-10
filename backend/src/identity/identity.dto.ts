import { Transform } from 'class-transformer';
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
    MaxLength,
    MinLength,
} from 'class-validator';

export enum ClientPlatform {
    WEB = 'WEB',
    TMA = 'TMA',
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

    @IsEnum(ClientPlatform)
    platform!: ClientPlatform;
}

export class EmailRequestDto {
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsEmail({ allow_utf8_local_part: false })
    @MaxLength(320)
    email!: string;

    @IsEnum(ClientPlatform)
    platform!: ClientPlatform;
}

export class MagicConsumeDto {
    @IsString()
    @Length(43, 43)
    token!: string;

    @IsEnum(ClientPlatform)
    platform!: ClientPlatform;
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

import { Type, Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsString,
    Length,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

export class LeaderboardConsentDto {
    @IsBoolean()
    optedIn!: boolean;

    @IsString()
    @Length(5, 32)
    policyVersion!: string;

    @IsInt()
    @Min(0)
    expectedRevision!: number;
}

export class ClubXpTemplateDto {
    @IsIn(['CONFIRMED_PLAY', 'CONFIRMED_MATCH_ORGANIZED', 'ELIGIBLE_STRUCTURED_REVIEW'])
    sourceKind!: 'CONFIRMED_PLAY' | 'CONFIRMED_MATCH_ORGANIZED' | 'ELIGIBLE_STRUCTURED_REVIEW';

    @IsBoolean()
    enabled!: boolean;

    @IsInt()
    @Min(5)
    @Max(20)
    coefficientTenths!: number;

    @IsInt()
    @Min(0)
    baseXp!: number;

    @IsInt()
    @Min(1)
    @Max(3)
    dailyEventCap!: number;

    @IsInt()
    @Min(1)
    @Max(10)
    weeklyEventCap!: number;
}

export class ClubLevelDto {
    @IsInt()
    @Min(1)
    @Max(20)
    ordinal!: number;

    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').trim() : value))
    @IsString()
    @Length(1, 30)
    name!: string;

    @IsInt()
    @Min(0)
    thresholdXp!: number;
}

export class UpdateClubGamificationDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;

    @IsString()
    effectiveFrom!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @ValidateNested({ each: true })
    @Type(() => ClubXpTemplateDto)
    templates!: ClubXpTemplateDto[];

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => ClubLevelDto)
    levels!: ClubLevelDto[];
}

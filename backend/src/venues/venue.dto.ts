import { Type } from 'class-transformer';
import {
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
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

export enum VenueAccessModeDto {
    FREE = 'FREE',
    PAID = 'PAID',
    REGISTRATION_REQUIRED = 'REGISTRATION_REQUIRED',
    MEMBERS_ONLY = 'MEMBERS_ONLY',
    UNKNOWN = 'UNKNOWN',
}
export enum VenueEnvironmentDto {
    INDOOR = 'INDOOR',
    OUTDOOR = 'OUTDOOR',
    MIXED = 'MIXED',
    UNKNOWN = 'UNKNOWN',
}
export enum VenueAmenityStateDto {
    YES = 'YES',
    NO = 'NO',
    UNKNOWN = 'UNKNOWN',
}
export enum VenueReportReasonDto {
    PRIVATE_RESIDENCE = 'PRIVATE_RESIDENCE',
    DUPLICATE = 'DUPLICATE',
    CLOSED = 'CLOSED',
}

export class GeoPointDto {
    @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) longitude!: number;
    @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) latitude!: number;
}

export class VenueFiltersDto {
    @IsOptional() @IsEnum(VenueAccessModeDto) accessMode?: VenueAccessModeDto;
    @IsOptional() @IsEnum(VenueEnvironmentDto) environment?: VenueEnvironmentDto;
    @IsOptional() @IsEnum(VenueAmenityStateDto) permanentNet?: VenueAmenityStateDto;
    @IsOptional() @IsEnum(VenueAmenityStateDto) lighting?: VenueAmenityStateDto;
    @IsOptional() @IsIn(['PUBLISHED']) publicationState?: 'PUBLISHED';
}

export class VenueListQueryDto extends VenueFiltersDto {
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) longitude?: number;
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) latitude?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50_000) radiusMeters?: number;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(160) query?: string;
    @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class VenueMapQueryDto extends VenueFiltersDto {
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) west!: number;
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) south!: number;
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) east!: number;
    @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) north!: number;
    @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
}

export class GeocoderQueryDto {
    @IsString() @MinLength(2) @MaxLength(160) query!: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) limit = 5;
}

export class CandidateSourceDto {
    @IsIn(['MANUAL_PIN', 'ALLOWED_GEOCODER']) kind!: 'MANUAL_PIN' | 'ALLOWED_GEOCODER';
    @IsOptional() @IsString() @MinLength(16) @MaxLength(512) selectionToken?: string;
}

export class CreateVenueCandidateDto {
    @IsUUID() sourceMatchId!: string;
    @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
    @IsString() @IsNotEmpty() @MaxLength(500) normalizedAddress!: string;
    @IsString() @IsNotEmpty() @MaxLength(160) locality!: string;
    @IsString() @IsNotEmpty() @MaxLength(64) timeZone!: string;
    @ValidateNested() @Type(() => GeoPointDto) location!: GeoPointDto;
    @ValidateNested() @Type(() => CandidateSourceDto) source!: CandidateSourceDto;
}

export class VenueAmenitiesDto {
    @IsEnum(VenueAmenityStateDto) permanentNet!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) lighting!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) changingRoom!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) toilet!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) drinkingWater!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) parking!: VenueAmenityStateDto;
    @IsEnum(VenueAmenityStateDto) wheelchairAccess!: VenueAmenityStateDto;
}

export class ProposeVenueRevisionDto {
    @IsInt() @Min(1) baseVersion!: number;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) normalizedAddress?: string;
    @IsOptional() @ValidateNested() @Type(() => GeoPointDto) location?: GeoPointDto;
    @IsOptional() @IsEnum(VenueAccessModeDto) accessMode?: VenueAccessModeDto;
    @IsOptional() @IsEnum(VenueEnvironmentDto) environment?: VenueEnvironmentDto;
    @IsOptional() @ValidateNested() @Type(() => VenueAmenitiesDto) amenities?: VenueAmenitiesDto;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) seasonality?: string | null;
}

export class CreateVenueReportDto {
    @IsEnum(VenueReportReasonDto) reason!: VenueReportReasonDto;
}

import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Matches,
    Max,
    Min,
} from 'class-validator';

export class UpdatePlayerProfileDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').trim() : value))
    @IsString()
    @Length(2, 50)
    displayName?: string;

    @IsOptional()
    @IsUUID()
    localityId?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(2)
    @ArrayUnique()
    @IsIn(['SINGLES', 'DOUBLES'], { each: true })
    gameFormats?: ('SINGLES' | 'DOUBLES')[];

    @IsOptional()
    @IsIn([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
    skillSelfAssessment?: number;

    @IsOptional()
    @IsString()
    @Length(1, 64)
    timeZone?: string;
}

export class UpdateProfilePrivacyDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;

    @IsIn(['PUBLIC', 'PRIVATE'])
    visibility!: 'PUBLIC' | 'PRIVATE';
}

export class SetDuprProfileLinkDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;

    @IsString()
    @Length(1, 2048)
    url!: string;
}

export class ExpectedProfileVersionDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;
}

export class AvatarUploadRequestDto extends ExpectedProfileVersionDto {
    @IsIn(['image/jpeg', 'image/png', 'image/webp'])
    contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

    @IsInt()
    @Min(1)
    @Max(5_242_880)
    contentLength!: number;

    @IsString()
    @Matches(/^[a-f0-9]{64}$/u)
    sha256!: string;
}

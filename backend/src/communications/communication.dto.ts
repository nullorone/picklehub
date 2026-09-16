import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';

export enum ChatReportReasonDto {
    SPAM = 'SPAM',
    HARASSMENT = 'HARASSMENT',
    HATE = 'HATE',
    THREAT = 'THREAT',
    OTHER = 'OTHER',
}

export enum NotificationCategoryDto {
    ROSTER = 'ROSTER',
    REQUESTS = 'REQUESTS',
    MATCH_CRITICAL = 'MATCH_CRITICAL',
    REMINDERS = 'REMINDERS',
    RESULTS = 'RESULTS',
    CHAT = 'CHAT',
}

export enum NotificationChannelDto {
    IN_APP = 'IN_APP',
    TELEGRAM = 'TELEGRAM',
    EMAIL = 'EMAIL',
    PUSH = 'PUSH',
}

export class SendMessageDto {
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFKC').trim() : value))
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    text!: string;
}

export class EditMessageDto extends SendMessageDto {
    @IsInt()
    @Min(1)
    expectedRevision!: number;
}

export class MarkConversationReadDto {
    @IsInt()
    @Min(0)
    throughSequence!: number;
}

export class ReportMessageDto {
    @IsInt()
    @Min(1)
    revision!: number;

    @IsEnum(ChatReportReasonDto)
    reason!: ChatReportReasonDto;
}

export class QuietHoursDto {
    @IsBoolean()
    enabled!: boolean;

    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
    startLocal!: string;

    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
    endLocal!: string;
}

export class NotificationChannelPreferenceDto {
    @IsEnum(NotificationCategoryDto)
    category!: NotificationCategoryDto;

    @IsEnum(NotificationChannelDto)
    channel!: NotificationChannelDto;

    @IsBoolean()
    enabled!: boolean;
}

export class UpdateNotificationPreferenceDto {
    @IsInt()
    @Min(0)
    expectedVersion!: number;

    @IsString()
    @MinLength(2)
    @MaxLength(35)
    locale!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(64)
    timeZone!: string;

    @ValidateNested()
    @Type(() => QuietHoursDto)
    quietHours!: QuietHoursDto;

    @IsArray()
    @ArrayMaxSize(18)
    @ValidateNested({ each: true })
    @Type(() => NotificationChannelPreferenceDto)
    channels!: NotificationChannelPreferenceDto[];
}

export class BindNotificationDeviceDto {
    @IsUUID('4')
    installationId!: string;

    @IsEnum({ WEB: 'WEB', TMA: 'TMA', MOBILE: 'MOBILE' })
    platform!: 'WEB' | 'TMA' | 'MOBILE';
}

export enum MobileOperatingSystemDto {
    IOS = 'IOS',
    ANDROID = 'ANDROID',
}

export enum PushEnvironmentDto {
    SANDBOX = 'SANDBOX',
    PRODUCTION = 'PRODUCTION',
}

export class RegisterPushTokenDto {
    @IsEnum(MobileOperatingSystemDto)
    operatingSystem!: MobileOperatingSystemDto;

    @IsEnum(PushEnvironmentDto)
    environment!: PushEnvironmentDto;

    @IsString()
    @Matches(/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u)
    @MaxLength(64)
    appVersion!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(4096)
    token!: string;
}

export class CommunicationPageDto {
    @Transform(({ value }: { value: unknown }) => Number(value ?? 50))
    @IsInt()
    @Min(1)
    @Max(50)
    limit = 50;
}

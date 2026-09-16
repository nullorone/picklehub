import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export enum MiniGameMode {
    STANDARD = 'STANDARD',
    CALM = 'CALM',
}

const DEFINITION_VERSION = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u;
const CHALLENGE = /^mgc1_[A-Za-z0-9_-]{43,512}$/u;
const RESULT_PROOF = /^mgr1_[A-Za-z0-9_-]{43,512}$/u;
const CAPABILITY = /^mgl1_[A-Za-z0-9_-]{43,256}$/u;
const NONCE = /^[A-Za-z0-9_-]{22,86}$/u;

export class CreateGameSessionDto {
    @IsEnum(MiniGameMode)
    mode!: MiniGameMode;

    @IsString()
    @Matches(DEFINITION_VERSION)
    configurationVersion!: string;
}

export class GameResultCountersDto {
    @IsInt()
    @Min(1)
    @Max(180)
    attempts!: number;

    @IsInt()
    @Min(0)
    @Max(180)
    successfulReturns!: number;

    @IsInt()
    @Min(0)
    @Max(180)
    targetHits!: number;

    @IsInt()
    @Min(0)
    @Max(36)
    streakBonuses!: number;

    @IsInt()
    @Min(0)
    @Max(180)
    leftTargetHits!: number;

    @IsInt()
    @Min(0)
    @Max(180)
    centerTargetHits!: number;

    @IsInt()
    @Min(0)
    @Max(180)
    rightTargetHits!: number;
}

export class SubmitGameResultDto {
    @IsString()
    @Matches(CHALLENGE)
    challengeProof!: string;

    @IsString()
    @Matches(NONCE)
    nonce!: string;

    @IsString()
    @Matches(DEFINITION_VERSION)
    configurationVersion!: string;

    @IsEnum(MiniGameMode)
    mode!: MiniGameMode;

    @IsInt()
    @Min(1)
    @Max(900_000)
    activeDurationMilliseconds!: number;

    @IsInt()
    @Min(0)
    @Max(600_000)
    pausedDurationMilliseconds!: number;

    @ValidateNested()
    @Type(() => GameResultCountersDto)
    counters!: GameResultCountersDto;
}

export class ClaimGameRewardsDto {
    @IsString()
    @Matches(RESULT_PROOF)
    resultProof!: string;
}

export class ExchangeGameWebViewLaunchDto {
    @IsString()
    @Matches(CAPABILITY)
    capability!: string;
}

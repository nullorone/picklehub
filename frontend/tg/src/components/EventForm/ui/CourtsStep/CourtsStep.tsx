import type { EventFormStepProps } from "../../types";
import { maxCourtCount, maxParticipantCount } from "../../const";
import {
    GlassCheckbox,
    GlassInput,
    GlassSeparator,
    GlassSwitch,
} from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";

type CourtsStepProps = EventFormStepProps<
    | "courtCount"
    | "participantLimit"
    | "availableSpots"
    | "availableSpotsMatchPlayers"
    | "waitlistEnabled"
    | "waitlistAutoRotation"
    | "playerModeration"
    | "organizerParticipates"
> & {
    formId: string;
};

export function CourtsStep({
    values,
    hidden,
    busy,
    update,
    errors,
    formId,
}: CourtsStepProps) {
    return (
        <fieldset
            hidden={hidden}
            className="grid w-full max-w-sm gap-6"
            disabled={busy}
        >
            <div className="grid gap-4">
                <div className="grid w-full max-w-sm grid-cols-[auto_auto] items-center justify-between gap-x-4 gap-y-2">
                    <Label
                        htmlFor={`${formId}-courtCount`}
                        className="text-white/80"
                    >
                        Число кортов
                    </Label>
                    <GlassInput
                        id={`${formId}-courtCount`}
                        name="courtCount"
                        type="number"
                        className="w-[calc(2ch+2rem+2px)] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        min={1}
                        max={maxCourtCount}
                        step={1}
                        value={values.courtCount}
                        aria-invalid={Boolean(errors.courtCount)}
                        aria-describedby={
                            errors.courtCount
                                ? `${formId}-courtCount-error`
                                : undefined
                        }
                        onChange={(event) => {
                            const value = event.target.value;
                            if (
                                /^\d{0,2}$/.test(value) &&
                                Number(value) <= maxCourtCount
                            ) {
                                update("courtCount", value);
                            }
                        }}
                    />
                    {errors.courtCount && (
                        <span
                            id={`${formId}-courtCount-error`}
                            className="col-span-2 text-sm text-error"
                            role="alert"
                        >
                            {errors.courtCount}
                        </span>
                    )}
                </div>
                <div className="grid w-full max-w-sm grid-cols-[auto_auto] items-center justify-between gap-x-4 gap-y-2">
                    <Label
                        htmlFor={`${formId}-participantLimit`}
                        className="text-white/80"
                    >
                        Количество игроков
                    </Label>
                    <GlassInput
                        id={`${formId}-participantLimit`}
                        name="participantLimit"
                        type="number"
                        className="w-[calc(2ch+2rem+2px)] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        min={2}
                        max={maxParticipantCount}
                        step={1}
                        value={values.participantLimit}
                        onBlur={() => {
                            if (values.availableSpotsMatchPlayers) {
                                update(
                                    "availableSpots",
                                    values.participantLimit,
                                );
                            }
                        }}
                        aria-invalid={Boolean(errors.participantLimit)}
                        aria-describedby={
                            errors.participantLimit
                                ? `${formId}-participantLimit-error`
                                : undefined
                        }
                        onChange={(event) => {
                            const value = event.target.value;
                            if (
                                /^\d{0,2}$/.test(value) &&
                                Number(value) <= maxParticipantCount
                            ) {
                                update("participantLimit", value);
                            }
                        }}
                    />
                    {errors.participantLimit && (
                        <span
                            id={`${formId}-participantLimit-error`}
                            className="col-span-2 text-sm text-error"
                            role="alert"
                        >
                            {errors.participantLimit}
                        </span>
                    )}
                </div>
            </div>
            <GlassSeparator />
            <div className="grid gap-4">
                <div className="grid w-full max-w-sm grid-cols-[auto_auto] items-center justify-between gap-x-4 gap-y-2">
                    <Label
                        htmlFor={`${formId}-availableSpots`}
                        className="text-white/80"
                    >
                        Мест для записи
                    </Label>
                    <GlassInput
                        id={`${formId}-availableSpots`}
                        name="availableSpots"
                        type="number"
                        className="w-[calc(2ch+2rem+2px)] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        min={0}
                        max={maxParticipantCount}
                        step={1}
                        value={values.availableSpots}
                        disabled={busy || values.availableSpotsMatchPlayers}
                        aria-invalid={Boolean(errors.availableSpots)}
                        aria-describedby={
                            errors.availableSpots
                                ? `${formId}-availableSpots-error`
                                : undefined
                        }
                        onChange={(event) => {
                            const value = event.target.value;
                            if (
                                /^\d{0,2}$/.test(value) &&
                                Number(value) <= maxParticipantCount
                            ) {
                                update("availableSpots", value);
                            }
                        }}
                    />
                    {errors.availableSpots && (
                        <span
                            id={`${formId}-availableSpots-error`}
                            className="col-span-2 text-sm text-error"
                            role="alert"
                        >
                            {errors.availableSpots}
                        </span>
                    )}
                </div>
                <div className="w-full max-w-sm space-y-2">
                    {values.availableSpotsMatchPlayers && (
                        <p className="text-sm text-text-secondary">
                            По умолчанию доступны все места
                        </p>
                    )}
                    <GlassCheckbox
                        id={`${formId}-customAvailableSpots`}
                        name="customAvailableSpots"
                        label="Изменить количество мест для записи"
                        checked={!values.availableSpotsMatchPlayers}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                            update(
                                "availableSpotsMatchPlayers",
                                checked !== true,
                            );
                            if (checked !== true) {
                                update(
                                    "availableSpots",
                                    values.participantLimit,
                                );
                            }
                        }}
                    />
                </div>
                <div className="flex w-full max-w-sm items-center justify-between gap-4">
                    <Label
                        htmlFor={`${formId}-waitlistEnabled`}
                        className="text-white/80"
                    >
                        Список ожидания
                    </Label>
                    <GlassSwitch
                        id={`${formId}-waitlistEnabled`}
                        name="waitlistEnabled"
                        checked={values.waitlistEnabled}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                            update("waitlistEnabled", checked)
                        }
                    />
                </div>
                <div className="flex w-full max-w-sm items-center justify-between gap-4">
                    <Label
                        htmlFor={`${formId}-waitlistAutoRotation`}
                        className="text-white/80"
                    >
                        Авто-ротация из списка ожидания
                    </Label>
                    <GlassSwitch
                        id={`${formId}-waitlistAutoRotation`}
                        name="waitlistAutoRotation"
                        checked={values.waitlistAutoRotation}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                            update("waitlistAutoRotation", checked)
                        }
                    />
                </div>
                <div className="flex w-full max-w-sm items-center justify-between gap-4">
                    <Label
                        htmlFor={`${formId}-playerModeration`}
                        className="text-white/80"
                    >
                        Модерация игроков
                    </Label>
                    <GlassSwitch
                        id={`${formId}-playerModeration`}
                        name="playerModeration"
                        checked={values.playerModeration}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                            update("playerModeration", checked)
                        }
                    />
                </div>
                <div className="w-full max-w-sm space-y-2">
                    <div className="flex w-full max-w-sm items-center justify-between gap-4">
                        <Label
                            htmlFor={`${formId}-organizerParticipates`}
                            className="text-white/80"
                        >
                            Участвовать в событии
                        </Label>
                        <GlassSwitch
                            id={`${formId}-organizerParticipates`}
                            name="organizerParticipates"
                            aria-describedby={`${formId}-organizerParticipates-hint`}
                            checked={values.organizerParticipates}
                            disabled={busy}
                            onCheckedChange={(checked) =>
                                update("organizerParticipates", checked)
                            }
                        />
                    </div>
                    <p
                        id={`${formId}-organizerParticipates-hint`}
                        className="text-sm text-text-secondary"
                    >
                        При включении вы займёте одно место в списке участников.
                    </p>
                </div>
            </div>
        </fieldset>
    );
}

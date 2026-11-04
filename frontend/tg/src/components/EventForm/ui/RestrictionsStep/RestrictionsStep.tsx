import { useState } from "react";
import {
    GlassCheckbox,
    GlassInput,
    GlassSelect,
    GlassSelectContent,
    GlassSelectItem,
    GlassSelectTrigger,
    GlassSelectValue,
    GlassSeparator,
} from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";
import {
    duprRatingStep,
    maxDuprRating,
    minDuprRating,
    mixedParticipantFields,
    participantGenderOptions,
} from "./const";
import type { RestrictionsStepProps } from "./types";

export function RestrictionsStep({
    values,
    errors,
    hidden,
    busy,
    update,
    formId,
    onDuprBlur,
}: RestrictionsStepProps) {
    const [genderSelectOpen, setGenderSelectOpen] = useState(false);
    const selectGender = (value: string) => {
        const option = participantGenderOptions.find(
            (option) => option.value === value,
        );
        if (option) {
            update("participantGender", option.value);
            if (
                option.value === "mixed" &&
                !values.maleCount &&
                !values.femaleCount
            ) {
                const maleCount = Math.floor(
                    Number(values.participantLimit) / 2,
                );
                update("maleCount", String(maleCount));
                update(
                    "femaleCount",
                    String(Number(values.participantLimit) - maleCount),
                );
            }
        }
    };

    return (
        <fieldset
            hidden={hidden}
            className="grid w-full max-w-sm gap-6"
            disabled={busy}
        >
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
                <Label
                    htmlFor={`${formId}-participantGender`}
                    className="text-white/80"
                >
                    Пол участников
                </Label>
                <GlassSelect
                    value={values.participantGender}
                    disabled={busy}
                    open={genderSelectOpen}
                    onOpenChange={setGenderSelectOpen}
                    onValueChange={selectGender}
                >
                    <GlassSelectTrigger id={`${formId}-participantGender`}>
                        <GlassSelectValue />
                    </GlassSelectTrigger>
                    <GlassSelectContent>
                        {participantGenderOptions.map((option) => (
                            <GlassSelectItem
                                key={option.value}
                                value={option.value}
                                onPointerUp={(event) => {
                                    // На сенсорном экране закрываем список после клика, чтобы он не попал в элемент под списком.
                                    if (event.pointerType !== "mouse")
                                        event.preventDefault();
                                }}
                                onClick={() => {
                                    selectGender(option.value);
                                    setGenderSelectOpen(false);
                                }}
                            >
                                {option.label}
                            </GlassSelectItem>
                        ))}
                    </GlassSelectContent>
                </GlassSelect>
            </div>
            {values.participantGender === "mixed" && (
                <div className="grid gap-4">
                    {mixedParticipantFields.map(({ key, label }) => (
                        <div
                            key={key}
                            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2"
                        >
                            <Label
                                htmlFor={`${formId}-${key}`}
                                className="text-white/80"
                            >
                                {label}
                            </Label>
                            <div className="justify-self-end">
                                <GlassInput
                                    id={`${formId}-${key}`}
                                    name={key}
                                    type="number"
                                    inputMode="numeric"
                                    className="w-[calc(2ch+2rem+2px)] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    min={1}
                                    max={Number(values.participantLimit)}
                                    step={1}
                                    value={values[key]}
                                    aria-invalid={Boolean(errors[key])}
                                    aria-describedby={
                                        errors[key]
                                            ? `${formId}-${key}-error`
                                            : undefined
                                    }
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        if (/^\d{0,2}$/.test(value))
                                            update(key, value);
                                    }}
                                />
                            </div>
                            {errors[key] && (
                                <span
                                    id={`${formId}-${key}-error`}
                                    className="col-span-2 text-sm text-error"
                                    role="alert"
                                >
                                    {errors[key]}
                                </span>
                            )}
                        </div>
                    ))}
                    <p className="text-sm text-text-secondary">
                        Всего игроков: {values.participantLimit}. Сумма мужчин и
                        женщин должна совпадать с этим числом.
                    </p>
                </div>
            )}
            <GlassSeparator />
            <section
                aria-labelledby={`${formId}-dupr-heading`}
                className="grid gap-4"
            >
                <h2
                    id={`${formId}-dupr-heading`}
                    className="text-lg font-semibold"
                >
                    Рейтинг DUPR
                </h2>
                <GlassCheckbox
                    id={`${formId}-duprRestricted`}
                    label="Ограничить рейтинг участников"
                    checked={values.duprRestricted}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                        update("duprRestricted", checked === true);
                        if (checked !== true) {
                            update("duprMin", "");
                            update("duprMax", "");
                        }
                    }}
                />
                {values.duprRestricted ? (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid content-start gap-2">
                            <Label
                                htmlFor={`${formId}-duprMin`}
                                className="text-white/80"
                            >
                                От
                            </Label>
                            <GlassInput
                                id={`${formId}-duprMin`}
                                type="number"
                                inputMode="decimal"
                                min={minDuprRating}
                                max={maxDuprRating}
                                step={duprRatingStep}
                                placeholder="2.000"
                                value={values.duprMin}
                                onBlur={(event) =>
                                    onDuprBlur(
                                        "duprMin",
                                        event.currentTarget.value,
                                    )
                                }
                                aria-invalid={Boolean(errors.duprMin)}
                                aria-describedby={
                                    errors.duprMin
                                        ? `${formId}-duprMin-error`
                                        : undefined
                                }
                                onChange={(event) =>
                                    update("duprMin", event.target.value)
                                }
                            />
                            {errors.duprMin && (
                                <span
                                    id={`${formId}-duprMin-error`}
                                    className="text-sm text-error"
                                    role="alert"
                                >
                                    {errors.duprMin}
                                </span>
                            )}
                        </div>
                        <div className="grid content-start gap-2">
                            <Label
                                htmlFor={`${formId}-duprMax`}
                                className="text-white/80"
                            >
                                До
                            </Label>
                            <GlassInput
                                id={`${formId}-duprMax`}
                                type="number"
                                inputMode="decimal"
                                min={minDuprRating}
                                max={maxDuprRating}
                                step={duprRatingStep}
                                placeholder="8.000"
                                value={values.duprMax}
                                onBlur={(event) =>
                                    onDuprBlur(
                                        "duprMax",
                                        event.currentTarget.value,
                                    )
                                }
                                aria-invalid={Boolean(errors.duprMax)}
                                aria-describedby={
                                    errors.duprMax
                                        ? `${formId}-duprMax-error`
                                        : undefined
                                }
                                onChange={(event) =>
                                    update("duprMax", event.target.value)
                                }
                            />
                            {errors.duprMax && (
                                <span
                                    id={`${formId}-duprMax-error`}
                                    className="text-sm text-error"
                                    role="alert"
                                >
                                    {errors.duprMax}
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-text-secondary">
                        Игроки с любым рейтингом и без рейтинга.
                    </p>
                )}
            </section>
        </fieldset>
    );
}

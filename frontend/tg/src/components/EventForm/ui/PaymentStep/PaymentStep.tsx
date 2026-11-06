import { useId } from "react";
import {
    GlassCheckbox,
    GlassInput,
    GlassSeparator,
    GlassTextarea,
} from "@picklehub/ui-web";
import { costFields, maxCostPerPerson } from "./const";
import type { PaymentStepProps } from "./types";

export function PaymentStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: PaymentStepProps) {
    const id = useId();
    const amount = (value: string) => Number(value.replace(",", ".")) || 0;
    const getExpensesTotal = (costs: typeof values) =>
        Math.round(
            ((amount(costs.courtHourlyRate) *
                costs.courtCount *
                Number(costs.durationMinutes)) /
                60 +
                amount(costs.organizerFee) +
                amount(costs.otherExpenses)) *
                100,
        ) / 100;
    const expensesTotal = getExpensesTotal(values);
    const calculatedTotal =
        values.costPerPerson === ""
            ? expensesTotal
            : Number(values.costPerPerson) * values.participantLimit;

    const renderCostField = ({ key, label }: (typeof costFields)[number]) => (
        <div
            key={key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
        >
            <label
                className="text-sm font-medium text-white/80"
                htmlFor={`${id}-${key}`}
            >
                {label}
            </label>
            <GlassInput
                id={`${id}-${key}`}
                name={key}
                className="w-[calc(5ch+2rem+2px)] text-center tabular-nums"
                inputMode="decimal"
                value={values[key]}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={
                    errors[key] ? `${id}-${key}-error` : undefined
                }
                onChange={(event) => {
                    const nextValues = { ...values, [key]: event.target.value };
                    const hasCosts = costFields.some(
                        ({ key: field }) => nextValues[field] !== "",
                    );
                    const perPerson = Math.round(
                        getExpensesTotal(nextValues) /
                            Math.max(1, values.participantLimit),
                    );
                    update(key, event.target.value);
                    update(
                        "costPerPerson",
                        hasCosts
                            ? String(Math.min(maxCostPerPerson, perPerson))
                            : "",
                    );
                }}
            />
            {errors[key] && (
                <span
                    id={`${id}-${key}-error`}
                    role="alert"
                    className="col-span-2 text-sm text-error"
                >
                    {errors[key]}
                </span>
            )}
        </div>
    );

    return (
        <fieldset
            hidden={hidden}
            disabled={busy}
            className="grid w-full max-w-sm gap-6"
        >
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <label
                    className="text-sm font-medium text-white/80"
                    htmlFor={`${id}-total`}
                >
                    Общая стоимость
                </label>
                <GlassInput
                    id={`${id}-total`}
                    name="totalCost"
                    inputMode="decimal"
                    value={
                        values.costBreakdownEnabled
                            ? calculatedTotal
                            : values.totalCost
                    }
                    readOnly={values.costBreakdownEnabled}
                    aria-invalid={Boolean(errors.totalCost)}
                    aria-describedby={
                        errors.totalCost ? `${id}-total-error` : undefined
                    }
                    onChange={(event) =>
                        update("totalCost", event.target.value)
                    }
                />
                {errors.totalCost && (
                    <span
                        id={`${id}-total-error`}
                        role="alert"
                        className="col-span-2 text-sm text-error"
                    >
                        {errors.totalCost}
                    </span>
                )}
            </div>
            <GlassCheckbox
                id={`${id}-breakdown`}
                label="Детализация стоимости"
                checked={values.costBreakdownEnabled}
                onCheckedChange={(checked) => {
                    if (!checked) update("totalCost", String(calculatedTotal));
                    update("costBreakdownEnabled", checked === true);
                }}
            />
            {values.costBreakdownEnabled && (
                <div className="grid min-w-0 gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
                    {costFields
                        .filter(({ key }) => key === "courtHourlyRate")
                        .map(renderCostField)}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <label
                            className="text-sm font-medium text-white/80"
                            htmlFor={`${id}-courts`}
                        >
                            Кортов
                        </label>
                        <GlassInput
                            id={`${id}-courts`}
                            className="w-[calc(5ch+2rem+2px)] text-center tabular-nums"
                            disabled
                            glowOnFocus={false}
                            readOnly
                            value={values.courtCount}
                        />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <label
                            className="text-sm font-medium text-white/80"
                            htmlFor={`${id}-duration`}
                        >
                            Длит.(ч)
                        </label>
                        <GlassInput
                            id={`${id}-duration`}
                            className="w-[calc(5ch+2rem+2px)] text-center tabular-nums"
                            disabled
                            glowOnFocus={false}
                            readOnly
                            value={Number(values.durationMinutes) / 60}
                        />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <label
                            className="text-sm font-medium text-white/80"
                            htmlFor={`${id}-players`}
                        >
                            Игроков
                        </label>
                        <GlassInput
                            id={`${id}-players`}
                            className="w-[calc(5ch+2rem+2px)] text-center tabular-nums"
                            disabled
                            glowOnFocus={false}
                            readOnly
                            value={values.participantLimit}
                        />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <label
                            className="text-sm font-medium text-white/80"
                            htmlFor={`${id}-per-person`}
                        >
                            Стоимость/чел
                        </label>
                        <GlassInput
                            id={`${id}-per-person`}
                            name="costPerPerson"
                            inputMode="numeric"
                            maxLength={5}
                            className="w-[calc(5ch+2rem+2px)] text-center tabular-nums"
                            value={values.costPerPerson}
                            onChange={(event) => {
                                const value = event.target.value;
                                if (
                                    /^\d{0,5}$/.test(value) &&
                                    Number(value) <= maxCostPerPerson
                                ) {
                                    update("costPerPerson", value);
                                }
                            }}
                        />
                    </div>
                    {costFields
                        .filter(({ key }) => key !== "courtHourlyRate")
                        .map(renderCostField)}
                    <p className="text-xs text-text-secondary">
                        Корт/час × {values.courtCount} корт. ×{" "}
                        {Number(values.durationMinutes) / 60} ч + комиссия +
                        прочие расходы. Сумма делится на{" "}
                        {values.participantLimit} игроков.
                    </p>
                </div>
            )}
            <GlassSeparator />
            <GlassTextarea
                id={`${id}-comment`}
                name="description"
                label="Комментарий (необязательно)"
                maxLength={2000}
                value={values.description}
                error={errors.description}
                onChange={(event) => update("description", event.target.value)}
            />
        </fieldset>
    );
}

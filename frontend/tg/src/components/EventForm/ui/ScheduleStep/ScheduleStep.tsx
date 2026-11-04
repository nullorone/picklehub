import { useId } from "react";
import { Button, GlassInput, GlassSeparator } from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";
import { moscowDateTimeInput } from "@/helpers/gameTime";
import {
    durationOptions,
    maxDurationMinutes,
    minDurationMinutes,
} from "./const";
import type { ScheduleStepProps } from "./types";

export function ScheduleStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: ScheduleStepProps) {
    const id = useId();
    const [date = "", time = ""] = values.startsAt.split("T");

    return (
        <fieldset
            hidden={hidden}
            className="grid w-full min-w-0 max-w-sm gap-6"
            disabled={busy}
        >
            <legend className="sr-only">Дата и время события</legend>
            <div className="grid gap-3">
                <div className="grid min-w-0 gap-4">
                    <div className="grid min-w-0 content-start gap-2 [&>.group]:min-w-0">
                        <Label htmlFor={`${id}-date`} className="text-white/80">
                            Дата
                        </Label>
                        <GlassInput
                            id={`${id}-date`}
                            name="startsAtDate"
                            type="date"
                            className="h-12 min-w-0 [color-scheme:dark]"
                            min={moscowDateTimeInput().split("T")[0]}
                            value={date}
                            aria-invalid={Boolean(errors.startsAt)}
                            aria-describedby={`${id}-timezone${errors.startsAt ? ` ${id}-startsAt-error` : ""}`}
                            onChange={(event) =>
                                update(
                                    "startsAt",
                                    `${event.target.value}T${time}`,
                                )
                            }
                        />
                    </div>
                    <div className="grid min-w-0 content-start gap-2 [&>.group]:min-w-0">
                        <Label htmlFor={`${id}-time`} className="text-white/80">
                            Начало
                        </Label>
                        <GlassInput
                            id={`${id}-time`}
                            name="startsAtTime"
                            type="time"
                            className="h-12 min-w-0 [color-scheme:dark]"
                            value={time}
                            aria-invalid={Boolean(errors.startsAt)}
                            aria-describedby={`${id}-timezone${errors.startsAt ? ` ${id}-startsAt-error` : ""}`}
                            onChange={(event) =>
                                update(
                                    "startsAt",
                                    `${date}T${event.target.value}`,
                                )
                            }
                        />
                    </div>
                </div>
                <p
                    id={`${id}-timezone`}
                    className="text-sm text-text-secondary"
                >
                    По московскому времени (UTC+3).
                </p>
                {errors.startsAt && (
                    <p
                        id={`${id}-startsAt-error`}
                        className="text-sm text-error"
                        role="alert"
                    >
                        {errors.startsAt}
                    </p>
                )}
            </div>
            <GlassSeparator />
            <div className="grid gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <Label htmlFor={`${id}-duration`} className="text-white/80">
                        Длительность
                    </Label>
                    <div className="flex items-center gap-2">
                        <GlassInput
                            id={`${id}-duration`}
                            name="durationMinutes"
                            type="number"
                            inputMode="numeric"
                            className="h-12 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min={minDurationMinutes}
                            max={maxDurationMinutes}
                            step={1}
                            value={values.durationMinutes}
                            aria-invalid={Boolean(errors.durationMinutes)}
                            aria-describedby={`${id}-duration-hint${errors.durationMinutes ? ` ${id}-duration-error` : ""}`}
                            onChange={(event) =>
                                update("durationMinutes", event.target.value)
                            }
                        />
                        <span className="text-sm text-text-secondary">мин</span>
                    </div>
                </div>
                <div
                    role="group"
                    aria-label="Быстрый выбор длительности"
                    className="grid grid-cols-4 gap-2"
                >
                    {durationOptions.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            aria-pressed={
                                values.durationMinutes === option.value
                            }
                            className={`min-h-11 rounded-xl border px-1 text-xs hover:scale-100 active:scale-100 ${values.durationMinutes === option.value ? "border-accent/50 bg-accent/10 text-accent" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"}`}
                            onClick={() =>
                                update("durationMinutes", option.value)
                            }
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
                <p
                    id={`${id}-duration-hint`}
                    className="text-sm text-text-secondary"
                >
                    От 30 минут до 8 часов. Можно указать своё время.
                </p>
                {errors.durationMinutes && (
                    <p
                        id={`${id}-duration-error`}
                        className="text-sm text-error"
                        role="alert"
                    >
                        {errors.durationMinutes}
                    </p>
                )}
            </div>
        </fieldset>
    );
}

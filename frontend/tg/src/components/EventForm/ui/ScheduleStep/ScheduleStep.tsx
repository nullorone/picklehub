import { useId, useState } from "react";
import { CalendarDays, Clock, Plus, Trash } from "lucide-react";
import {
    Button,
    CalendarWidget,
    GlassInput,
    GlassCheckbox,
    GlassPopover,
    GlassPopoverContent,
    GlassPopoverTrigger,
    GlassSeparator,
    GlassSwitch,
} from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";
import { moscowDateTimeInput } from "@/helpers/gameTime";
import { defaultSlotDuration, durationOptions, slotTimeFields } from "./const";
import type { ScheduleStepProps } from "./types";

export function ScheduleStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: ScheduleStepProps) {
    const id = useId();
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [date = "", time = ""] = values.startsAt.split("T");

    const [startHour, startMinute] = time.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes =
        (startMinutes + Number(values.durationMinutes)) % (24 * 60);
    const endTime =
        time && values.durationMinutes && Number.isFinite(endMinutes)
            ? `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`
            : "";
    const endsNextDay =
        startMinutes + Number(values.durationMinutes) >= 24 * 60;
    const duration = Number(values.durationMinutes);
    const validSchedule =
        Number.isFinite(startMinutes) && duration >= 30 && duration <= 480;
    const nextSlotStart = Math.max(
        0,
        ...values.timeSlots.map((slot) => slot.end),
    );
    const formatSlotTime = (offset: number) => {
        if (offset < 0 || !Number.isFinite(startMinutes + offset)) return "";
        const minutes = (startMinutes + offset) % (24 * 60);
        return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    };

    const calendarDate = new Date(
        `${date || moscowDateTimeInput().split("T")[0]}T00:00:00`,
    );

    return (
        <fieldset
            hidden={hidden}
            className="grid w-full min-w-0 max-w-sm gap-6"
            disabled={busy}
        >
            <legend className="sr-only">Дата и время события</legend>
            <div className="grid gap-3">
                <div className="grid min-w-0 gap-4">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <Label htmlFor={`${id}-date`} className="text-white/80">
                            Дата
                        </Label>
                        <GlassPopover
                            open={calendarOpen && !hidden && !busy}
                            onOpenChange={setCalendarOpen}
                        >
                            <GlassPopoverTrigger asChild>
                                <button
                                    id={`${id}-date`}
                                    type="button"
                                    name="startsAtDate"
                                    disabled={busy}
                                    className="flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                                    aria-invalid={Boolean(errors.startsAt)}
                                    aria-describedby={
                                        errors.startsAt
                                            ? `${id}-startsAt-error`
                                            : undefined
                                    }
                                >
                                    <CalendarDays
                                        className="size-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    {date
                                        ? date.split("-").reverse().join(".")
                                        : "Выбрать дату"}
                                </button>
                            </GlassPopoverTrigger>
                            <GlassPopoverContent
                                align="end"
                                alignOffset={-12}
                                className="w-72 max-w-[calc(100vw-2rem)] p-0"
                                aria-label="Выбор даты события"
                            >
                                <CalendarWidget
                                    date={calendarDate}
                                    selectedDate={calendarDate}
                                    onDateSelect={(selected) => {
                                        const selectedDate = [
                                            selected.getFullYear(),
                                            String(
                                                selected.getMonth() + 1,
                                            ).padStart(2, "0"),
                                            String(selected.getDate()).padStart(
                                                2,
                                                "0",
                                            ),
                                        ].join("-");
                                        update(
                                            "startsAt",
                                            `${selectedDate}T${time}`,
                                        );
                                        setCalendarOpen(false);
                                    }}
                                />
                            </GlassPopoverContent>
                        </GlassPopover>
                    </div>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <Label htmlFor={`${id}-time`} className="text-white/80">
                            Начало
                        </Label>
                        <div className="relative w-[calc(5ch+3.5rem+2px)] min-w-0 text-sm">
                            <GlassInput
                                id={`${id}-time`}
                                name="startsAtTime"
                                type="time"
                                className="h-12 min-w-0 pl-10 pr-3 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                                value={time}
                                aria-invalid={Boolean(errors.startsAt)}
                                aria-describedby={
                                    errors.startsAt
                                        ? `${id}-startsAt-error`
                                        : undefined
                                }
                                onChange={(event) =>
                                    update(
                                        "startsAt",
                                        `${date}T${event.target.value}`,
                                    )
                                }
                            />
                            <Clock
                                className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-white"
                                aria-hidden="true"
                            />
                        </div>
                    </div>
                </div>
                {errors.startsAt && (
                    <p
                        id={`${id}-startsAt-error`}
                        className="text-sm text-error"
                        role="alert"
                    >
                        {errors.startsAt}
                    </p>
                )}
                <div className="grid gap-3">
                    <p
                        id={`${id}-duration`}
                        className="text-sm font-medium text-white/80"
                    >
                        Длительность
                    </p>
                    <div
                        role="group"
                        aria-labelledby={`${id}-duration`}
                        aria-describedby={
                            errors.durationMinutes
                                ? `${id}-duration-error`
                                : undefined
                        }
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
                    <GlassCheckbox
                        id={`${id}-manual-end-time`}
                        name="manualEndTimeEnabled"
                        label="Указать время окончания"
                        checked={values.manualEndTimeEnabled}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                            update("manualEndTimeEnabled", checked === true)
                        }
                    />
                    {values.manualEndTimeEnabled && (
                        <div className="grid gap-2">
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                                <Label
                                    htmlFor={`${id}-end-time`}
                                    className="text-white/80"
                                >
                                    Окончание
                                </Label>
                                <div className="relative w-[calc(5ch+3.5rem+2px)] min-w-0 text-sm">
                                    <GlassInput
                                        id={`${id}-end-time`}
                                        name="endsAtTime"
                                        type="time"
                                        className="h-12 min-w-0 pl-10 pr-3 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                                        value={endTime}
                                        disabled={busy || !time}
                                        aria-invalid={Boolean(
                                            errors.durationMinutes,
                                        )}
                                        aria-describedby={`${id}-end-time-hint${errors.durationMinutes ? ` ${id}-duration-error` : ""}`}
                                        onChange={(event) => {
                                            if (!event.target.value) {
                                                update("durationMinutes", "");
                                                return;
                                            }
                                            const [hour, minute] =
                                                event.target.value
                                                    .split(":")
                                                    .map(Number);
                                            const difference =
                                                hour * 60 +
                                                minute -
                                                startMinutes;
                                            update(
                                                "durationMinutes",
                                                String(
                                                    difference < 0
                                                        ? difference + 24 * 60
                                                        : difference,
                                                ),
                                            );
                                        }}
                                    />
                                    <Clock
                                        className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-white"
                                        aria-hidden="true"
                                    />
                                </div>
                            </div>
                            <p
                                id={`${id}-end-time-hint`}
                                className="text-sm text-text-secondary"
                            >
                                {endsNextDay
                                    ? "Окончание на следующий день. "
                                    : ""}
                                Длительность пересчитается автоматически. От 30
                                минут до 8 часов.
                            </p>
                        </div>
                    )}
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
            </div>
            <GlassSeparator />
            <div className="grid gap-2">
                <div className="flex items-center justify-between gap-4">
                    <Label
                        htmlFor={`${id}-time-slots`}
                        className="text-white/80"
                    >
                        Запись по слотам
                    </Label>
                    <GlassSwitch
                        id={`${id}-time-slots`}
                        name="timeSlotsEnabled"
                        checked={values.timeSlotsEnabled}
                        disabled={busy}
                        aria-describedby={`${id}-time-slots-hint`}
                        onCheckedChange={(checked) => {
                            if (checked && values.timeSlots.length === 0) {
                                update("timeSlots", [
                                    {
                                        start: 0,
                                        end: Math.min(
                                            defaultSlotDuration,
                                            validSchedule
                                                ? duration
                                                : defaultSlotDuration,
                                        ),
                                    },
                                ]);
                            }
                            update("timeSlotsEnabled", checked);
                        }}
                    />
                </div>
                <p
                    id={`${id}-time-slots-hint`}
                    className="text-sm text-text-secondary"
                >
                    Участники смогут записаться на отдельный промежуток времени
                    внутри события.
                </p>
                {values.timeSlotsEnabled && (
                    <div className="mt-2 grid min-w-0 gap-4">
                        {values.timeSlots.map((slot, index) => (
                            <fieldset
                                key={index}
                                className="grid min-w-0 gap-3 rounded-xl border border-white/15 bg-white/5 p-3"
                            >
                                <legend className="px-1 text-sm font-medium text-white/80">
                                    Слот {index + 1}
                                </legend>
                                {slotTimeFields.map(({ key, label }) => (
                                    <div
                                        key={key}
                                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                                    >
                                        <Label
                                            htmlFor={`${id}-slot-${index}-${key}`}
                                            className="text-white/80"
                                        >
                                            {label}
                                        </Label>
                                        <GlassInput
                                            id={`${id}-slot-${index}-${key}`}
                                            type="time"
                                            className="h-12 w-[calc(5ch+2rem+2px)] min-w-0 px-3 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                                            value={formatSlotTime(slot[key])}
                                            disabled={busy || !validSchedule}
                                            min={formatSlotTime(
                                                key === "start"
                                                    ? 0
                                                    : slot.start + 1,
                                            )}
                                            max={formatSlotTime(
                                                key === "start"
                                                    ? duration - 1
                                                    : duration,
                                            )}
                                            aria-invalid={Boolean(
                                                errors.timeSlots,
                                            )}
                                            aria-describedby={
                                                errors.timeSlots
                                                    ? `${id}-slots-error`
                                                    : undefined
                                            }
                                            onChange={(event) => {
                                                const [hour, minute] =
                                                    event.target.value
                                                        .split(":")
                                                        .map(Number);
                                                const offset = event.target
                                                    .value
                                                    ? (hour * 60 +
                                                          minute -
                                                          startMinutes +
                                                          24 * 60) %
                                                      (24 * 60)
                                                    : -1;
                                                update(
                                                    "timeSlots",
                                                    values.timeSlots.map(
                                                        (
                                                            current,
                                                            currentIndex,
                                                        ) =>
                                                            currentIndex ===
                                                            index
                                                                ? {
                                                                      ...current,
                                                                      [key]: offset,
                                                                  }
                                                                : current,
                                                    ),
                                                );
                                            }}
                                        />
                                    </div>
                                ))}
                                {startMinutes + slot.end >= 24 * 60 && (
                                    <p className="text-sm text-text-secondary">
                                        Окончание слота на следующий день.
                                    </p>
                                )}
                                {values.timeSlots.length > 1 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="text-error hover:bg-error/10 hover:text-error"
                                        disabled={busy}
                                        onClick={() =>
                                            update(
                                                "timeSlots",
                                                values.timeSlots.filter(
                                                    (_, currentIndex) =>
                                                        currentIndex !== index,
                                                ),
                                            )
                                        }
                                    >
                                        <Trash
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        Удалить слот {index + 1}
                                    </Button>
                                )}
                            </fieldset>
                        ))}
                        {errors.timeSlots && (
                            <p
                                id={`${id}-slots-error`}
                                className="text-sm text-error"
                                role="alert"
                            >
                                {errors.timeSlots}
                            </p>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={
                                busy ||
                                !validSchedule ||
                                nextSlotStart >= duration
                            }
                            onClick={() =>
                                update("timeSlots", [
                                    ...values.timeSlots,
                                    {
                                        start: nextSlotStart,
                                        end: Math.min(
                                            nextSlotStart + defaultSlotDuration,
                                            duration,
                                        ),
                                    },
                                ])
                            }
                        >
                            <Plus className="size-4" aria-hidden="true" />
                            Добавить слот
                        </Button>
                    </div>
                )}
            </div>
        </fieldset>
    );
}

import type { EventFormStepProps } from "../../types";
import { TextField } from "@/components/TextField/TextField.tsx";

type ScheduleStepProps = EventFormStepProps<"startsAt" | "durationMinutes">;

export function ScheduleStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: ScheduleStepProps) {
    return (
        <fieldset hidden={hidden} className="grid gap-4" disabled={busy}>
            <TextField
                label="Дата и время начала (Москва)"
                name="startsAt"
                type="datetime-local"
                value={values.startsAt}
                error={errors.startsAt}
                onChange={(event) => update("startsAt", event.target.value)}
            />
            <p className="-mt-3 text-xs text-text-secondary">
                Часовой пояс: Europe/Moscow (UTC+3). На сервер отправится время
                UTC.
            </p>
            <TextField
                label="Длительность, мин"
                name="durationMinutes"
                type="number"
                min={30}
                max={480}
                step={1}
                value={values.durationMinutes}
                error={errors.durationMinutes}
                onChange={(event) =>
                    update("durationMinutes", event.target.value)
                }
            />
        </fieldset>
    );
}

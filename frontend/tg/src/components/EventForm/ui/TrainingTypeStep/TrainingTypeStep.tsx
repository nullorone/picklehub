import { trainingTypeOptions } from "../../const";
import type { FormValues, EventFormStepProps } from "../../types";

type TrainingTypeStepProps = EventFormStepProps<"trainingType">;

export function TrainingTypeStep({
    values,
    hidden,
    busy,
    update,
}: TrainingTypeStepProps) {
    return (
        <fieldset hidden={hidden} className="grid gap-3" disabled={busy}>
            <legend className="mb-3 font-semibold">
                Выберите тип тренировки
            </legend>
            {trainingTypeOptions.map((option) => (
                <label
                    key={option.value}
                    className="flex items-center gap-3 rounded-control border border-border p-4"
                >
                    <input
                        type="radio"
                        name="trainingType"
                        value={option.value}
                        checked={values.trainingType === option.value}
                        onChange={() =>
                            update(
                                "trainingType",
                                option.value as FormValues["trainingType"],
                            )
                        }
                    />
                    {option.label}
                </label>
            ))}
            <p role="status">
                Следующие шаги создания тренировки находятся в разработке.
            </p>
        </fieldset>
    );
}

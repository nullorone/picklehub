import type { EventFormStepProps } from "../../types";
import { GlassTextarea } from "@picklehub/ui-web";
import { TextField } from "@/components/TextField/TextField.tsx";

type DescriptionStepProps = EventFormStepProps<"desiredLevel" | "description">;

export function DescriptionStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: DescriptionStepProps) {
    return (
        <fieldset hidden={hidden} className="grid gap-4" disabled={busy}>
            <TextField
                label="Желаемый уровень (необязательно)"
                name="desiredLevel"
                value={values.desiredLevel}
                maxLength={80}
                error={errors.desiredLevel}
                onChange={(event) => update("desiredLevel", event.target.value)}
            />
            <label className="grid gap-2 text-sm font-medium">
                Описание (необязательно)
                <GlassTextarea
                    glowOnFocus={false}
                    className="tg-input min-h-24 text-base"
                    id="description"
                    aria-describedby={
                        errors.description ? "description-error" : undefined
                    }
                    name="description"
                    maxLength={2000}
                    value={values.description}
                    aria-invalid={Boolean(errors.description)}
                    onChange={(event) =>
                        update("description", event.target.value)
                    }
                />
                {errors.description && (
                    <span
                        id="description-error"
                        className="text-sm font-normal text-error"
                        role="alert"
                    >
                        {errors.description}
                    </span>
                )}
            </label>
        </fieldset>
    );
}

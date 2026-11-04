import type { EventFormStepProps } from "../../types";
import { GlassTextarea } from "@picklehub/ui-web";
import { TextField } from "@/components/TextField/TextField.tsx";

type VenueStepProps = EventFormStepProps<"venueName" | "venueAddress">;

export function VenueStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: VenueStepProps) {
    return (
        <fieldset hidden={hidden} className="grid gap-4" disabled={busy}>
            <TextField
                label="Название площадки"
                name="venueName"
                value={values.venueName}
                maxLength={120}
                autoComplete="organization"
                error={errors.venueName}
                onChange={(event) => update("venueName", event.target.value)}
            />
            <label className="grid gap-2 text-sm font-medium">
                Адрес
                <GlassTextarea
                    glowOnFocus={false}
                    className="tg-input min-h-20 text-base"
                    id="venueAddress"
                    aria-describedby={
                        errors.venueAddress ? "venueAddress-error" : undefined
                    }
                    name="venueAddress"
                    maxLength={300}
                    value={values.venueAddress}
                    aria-invalid={Boolean(errors.venueAddress)}
                    onChange={(event) =>
                        update("venueAddress", event.target.value)
                    }
                />
                {errors.venueAddress && (
                    <span
                        id="venueAddress-error"
                        className="text-sm font-normal text-error"
                        role="alert"
                    >
                        {errors.venueAddress}
                    </span>
                )}
            </label>
        </fieldset>
    );
}

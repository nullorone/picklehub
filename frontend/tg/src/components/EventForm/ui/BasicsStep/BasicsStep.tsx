import { useId } from "react";
import { GlassInput, GlassSwitch } from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";
import type { BasicsStepProps } from "./types";

export function BasicsStep({
    values,
    hidden,
    busy,
    update,
    errors,
}: BasicsStepProps) {
    const privacyId = useId();
    const titleId = useId();

    return (
        <fieldset hidden={hidden} disabled={busy} className="grid gap-6">
            <div className="grid gap-2">
                <Label htmlFor={titleId}>Название события</Label>
                <GlassInput
                    id={titleId}
                    name="title"
                    value={values.title}
                    maxLength={120}
                    placeholder="Например, вечерний Play On"
                    autoComplete="off"
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={
                        errors.title ? `${titleId}-error` : undefined
                    }
                    onChange={(event) => update("title", event.target.value)}
                />
                {errors.title && (
                    <p
                        id={`${titleId}-error`}
                        className="text-sm text-error"
                        role="alert"
                    >
                        {errors.title}
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-2 items-center gap-x-2">
                <div className="flex items-center gap-2">
                    <Label
                        htmlFor={privacyId}
                        className="text-base font-medium text-text"
                    >
                        Приватное
                    </Label>
                    <GlassSwitch
                        id={privacyId}
                        name="isPrivate"
                        checked={values.isPrivate}
                        disabled={busy}
                        aria-describedby={`${privacyId}-description`}
                        onCheckedChange={(checked) =>
                            update("isPrivate", checked)
                        }
                    />
                </div>
                <p
                    id={`${privacyId}-description`}
                    className="text-sm text-text-secondary"
                >
                    Только по ссылке
                </p>
            </div>
        </fieldset>
    );
}

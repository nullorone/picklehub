import type { FormValues } from "../../types";
import { formatOptions } from "../../const";

type FormatDescriptionProps = { value: FormValues["format"] };

export function FormatDescription({ value }: FormatDescriptionProps) {
    return (
        <p
            className="min-h-[3lh] text-sm leading-5 text-text-secondary"
            aria-live="polite"
            aria-atomic="true"
            data-testid="format-description"
        >
            {
                formatOptions.find((option) => option.value === value)
                    ?.description
            }
        </p>
    );
}

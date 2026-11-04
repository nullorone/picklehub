import type { EventFormStepProps } from "../../types";
import { ChoiceCards } from "../ChoiceCards/ChoiceCards";
import { formatOptions } from "../../const";

type FormatStepProps = Omit<EventFormStepProps<"format">, "errors">;

export function FormatStep({ values, hidden, busy, update }: FormatStepProps) {
    return (
        <ChoiceCards
            name="format"
            legend="Выберите формат игры"
            value={values.format}
            hidden={hidden}
            disabled={busy}
            onChange={(value) => update("format", value)}
            hideDescription
            options={formatOptions}
        />
    );
}

import type { EventFormStepProps } from "../../types";
import { ChoiceCards } from "../ChoiceCards/ChoiceCards";
import { eventTypeOptions } from "../../const";

type EventTypeStepProps = Omit<EventFormStepProps<"eventType">, "errors">;

export function EventTypeStep({
    values,
    hidden,
    busy,
    update,
}: EventTypeStepProps) {
    return (
        <ChoiceCards
            name="eventType"
            legend="Выберите тип события"
            value={values.eventType}
            hidden={hidden}
            disabled={busy}
            onChange={(value) => update("eventType", value)}
            options={eventTypeOptions}
        />
    );
}

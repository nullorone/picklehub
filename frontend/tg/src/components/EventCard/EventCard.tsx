import { useId, useState } from "react";
import { Card, type CardProps } from "../Card/Card";
import { PlankEvent } from "../PlankEvent";

export function EventCard(props: CardProps) {
    const [expanded, setExpanded] = useState(false);
    const contentId = useId();

    return (
        <div className="flex flex-col gap-2">
            <PlankEvent
                type={props.type}
                name={props.name}
                place={props.location.name}
                participant={{
                    current: props.participants,
                    total: props.maxParticipants,
                }}
                expanded={expanded}
                contentId={contentId}
                onToggle={() => setExpanded((value) => !value)}
            />
            <div id={contentId} hidden={!expanded}>
                {expanded && <Card {...props} />}
            </div>
        </div>
    );
}

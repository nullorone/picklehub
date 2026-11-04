import { Link } from "react-router-dom";
import {
    CompactCalendarWidget,
    GlassSeparator,
    Space,
} from "@picklehub/ui-web";
import { ChevronRight } from "lucide-react";
import type { GameEvent } from "../../pages/EventList/types";
import { EventTypeBadge } from "../EventTypeBadge/EventTypeBadge";

export interface PlankEventProps {
    type: GameEvent["type"];
    name: string;
    place: string;
    participant: {
        total: number;
        current: number;
    };
    id?: string;
    linkTo?: string;
    onToggle?: () => void;
    expanded?: boolean;
    contentId?: string;
    wrapperType?: "div" | "li";
}

export function PlankEvent({
    type,
    wrapperType,
    onToggle,
    expanded,
    contentId,
    id,
    linkTo,
    name,
    place,
    participant,
}: PlankEventProps) {
    const Wrapper = wrapperType === "li" ? "li" : "div";

    const content = (
        <Space padding={"0"}>
            <div className={"flex items-center"}>
                <div className={"flex items-start gap-2 p-2"}>
                    <div className={"shrink-0"}>
                        <CompactCalendarWidget paddingSize={"s"} />
                    </div>
                    <div className={"flex flex-col grow items-start gap-1"}>
                        <EventTypeBadge type={type} />
                        <span className={"text-l text-white line-clamp-2"}>
                            {name}
                        </span>
                        <span className={"text-l text-white"}>{place}</span>
                        <span className={"text-s text-text-secondary"}>
                            {participant.current} / {participant.total}
                        </span>
                    </div>
                </div>
                <div
                    className={
                        "flex items-center self-stretch gap-1 shrink-0 pr-1"
                    }
                >
                    <GlassSeparator
                        className={"h-auto self-stretch"}
                        orientation={"vertical"}
                    />
                    <ChevronRight
                        size={18}
                        color={"#fff"}
                        aria-hidden="true"
                        className={expanded ? "rotate-90" : undefined}
                    />
                </div>
            </div>
        </Space>
    );

    return (
        <Wrapper id={id}>
            {onToggle ? (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                    {content}
                </button>
            ) : (
                <Link to={linkTo ?? "/"}>{content}</Link>
            )}
        </Wrapper>
    );
}

import { formatEventSchedule } from "../../pages/EventList/helpers/formatEventSchedule";
import { Link } from "react-router-dom";
// import { useState } from "react";
import {
    GlassBadge,
    GlassButton,
    GlassCard,
    GlassCardContent,
    GlassCardFooter,
    GlassCardHeader,
    GlassCardTitle,
    GlassSeparator,
} from "@picklehub/ui-web";
import {
    Calendar,
    ChartNoAxesColumnIncreasing,
    MapPinned,
    Podium,
    // Share,
    Users,
} from "lucide-react";
import duprImg from "../../assets/dupr.jpg";
import { getFormatStatus } from "../../pages/EventList/helpers/getFormatStatus.ts";
import { GameEvent } from "../../pages/EventList/types.ts";
import { EventTypeBadge } from "../EventTypeBadge/EventTypeBadge";

export type CardProps = GameEvent;

export function Card(event: CardProps) {
    /* Отправка ссылки временно отключена.
    const [shareMessage, setShareMessage] = useState("");
    const shareEvent = async () => {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = `/event/${event.id}/details`;
        setShareMessage("");
        try {
            if (navigator.share) {
                await navigator.share({
                    title: event.name,
                    url: url.toString(),
                });
            } else {
                await navigator.clipboard.writeText(url.toString());
                setShareMessage("Ссылка скопирована");
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                return;
            setShareMessage(
                "Не удалось поделиться ссылкой. Попробуйте ещё раз.",
            );
        }
    };
    */
    const {
        name,
        status,
        rating,
        location,
        participants,
        maxParticipants,
        format,
        entryFee,
    } = event;
    const { date } = formatEventSchedule(event.schedule);
    return (
        <GlassCard className="w-full">
            <GlassCardHeader>
                <div className="flex justify-between items-start gap-1">
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs [&>div]:text-xs">
                            <EventTypeBadge type={event.type} />
                            {status === "completed" && (
                                <GlassBadge variant="default" size="s">
                                    {getFormatStatus(status)}
                                </GlassBadge>
                            )}
                            <div className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 px-2 py-[2px]">
                                <span
                                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-white"
                                    aria-label={`Рейтинг: ${rating ? `DUPR ${rating}` : "Любой"}`}
                                >
                                    {!rating && (
                                        <ChartNoAxesColumnIncreasing
                                            size={14}
                                            className="shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {rating ? (
                                        <>
                                            <img
                                                src={duprImg}
                                                alt="DUPR"
                                                width={32}
                                                height={16}
                                                className="h-4 w-8 rounded"
                                            />
                                            <span>{rating}</span>
                                        </>
                                    ) : (
                                        "Любой"
                                    )}
                                </span>
                            </div>
                        </div>
                        <GlassCardTitle className="line-clamp-2">
                            {name}
                        </GlassCardTitle>
                    </div>
                    {/* Кнопка отправки ссылки временно отключена.
                    <div className="w-10 shrink-0">
                        <GlassButton
                            variant="outline"
                            size="icon"
                            className="w-10 rounded-full"
                            aria-label={`Поделиться событием «${name}»`}
                            title="Поделиться"
                            onClick={() => void shareEvent()}
                        >
                            <Share className="h-4 w-4" aria-hidden="true" />
                        </GlassButton>
                    </div>
                    */}
                </div>
                {/*
                {shareMessage && (
                    <p role="status" className="text-xs text-text-secondary">
                        {shareMessage}
                    </p>
                )}
                */}
            </GlassCardHeader>
            <GlassCardContent>
                <div className="space-y-2 text-sm text-text-secondary">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className={"flex items-center gap-2 min-w-[50%]"}>
                            <Calendar size={16} className="shrink-0" />
                            <span className={"text-white"}>{date}</span>
                        </div>
                        <div className={"flex items-center gap-2 min-w-[50%]"}>
                            <MapPinned size={16} className="shrink-0" />
                            <a
                                href={location.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 focus-visible:outline-offset-4 text-white"
                            >
                                {location.name}
                            </a>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 min-w-[50%]">
                            <Users size={16} className="shrink-0" />
                            <span className={"text-white"}>
                                {participants} / {maxParticipants} игроков
                            </span>
                        </div>
                        <div className="flex flex-col min-w-[50%]">
                            <div className="flex items-center gap-2 text-sm">
                                <Podium
                                    size={16}
                                    className="shrink-0"
                                    aria-hidden="true"
                                />
                                <span className={"text-white"}>{format}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </GlassCardContent>
            <GlassSeparator />
            <GlassCardFooter>
                <div className={"flex flex-col gap-2 pt-2 w-full"}>
                    <div>
                        <div className={"flex items-center gap-3"}>
                            <div className="shrink-0 flex flex-col items-start">
                                <span className="text-sm font-semibold">
                                    {entryFee === 0
                                        ? "Бесплатно"
                                        : `${entryFee} ₽`}
                                </span>
                                <span className="text-s text-text-secondary">
                                    Стоимость
                                </span>
                            </div>
                            <div className="shrink-0 w-[1px] h-11">
                                <GlassSeparator orientation={"vertical"} />
                            </div>
                            <GlassButton variant="accent" asChild>
                                <Link
                                    to={`/event/${event.id}/details`}
                                    state={{ event }}
                                >
                                    Подробнее
                                </Link>
                            </GlassButton>
                        </div>
                    </div>
                </div>
            </GlassCardFooter>
        </GlassCard>
    );
}

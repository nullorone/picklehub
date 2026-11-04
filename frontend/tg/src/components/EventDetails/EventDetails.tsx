import { formatEventSchedule } from "../../pages/EventList/helpers/formatEventSchedule";
import {
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { Info, Users, Trophy, X, Phone } from "lucide-react";
import pickleballIcon from "../../assets/pickleball-icon.svg";
import defaultEventCover from "../../assets/03-mobile-equipment.png";
import { VenueMapLinks } from "./VenueMapLinks";
import {
    GlassAvatar,
    GlassAvatarFallback,
    GlassAvatarImage,
    GlassBadge,
    GlassButton,
    GlassSeparator,
    GlassTabs,
    GlassTabsList,
    GlassTabsTrigger,
    GlassTabsContent,
} from "@picklehub/ui-web";
import type { GameEvent } from "../../pages/EventList/types";
import { EventTypeBadge } from "../EventTypeBadge/EventTypeBadge";
import { getFormatDescription } from "../../pages/EventList/helpers/getFormatDescription";
import { getFormatStatus } from "../../pages/EventList/helpers/getFormatStatus";

export interface EventDetailsParticipant {
    id: string;
    name: string;
    avatarUrl?: string;
    dupr?: string | null;
}

export interface EventDetailsProps {
    event: GameEvent;
    currentUserId?: string;
    coverUrl?: string;
    description?: string;
    participants: EventDetailsParticipant[];
    waitlist: EventDetailsParticipant[];
    registrationState?: "none" | "joined" | "waitlisted";
    isPending?: boolean;
    onJoin?: (action: "join" | "waitlist") => void;
    stickyTop?: CSSProperties["top"];
}

function ParticipantGrid({
    people,
    emptyText,
}: {
    people: EventDetailsParticipant[];
    emptyText: string;
}) {
    if (!people.length)
        return <p className="text-sm text-ds-text-secondary">{emptyText}</p>;
    return (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-x-3 gap-y-6">
            {people.map((person) => (
                <li
                    key={person.id}
                    className="flex min-w-0 flex-col items-center gap-2 text-center"
                >
                    <GlassAvatar glowEffect={false} className="h-16 w-16">
                        <GlassAvatarImage
                            src={person.avatarUrl}
                            alt=""
                            className="object-cover"
                        />
                        <GlassAvatarFallback className="bg-ds-surface text-ds-text">
                            {person.name
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((word) => word[0])
                                .join("") || "?"}
                        </GlassAvatarFallback>
                    </GlassAvatar>
                    <GlassBadge
                        size="s"
                        className="text-ds-text"
                        aria-label={`Рейтинг DUPR: ${person.dupr?.trim() || "не указан"}`}
                    >
                        {person.dupr?.trim() || "-/-"}
                    </GlassBadge>
                    <span className="w-full break-words text-sm font-medium">
                        {person.name}
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function EventDetails({
    event,
    currentUserId,
    coverUrl = defaultEventCover,
    description,
    participants,
    waitlist,
    registrationState = "none",
    isPending = false,
    onJoin,
    stickyTop = 0,
}: EventDetailsProps) {
    const headingId = useId();
    const stickyRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const sticky = stickyRef.current;
        const content = contentRef.current;
        if (!sticky || !content) return;

        const updateClip = () => {
            const overlap = Math.max(
                0,
                sticky.getBoundingClientRect().bottom -
                    content.getBoundingClientRect().top,
            );
            content.style.clipPath = `inset(${overlap}px 0 0)`;
        };
        const observer = new ResizeObserver(updateClip);
        observer.observe(sticky);
        observer.observe(content);
        window.addEventListener("scroll", updateClip, true);
        window.addEventListener("resize", updateClip);
        updateClip();
        return () => {
            observer.disconnect();
            window.removeEventListener("scroll", updateClip, true);
            window.removeEventListener("resize", updateClip);
        };
    }, [stickyTop]);
    const [failedCover, setFailedCover] = useState<string>();
    const organizerUsername = event.organizer.telegramUsername
        .trim()
        .replace(/^@/, "");
    const organizerName =
        [event.organizer.firstName?.trim(), event.organizer.lastName?.trim()]
            .filter(Boolean)
            .join(" ") || `@${organizerUsername}`;
    const { time: eventTime } = formatEventSchedule(event.schedule);
    const eventDate = new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
    }).format(new Date(event.schedule.startAt));
    const full = event.participants >= event.maxParticipants;
    const closed = event.status !== "upcoming";
    const buttonText = closed
        ? event.status === "completed"
            ? "Событие завершено"
            : "Запись закрыта"
        : isPending
          ? "Отправляем…"
          : registrationState === "joined"
            ? "Вы участвуете"
            : registrationState === "waitlisted"
              ? "Вы в списке ожидания"
              : full
                ? "В список ожидания"
                : "Присоединиться";

    return (
        <article
            aria-labelledby={headingId}
            className="w-full max-w-lg text-ds-text"
        >
            <GlassTabs
                key={event.id}
                defaultValue={event.status === "completed" ? "results" : "main"}
            >
                <header className="relative isolate flex min-h-72 flex-col justify-end overflow-hidden rounded-b-3xl p-5 pt-[100px]">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 -z-20 bg-ds-surface"
                        style={{
                            maskImage:
                                "linear-gradient(to bottom, transparent, black 40%)",
                        }}
                    />
                    {coverUrl && failedCover !== coverUrl && (
                        <img
                            src={coverUrl}
                            alt=""
                            onError={() => setFailedCover(coverUrl)}
                            className="absolute inset-0 -z-20 h-full w-full object-cover"
                            style={{
                                objectPosition: "center",
                                maskImage:
                                    "linear-gradient(to bottom, transparent, black 40%)",
                            }}
                        />
                    )}
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 -z-10"
                        style={{
                            background:
                                "linear-gradient(to bottom, transparent 10%, var(--ds-background) 100%)",
                        }}
                    />
                    <div className="flex flex-wrap gap-2">
                        <EventTypeBadge type={event.type} />
                        <GlassBadge variant={"warning"}>
                            {getFormatStatus(event.status)}
                        </GlassBadge>
                        {event.rating && (
                            <GlassBadge variant={"primary"}>
                                DUPR {event.rating}
                            </GlassBadge>
                        )}
                    </div>
                    <h1
                        id={headingId}
                        className="mt-3 break-words text-2xl font-semibold"
                    >
                        {event.name}
                    </h1>
                </header>

                <div
                    ref={stickyRef}
                    className="sticky z-20"
                    style={{ top: stickyTop }}
                >
                    <div
                        className="flex flex-wrap items-center gap-3  px-4 py-4"
                        data-event-registration=""
                    >
                        <div className="flex min-w-0 flex-1 items-center gap-3 justify-around">
                            <div className="shrink-0">
                                <p className="text-lg font-semibold">
                                    {event.entryFee === 0
                                        ? "Бесплатно"
                                        : `${new Intl.NumberFormat("ru-RU").format(event.entryFee)} ₽`}
                                </p>
                                <p className="text-xs text-ds-text-secondary">
                                    Стоимость участия
                                </p>
                            </div>
                            <GlassSeparator
                                orientation="vertical"
                                className="h-10 bg-gradient-to-b"
                            />
                            <div className="min-w-0">
                                <p className="text-lg font-semibold">
                                    {eventDate}
                                </p>
                                <p className="text-sm text-ds-text-secondary">
                                    {eventTime}
                                </p>
                            </div>
                        </div>
                        <GlassButton
                            className="min-h-11 max-w-full whitespace-normal"
                            variant="accent"
                            disabled={
                                closed ||
                                isPending ||
                                registrationState !== "none" ||
                                !onJoin
                            }
                            aria-busy={isPending}
                            onClick={() => onJoin?.(full ? "waitlist" : "join")}
                        >
                            {buttonText}
                        </GlassButton>
                        {currentUserId &&
                            currentUserId === event.organizer.id && (
                                <div
                                    className="grid w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-3"
                                    data-event-organizer-actions=""
                                >
                                    <GlassButton
                                        variant="outline"
                                        className="min-h-11 flex-1 text-ds-text"
                                    >
                                        Редактировать
                                    </GlassButton>
                                    <GlassButton
                                        variant="outline"
                                        size="icon"
                                        className="h-11 w-11 shrink-0 border-red-500 text-red-500 hover:border-red-400 hover:bg-red-500/10"
                                        aria-label="Отменить событие"
                                    >
                                        <X
                                            className="h-5 w-5"
                                            aria-hidden="true"
                                        />
                                    </GlassButton>
                                </div>
                            )}
                    </div>

                    <div className="px-4 py-3" data-event-tabs="">
                        <GlassTabsList
                            className="w-full overflow-x-auto overflow-y-hidden bg-transparent"
                            aria-label="Детали события"
                        >
                            <GlassTabsTrigger
                                value="main"
                                aria-label="Основное"
                                className="group flex-1 text-ds-text-secondary data-[state=active]:text-ds-text"
                            >
                                <Info
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                                    Основное
                                </span>
                            </GlassTabsTrigger>
                            <GlassTabsTrigger
                                value="participants"
                                aria-label="Участники"
                                className="group flex-1 text-ds-text-secondary data-[state=active]:text-ds-text"
                            >
                                <Users
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                                    Участники
                                </span>
                            </GlassTabsTrigger>
                            <GlassTabsTrigger
                                value="game"
                                aria-label="Игра"
                                className="group flex-1 text-ds-text-secondary data-[state=active]:text-ds-text"
                            >
                                <img
                                    src={pickleballIcon}
                                    alt=""
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                                    Игра
                                </span>
                            </GlassTabsTrigger>
                            <GlassTabsTrigger
                                value="results"
                                aria-label="Результаты"
                                className="group flex-1 text-ds-text-secondary data-[state=active]:text-ds-text"
                            >
                                <Trophy
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                                    Результаты
                                </span>
                            </GlassTabsTrigger>
                        </GlassTabsList>
                    </div>
                </div>
                <div ref={contentRef} className="grid px-4 pb-8">
                    <GlassTabsContent
                        value="main"
                        forceMount
                        className="min-w-0 col-start-1 row-start-1 data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
                    >
                        <dl className="grid gap-5 break-words text-base leading-relaxed [&_dt]:text-lg [&_dt]:mb-1 [&_dd]:text-sm [&_dt]:text-ds-text-secondary">
                            <div className="min-w-0">
                                <dt>Организатор</dt>
                                <dd className="flex min-w-0 items-center gap-3">
                                    <GlassAvatar
                                        glowEffect={false}
                                        className="h-11 w-11 shrink-0"
                                    >
                                        <GlassAvatarImage
                                            src={event.organizer.avatarUrl}
                                            alt=""
                                            className="object-cover"
                                        />
                                        <GlassAvatarFallback className="bg-ds-surface text-ds-text">
                                            {organizerName
                                                .replace(/^@/, "")
                                                .split(/\s+/)
                                                .slice(0, 2)
                                                .map((word) => word[0])
                                                .join("")
                                                .toUpperCase()}
                                        </GlassAvatarFallback>
                                    </GlassAvatar>
                                    <span
                                        className="min-w-0 truncate"
                                        title={organizerName}
                                    >
                                        {organizerName}
                                    </span>
                                </dd>
                                <dd className="mt-3 flex items-center gap-3">
                                    <a
                                        href={`https://t.me/${encodeURIComponent(organizerUsername)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Написать организатору ${organizerName} в Telegram`}
                                        title="Написать в Telegram"
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ds-border bg-white/5 transition-colors hover:bg-white/10"
                                    >
                                        <svg
                                            width="24"
                                            height="24"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <circle
                                                cx="12"
                                                cy="12"
                                                r="12"
                                                fill="#229ED9"
                                            />
                                            <path
                                                fill="white"
                                                d="m5.1 11.6 13.1-5.1c.6-.2 1 .1.8.9l-2.2 10.4c-.2.7-.6.9-1.2.6l-3.4-2.5-1.6 1.5c-.2.2-.3.3-.6.3l.2-3.5 6.4-5.8c.3-.3-.1-.4-.4-.2l-7.9 5-3.4-1.1c-.7-.2-.7-.7.2-1Z"
                                            />
                                        </svg>
                                    </a>
                                    {event.organizer.phone?.trim() && (
                                        <a
                                            href={`tel:${event.organizer.phone.trim()}`}
                                            aria-label={`Позвонить организатору ${organizerName}`}
                                            title="Позвонить организатору"
                                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ds-border bg-white/5 transition-colors hover:bg-white/10"
                                        >
                                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#34C759] text-white">
                                                <Phone
                                                    size={16}
                                                    fill="currentColor"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                        </a>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Место проведения</dt>
                                <dd className="flex flex-wrap items-center gap-3">
                                    <span>{event.location.name}</span>
                                    <VenueMapLinks location={event.location} />
                                </dd>
                                {event.location.address?.trim() && (
                                    <dd className="mt-1 text-ds-text-secondary">
                                        {event.location.address}
                                    </dd>
                                )}
                            </div>
                            <div>
                                <dt>Формат</dt>
                                <dd>
                                    {event.format}
                                    <p className="mt-1 text-sm text-ds-text-secondary">
                                        {getFormatDescription(event.format)}
                                    </p>
                                </dd>
                            </div>
                            <div>
                                <dt>Участники</dt>
                                <dd>
                                    {event.participants} /{" "}
                                    {event.maxParticipants}
                                </dd>
                            </div>
                            {event.prize.trim() && (
                                <div>
                                    <dt>Призовые</dt>
                                    <dd>{event.prize}</dd>
                                </div>
                            )}
                            <div>
                                <dt>Регистрация завершается</dt>
                                <dd>{event.schedule.registrationDeadline}</dd>
                            </div>
                        </dl>
                        {description?.trim() && (
                            <section className="mt-6">
                                <h2 className="mb-2 text-lg font-semibold">
                                    Описание
                                </h2>
                                <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                                    {description}
                                </p>
                            </section>
                        )}
                    </GlassTabsContent>
                    <GlassTabsContent
                        value="participants"
                        forceMount
                        className="col-start-1 row-start-1 data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
                    >
                        <section>
                            <h2 className="mb-4 font-semibold">
                                Участники · {event.participants} /{" "}
                                {event.maxParticipants}
                            </h2>
                            <ParticipantGrid
                                people={participants}
                                emptyText={
                                    event.participants > 0
                                        ? "Список участников пока недоступен."
                                        : "Пока никто не присоединился."
                                }
                            />
                        </section>
                        <section className="mt-8">
                            <h2 className="mb-4 font-semibold">
                                Список ожидания
                            </h2>
                            <ParticipantGrid
                                people={waitlist}
                                emptyText="В списке ожидания пока никого нет."
                            />
                        </section>
                    </GlassTabsContent>
                    <GlassTabsContent
                        value="game"
                        forceMount
                        className="col-start-1 row-start-1 data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
                    >
                        <p className="py-8 text-center text-sm text-ds-text-secondary">
                            Информация об игре пока недоступна.
                        </p>
                    </GlassTabsContent>
                    <GlassTabsContent
                        value="results"
                        forceMount
                        className="col-start-1 row-start-1 data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
                    >
                        <p className="py-8 text-center text-sm text-ds-text-secondary">
                            {event.status === "completed"
                                ? "Здесь будут результаты участников"
                                : "Событие ещё не завершилось. Результаты появятся позже."}
                        </p>
                    </GlassTabsContent>
                </div>
            </GlassTabs>
        </article>
    );
}

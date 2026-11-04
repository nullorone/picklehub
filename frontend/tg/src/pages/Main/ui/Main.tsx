import { useLayoutEffect, useRef, useState } from "react";
import {
    AgendaCalendarWidget,
    GlassButton,
    GlassSelect,
    GlassSelectTrigger,
    GlassSelectValue,
    GlassSelectContent,
    GlassSelectItem,
    GlassDialog,
    GlassDialogTrigger,
    GlassDialogContent,
    GlassDialogTitle,
    GlassDialogClose,
    GlassTabs,
    GlassTabsList,
    GlassTabsTrigger,
    GlassTabsContent,
} from "@picklehub/ui-web";
import { Archive, CalendarDays, ListFilter, User } from "lucide-react";
import { useAppSelector } from "../../../store/hooks";
import { tournaments } from "../../EventList/mock.ts";
import { Link } from "react-router-dom";
import { Button } from "../../../components/Button/Button.tsx";
import { Card } from "../../../components/Card/Card.tsx";
import { LocationDialog } from "./LocationDialog";

const locations = [
    "Москва",
    "Санкт-Петербург",
    "Казань",
    "Екатеринбург",
    "Новосибирск",
    "Сочи",
];

export function Main() {
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
    }, []);
    const [eventType, setEventType] = useState("any");
    const [typeSelectOpen, setTypeSelectOpen] = useState(false);
    const currentUserId = useAppSelector((state) => state.session.user?.id);
    const filters = [
        {
            value: "all",
            label: "Все",
            icon: CalendarDays,
        },
        { value: "mine", label: "Мои", icon: User, title: "Мои события" },
        {
            value: "archive",
            label: "Архив",
            icon: Archive,
            title: "Архив событий",
        },
    ];

    return (
        <div className="flex flex-col gap-2">
            <AgendaCalendarWidget
                date={new Date()}
                variant={"month-events"}
                timeZone={"Europe/Moscow"}
                events={[
                    {
                        id: "later",
                        title: "Вечерняя игра",
                        startsAt: "2026-10-21T18:00:00Z",
                        color: "#22d3ee",
                    },
                    {
                        id: "past",
                        title: "Утренняя игра",
                        startsAt: "2026-10-21T06:00:00Z",
                    },
                    {
                        id: "first",
                        title: "Открытая тренировка",
                        startsAt: "2026-10-21T12:00:00Z",
                        color: "#c084fc",
                    },
                    {
                        id: "tomorrow",
                        title: "Завтрашняя игра",
                        startsAt: "2026-10-22T12:00:00Z",
                    },
                ]}
            />
            <Button asChild>
                <Link to="/event/new">Создать</Link>
            </Button>
            <GlassTabs defaultValue="all" className="w-full">
                <div
                    ref={stickyRef}
                    className="sticky top-0 z-30 flex flex-col py-3"
                >
                    <section
                        aria-label="Фильтры событий"
                        className="flex flex-col gap-2"
                    >
                        <div className="min-w-0 w-full">
                            <GlassTabsList
                                className="w-full"
                                aria-label="Категории событий"
                            >
                                {filters.map(({ value, label, icon: Icon }) => (
                                    <GlassTabsTrigger
                                        key={value}
                                        value={value}
                                        className="group flex-1"
                                        aria-label={label}
                                    >
                                        <Icon
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                        <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                                            {label}
                                        </span>
                                    </GlassTabsTrigger>
                                ))}
                            </GlassTabsList>
                        </div>
                        <div className="flex items-center gap-2">
                            <GlassDialog>
                                <div className="w-10 shrink-0">
                                    <GlassDialogTrigger asChild>
                                        <GlassButton
                                            variant="outline"
                                            size="icon"
                                            aria-label="Открыть фильтры"
                                            className="w-10 max-w-10 shrink-0"
                                        >
                                            <ListFilter
                                                className="h-5 w-5"
                                                aria-hidden="true"
                                            />
                                        </GlassButton>
                                    </GlassDialogTrigger>
                                </div>
                                <GlassDialogContent
                                    aria-describedby={undefined}
                                    className="bg-white/10 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.2)] before:hidden"
                                >
                                    <GlassDialogTitle>Фильтры</GlassDialogTitle>
                                    <div className="mt-6 flex flex-col gap-2">
                                        <GlassDialogClose asChild>
                                            <GlassButton
                                                variant="accent"
                                                className="w-full"
                                            >
                                                Применить
                                            </GlassButton>
                                        </GlassDialogClose>
                                        <GlassDialogClose asChild>
                                            <GlassButton
                                                variant="outline"
                                                className="w-full"
                                            >
                                                Закрыть
                                            </GlassButton>
                                        </GlassDialogClose>
                                    </div>
                                </GlassDialogContent>
                            </GlassDialog>
                            <LocationDialog locations={locations} />
                            <GlassSelect
                                value={eventType}
                                onValueChange={setEventType}
                                open={typeSelectOpen}
                                onOpenChange={setTypeSelectOpen}
                            >
                                <GlassSelectTrigger
                                    aria-label="Тип события"
                                    className="relative min-w-0 flex-1 justify-center px-8 text-center [&>svg]:absolute [&>svg]:right-4"
                                >
                                    <GlassSelectValue />
                                </GlassSelectTrigger>
                                <GlassSelectContent>
                                    {[
                                        { value: "any", label: "Любое" },
                                        { value: "match", label: "Play On" },
                                        {
                                            value: "tournament",
                                            label: "Турнир",
                                        },
                                        {
                                            value: "trainee",
                                            label: "Тренировка",
                                        },
                                    ].map(({ value, label }) => (
                                        <GlassSelectItem
                                            key={value}
                                            value={value}
                                            className="justify-center px-8 text-center"
                                            // Закрываем список после click, чтобы касание не попало в кнопку под ним.
                                            onPointerUp={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={() => {
                                                setEventType(value);
                                                setTypeSelectOpen(false);
                                            }}
                                        >
                                            {label}
                                        </GlassSelectItem>
                                    ))}
                                </GlassSelectContent>
                            </GlassSelect>
                        </div>
                    </section>
                    {/*<HorizontalCalendarWidget*/}
                    {/*    date={new Date()}*/}
                    {/*    variant="plain"*/}
                    {/*    selectedDate={selectedDate}*/}
                    {/*    onDateSelect={setSelectedDate}*/}
                    {/*/>*/}
                </div>
                <div ref={contentRef}>
                    {filters.map(({ value, title }) => {
                        const events = tournaments
                            .filter((event) => {
                                if (
                                    eventType !== "any" &&
                                    event.type !== eventType
                                )
                                    return false;
                                if (value === "archive")
                                    return event.status === "completed";
                                if (event.status === "completed") return false;
                                return (
                                    value === "all" ||
                                    Boolean(
                                        currentUserId &&
                                        (event.organizer.id === currentUserId ||
                                            event.delegateIds?.includes(
                                                currentUserId,
                                            )),
                                    )
                                );
                            })
                            .slice(0, 2);

                        return (
                            <GlassTabsContent key={value} value={value}>
                                <div className="flex flex-col gap-2">
                                    {title && (
                                        <h2 className="text-lg text-white font-semibold">
                                            {title}
                                        </h2>
                                    )}
                                    {events.length > 0 ? (
                                        <ul className="flex flex-col gap-4">
                                            {events.map((event) => (
                                                <li key={event.id}>
                                                    <Card {...event} />
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p
                                            role="status"
                                            className="py-4 text-text-secondary"
                                        >
                                            {value === "mine"
                                                ? "У вас пока нет событий."
                                                : "Событий пока нет."}
                                        </p>
                                    )}
                                </div>
                            </GlassTabsContent>
                        );
                    })}
                </div>
            </GlassTabs>
        </div>
    );
}

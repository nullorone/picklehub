import { GlassTabsContent, HorizontalCalendarWidget } from "@picklehub/ui-web";
import { useTournamentList } from "../../hooks/useTournamentList.ts";
import { EventListLoading } from "../EventListLoading/EventListLoading.tsx";
import { EventListError } from "../EventListError/EventListError.tsx";
import { EventListEmpty } from "../EventListEmpty/EventListEmpty.tsx";
import {
    CardList,
    CardWrapper,
} from "../EventListPage/EventListPage.styles.tsx";
import { EventCard } from "@/components/EventCard/EventCard";
import { useState } from "react";

export interface TabContentAllProps {
    games: ReturnType<typeof useTournamentList>;
}

export function TabContentAll({ games }: TabContentAllProps) {
    const [selectedDate, setSelectedDate] = useState<string | undefined>();
    const date = new Date();

    return (
        <GlassTabsContent value="all">
            <div className={"flex flex-col gap-4"}>
                <HorizontalCalendarWidget
                    key={"all"}
                    date={date}
                    variant={"plain"}
                    months={12}
                    timeZone={"Europe/Moscow"}
                    onDateSelect={setSelectedDate}
                    selectedDate={selectedDate}
                    events={[
                        {
                            id: "later",
                            title: "Игра",
                            startsAt: "2026-10-22T18:00:00Z",
                            color: "#22d3ee",
                        },
                        {
                            id: "first",
                            title: "Тренировка",
                            startsAt: "2026-10-22T12:00:00Z",
                            color: "#c084fc",
                        },
                        {
                            id: "next",
                            title: "Ночная игра",
                            startsAt: "2026-10-21T22:00:00Z",
                            color: "#22d3ee",
                        },
                    ]}
                />
                <div className="space-y-4">
                    {games.isPending && <EventListLoading />}
                    {games.isError && <EventListError events={games} />}
                    {games.isSuccess && games.data.items.length === 0 && (
                        <EventListEmpty />
                    )}
                    {games.isSuccess && games.data.items.length > 0 && (
                        <CardList>
                            {games.data.items.map((game) => (
                                <CardWrapper key={game.id}>
                                    <EventCard {...game} />
                                </CardWrapper>
                            ))}
                        </CardList>
                    )}
                </div>
            </div>
        </GlassTabsContent>
    );
}

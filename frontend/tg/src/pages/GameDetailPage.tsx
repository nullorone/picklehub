import { Link, useParams } from "react-router-dom";
import { Page } from "@/components/Page.tsx";
import { Card } from "@/components/ui/Card/Card.tsx";
import { useGame } from "@/api/useGames.ts";
import { formatGameDate, statusLabel } from "@/pages/gameFormatting.ts";

export function GameDetailPage() {
    const { matchId = "" } = useParams();
    const gameQuery = useGame(matchId);

    return (
        <Page>
            <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-8 sm:px-6">
                <Link
                    className="min-h-11 py-2 text-sm font-semibold text-accent"
                    to="/"
                >
                    ← Все игры
                </Link>

                {gameQuery.isPending && (
                    <Card
                        className="grid gap-4"
                        aria-label="Загрузка игры"
                        aria-live="polite"
                    >
                        <div className="h-6 w-2/3 animate-pulse rounded-small bg-background" />
                        <div className="h-4 w-full animate-pulse rounded-small bg-background" />
                        <p className="text-sm text-text-secondary">
                            Загружаем игру…
                        </p>
                    </Card>
                )}

                {gameQuery.isError && (
                    <Card className="grid gap-3" role="alert">
                        <h1 className="text-lg font-semibold">
                            {gameQuery.error instanceof Error &&
                            "status" in gameQuery.error &&
                            gameQuery.error.status === 404
                                ? "Игра не найдена"
                                : !navigator.onLine
                                  ? "Нет подключения к сети"
                                  : "Не удалось загрузить игру"}
                        </h1>
                        <p className="text-sm leading-relaxed text-text-secondary">
                            {gameQuery.error instanceof Error &&
                            "status" in gameQuery.error &&
                            gameQuery.error.status === 404
                                ? "Возможно, ссылка устарела или игра была удалена."
                                : "Проверьте соединение и попробуйте ещё раз."}
                        </p>
                        <button
                            className="min-h-12 rounded-control bg-accent px-5 py-3 font-semibold text-[var(--ph-button-text)]"
                            onClick={() => void gameQuery.refetch()}
                            type="button"
                        >
                            Повторить
                        </button>
                    </Card>
                )}

                {gameQuery.isSuccess &&
                    (() => {
                        const game = gameQuery.data;
                        const date = formatGameDate(game.startsAt);
                        const organizer = game.participants.find(
                            (participant) =>
                                participant.userId === game.organizerId,
                        );
                        return (
                            <>
                                <header className="grid gap-2">
                                    <span className="w-fit rounded-small bg-surface px-3 py-1 text-sm font-medium">
                                        {statusLabel(game.status)}
                                    </span>
                                    <h1 className="break-words text-2xl font-bold">
                                        {game.venueName}
                                    </h1>
                                    <p className="text-sm font-medium capitalize">
                                        {date.dateText} · {date.timeText}
                                    </p>
                                </header>

                                <Card className="grid gap-4">
                                    <section>
                                        <h2 className="text-sm font-semibold text-text-secondary">
                                            Адрес
                                        </h2>
                                        <p className="mt-1 break-words leading-relaxed">
                                            {game.venueAddress}
                                        </p>
                                    </section>
                                    <div className="grid grid-cols-2 gap-4">
                                        <section>
                                            <h2 className="text-sm font-semibold text-text-secondary">
                                                Длительность
                                            </h2>
                                            <p className="mt-1">
                                                {game.durationMinutes} минут
                                            </p>
                                        </section>
                                        <section>
                                            <h2 className="text-sm font-semibold text-text-secondary">
                                                Уровень
                                            </h2>
                                            <p className="mt-1 break-words">
                                                {game.desiredLevel ?? "Любой"}
                                            </p>
                                        </section>
                                    </div>
                                    <section>
                                        <h2 className="text-sm font-semibold text-text-secondary">
                                            Организатор
                                        </h2>
                                        <p className="mt-1 break-words">
                                            {organizer?.displayName ??
                                                "Организатор игры"}
                                        </p>
                                    </section>
                                    {game.description && (
                                        <section>
                                            <h2 className="text-sm font-semibold text-text-secondary">
                                                О встрече
                                            </h2>
                                            <p className="mt-1 break-words whitespace-pre-wrap leading-relaxed">
                                                {game.description}
                                            </p>
                                        </section>
                                    )}
                                    <section>
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <h2 className="font-semibold">
                                                Участники
                                            </h2>
                                            <p className="text-sm font-semibold">
                                                {game.participantCount} из{" "}
                                                {game.participantLimit} мест
                                            </p>
                                        </div>
                                        {game.participants.length > 0 ? (
                                            <ul className="mt-3 grid gap-2">
                                                {game.participants.map(
                                                    (participant) => (
                                                        <li
                                                            className="break-words rounded-small bg-background px-3 py-3"
                                                            key={
                                                                participant.userId
                                                            }
                                                        >
                                                            {
                                                                participant.displayName
                                                            }
                                                            {participant.userId ===
                                                                game.organizerId && (
                                                                <span className="ml-2 text-sm text-text-secondary">
                                                                    ·
                                                                    организатор
                                                                </span>
                                                            )}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        ) : (
                                            <p className="mt-2 text-sm text-text-secondary">
                                                Пока никто не записался.
                                            </p>
                                        )}
                                    </section>
                                </Card>
                            </>
                        );
                    })()}
            </main>
        </Page>
    );
}

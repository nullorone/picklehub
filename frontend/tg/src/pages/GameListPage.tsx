import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card.tsx";
import { useGames } from "@/api/useGames.ts";
import { formatGameDate, statusLabel } from "@/pages/gameFormatting.ts";

export function GameListPage() {
    const games = useGames();

    return (
        <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-8 sm:px-6">
            <header className="grid gap-1">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent">
                    PickleHub
                </p>
                <h1 className="text-2xl font-bold">Ближайшие игры</h1>
                <p className="text-sm text-text-secondary">
                    Выберите встречу и присоединяйтесь.
                </p>
                <Link
                    className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-control bg-accent px-5 py-3 text-base font-semibold text-[var(--ph-button-text)] transition-colors hover:bg-accent-hover focus-visible:outline-offset-4"
                    to="/games/new"
                >
                    Создать игру
                </Link>
            </header>

            {games.isPending && (
                <div
                    className="grid gap-3"
                    aria-label="Загрузка игр"
                    aria-live="polite"
                >
                    {[1, 2, 3].map((item) => (
                        <Card className="grid gap-3" key={item}>
                            <div className="h-5 w-2/3 animate-pulse rounded-small bg-background" />
                            <div className="h-4 w-full animate-pulse rounded-small bg-background" />
                            <div className="h-4 w-1/2 animate-pulse rounded-small bg-background" />
                        </Card>
                    ))}
                    <p className="text-sm text-text-secondary">
                        Загружаем игры…
                    </p>
                </div>
            )}

            {games.isError && (
                <Card className="grid gap-3" role="alert">
                    <h2 className="font-semibold">
                        {!navigator.onLine
                            ? "Нет подключения к сети"
                            : "Не удалось загрузить игры"}
                    </h2>
                    <p className="text-sm leading-relaxed text-text-secondary">
                        {!navigator.onLine
                            ? "Проверьте интернет и попробуйте ещё раз."
                            : "Проверьте соединение и повторите загрузку."}
                    </p>
                    <button
                        className="min-h-12 rounded-control bg-accent px-5 py-3 font-semibold text-[var(--ph-button-text)]"
                        onClick={() => void games.refetch()}
                        type="button"
                    >
                        Повторить
                    </button>
                </Card>
            )}

            {games.isSuccess && games.data.items.length === 0 && (
                <Card className="grid gap-2">
                    <h2 className="font-semibold">
                        Пока нет запланированных игр
                    </h2>
                    <p className="text-sm leading-relaxed text-text-secondary">
                        Загляните позже — новые встречи появятся здесь.
                    </p>
                </Card>
            )}

            {games.isSuccess && games.data.items.length > 0 && (
                <ul className="grid gap-3">
                    {games.data.items.map((game) => {
                        const date = formatGameDate(game.startsAt);
                        return (
                            <li key={game.id}>
                                <Link
                                    className="block rounded-card focus-visible:outline-offset-4"
                                    to={`/matches/${game.id}`}
                                >
                                    <Card className="grid gap-3 transition-colors hover:border-accent">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">
                                                {game.venueName}
                                            </h2>
                                            <span className="shrink-0 rounded-small bg-background px-2 py-1 text-xs font-medium">
                                                {statusLabel(game.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium capitalize">
                                            {date.dateText} · {date.timeText}
                                        </p>
                                        <p className="break-words text-sm text-text-secondary">
                                            {game.venueAddress}
                                        </p>
                                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                                            <span className="text-text-secondary">
                                                Уровень:{" "}
                                                {game.desiredLevel ?? "любой"}
                                            </span>
                                            <span className="font-semibold">
                                                {game.participantCount} из{" "}
                                                {game.participantLimit} игроков
                                            </span>
                                        </div>
                                    </Card>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}

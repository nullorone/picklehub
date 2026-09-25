import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Page } from "@/components/Page.tsx";
import { Card } from "@/components/ui/Card/Card.tsx";
import { useGame } from "@/api/useGames.ts";
import { ApiError } from "@/api/games.ts";
import {
    useJoinGame,
    useLeaveGame,
    useRemoveParticipant,
    useCancelGame,
} from "@/api/useGames.ts";
import { mockUser, mockUserIds } from "@/api/client.ts";
import { formatGameDate, statusLabel } from "@/pages/gameFormatting.ts";
import { Button } from "@/components/ui/Button/Button.tsx";
import { gameShareLink } from "@/pages/gameShareLink.ts";

export function GameDetailPage() {
    const { matchId = "" } = useParams();
    const gameQuery = useGame(matchId);
    const joinMutation = useJoinGame();
    const leaveMutation = useLeaveGame();
    const removeMutation = useRemoveParticipant();
    const cancelMutation = useCancelGame();
    const [shareMessage, setShareMessage] = useState("");
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const startsAt = gameQuery.data?.startsAt;
        if (!startsAt) return;
        const delay = Date.parse(startsAt) - Date.now();
        if (delay <= 0) return;
        const timeout = window.setTimeout(() => setNow(Date.now()), delay);
        return () => window.clearTimeout(timeout);
    }, [gameQuery.data?.startsAt]);

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
                        const currentUserId =
                            import.meta.env.DEV &&
                            import.meta.env.VITE_API_MOCKS !== "false"
                                ? mockUserIds[mockUser]
                                : undefined;
                        const isParticipant = currentUserId
                            ? game.participants.some(
                                  (participant) =>
                                      participant.userId === currentUserId,
                              )
                            : false;
                        const isOrganizer = Boolean(
                            currentUserId && currentUserId === game.organizerId,
                        );
                        const hasStarted = now >= Date.parse(game.startsAt);
                        const isClosed =
                            game.status === "CANCELLED" || hasStarted;
                        const isFull =
                            game.status === "FULL" ||
                            game.participantCount >= game.participantLimit;
                        const mutation = isParticipant
                            ? leaveMutation
                            : joinMutation;
                        const isMutationPending =
                            joinMutation.isPending || leaveMutation.isPending;
                        const mutationError = mutation.error;
                        const mutationMessage =
                            mutationError instanceof ApiError &&
                            mutationError.code === "GAME_FULL"
                                ? "Все места уже заняты. Состав обновлён."
                                : mutationError instanceof ApiError &&
                                    mutationError.code === "GAME_CANCELLED"
                                  ? "Игра отменена, изменить состав нельзя."
                                  : mutationError instanceof ApiError &&
                                      mutationError.status === 409 &&
                                      mutationError.code === "GAME_CONFLICT"
                                    ? "Игра уже началась, изменить состав нельзя."
                                    : !navigator.onLine
                                      ? "Нет подключения к сети. Проверьте соединение и попробуйте ещё раз."
                                      : "Не удалось изменить состав. Попробуйте ещё раз.";
                        return (
                            <>
                                <header className="grid gap-2">
                                    <span className="w-fit rounded-small bg-surface px-3 py-1 text-sm font-medium">
                                        {hasStarted &&
                                        game.status !== "CANCELLED"
                                            ? "Уже началась"
                                            : statusLabel(game.status)}
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
                                    {isClosed && (
                                        <p
                                            className="text-sm text-text-secondary"
                                            role="status"
                                        >
                                            {game.status === "CANCELLED"
                                                ? "Игра отменена. Состав изменить нельзя."
                                                : "Игра уже началась. Запись и выход закрыты."}
                                        </p>
                                    )}
                                    {currentUserId && !isClosed && (
                                        <section className="grid gap-2">
                                            <Button
                                                disabled={
                                                    isMutationPending ||
                                                    (!isParticipant && isFull)
                                                }
                                                onClick={() => {
                                                    joinMutation.reset();
                                                    leaveMutation.reset();
                                                    if (isParticipant) {
                                                        leaveMutation.mutate(
                                                            game.id,
                                                        );
                                                    } else {
                                                        joinMutation.mutate(
                                                            game.id,
                                                        );
                                                    }
                                                }}
                                                type="button"
                                                variant={
                                                    isParticipant
                                                        ? "secondary"
                                                        : "primary"
                                                }
                                            >
                                                {isMutationPending
                                                    ? "Обновляем состав…"
                                                    : isParticipant
                                                      ? "Выйти из игры"
                                                      : isFull
                                                        ? "Мест нет"
                                                        : "Записаться"}
                                            </Button>
                                            {mutationError && (
                                                <p
                                                    className="text-sm text-error"
                                                    role="alert"
                                                >
                                                    {mutationMessage}
                                                </p>
                                            )}
                                        </section>
                                    )}
                                    {isOrganizer &&
                                        game.status !== "CANCELLED" && (
                                            <section
                                                className="grid gap-3 border-t border-border pt-4"
                                                aria-label="Управление игрой"
                                            >
                                                <h2 className="font-semibold">
                                                    Управление игрой
                                                </h2>
                                                <Link
                                                    className="min-h-11 rounded-control border border-border px-4 py-3 text-center font-semibold"
                                                    to={`/matches/${game.id}/edit`}
                                                >
                                                    Редактировать игру
                                                </Link>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        void (async () => {
                                                            const link =
                                                                gameShareLink(
                                                                    game.id,
                                                                );
                                                            try {
                                                                if (
                                                                    navigator.share
                                                                )
                                                                    await navigator.share(
                                                                        {
                                                                            title: game.venueName,
                                                                            url: link,
                                                                        },
                                                                    );
                                                                else
                                                                    await navigator.clipboard.writeText(
                                                                        link,
                                                                    );
                                                                setShareMessage(
                                                                    "Ссылка на игру готова к отправке.",
                                                                );
                                                            } catch {
                                                                setShareMessage(
                                                                    "Не удалось передать ссылку. Скопируйте адрес страницы вручную.",
                                                                );
                                                            }
                                                        })();
                                                    }}
                                                >
                                                    Поделиться ссылкой
                                                </Button>
                                                {shareMessage && (
                                                    <p
                                                        className="text-sm text-text-secondary"
                                                        role="status"
                                                    >
                                                        {shareMessage}
                                                    </p>
                                                )}
                                                {game.participants
                                                    .filter(
                                                        (participant) =>
                                                            participant.userId !==
                                                            game.organizerId,
                                                    )
                                                    .map((participant) => (
                                                        <Button
                                                            key={
                                                                participant.userId
                                                            }
                                                            type="button"
                                                            variant="secondary"
                                                            disabled={
                                                                removeMutation.isPending
                                                            }
                                                            onClick={() => {
                                                                if (
                                                                    window.confirm(
                                                                        `Удалить ${participant.displayName} из игры? Это освободит место для записи другого игрока.`,
                                                                    )
                                                                )
                                                                    removeMutation.mutate(
                                                                        {
                                                                            gameId: game.id,
                                                                            userId: participant.userId,
                                                                        },
                                                                    );
                                                            }}
                                                        >
                                                            Удалить{" "}
                                                            {
                                                                participant.displayName
                                                            }
                                                        </Button>
                                                    ))}
                                                {removeMutation.isError && (
                                                    <p
                                                        className="text-sm text-error"
                                                        role="alert"
                                                    >
                                                        {removeMutation.error instanceof
                                                            ApiError &&
                                                        removeMutation.error
                                                            .status === 403
                                                            ? "Сервер отказал в доступе к управлению этой игрой."
                                                            : "Не удалось удалить участника. Состав обновится после повтора."}
                                                    </p>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    disabled={
                                                        cancelMutation.isPending
                                                    }
                                                    onClick={() => {
                                                        if (
                                                            window.confirm(
                                                                `Отменить игру «${game.venueName}»? Участники увидят, что игра отменена.`,
                                                            )
                                                        )
                                                            cancelMutation.mutate(
                                                                game.id,
                                                            );
                                                    }}
                                                >
                                                    {cancelMutation.isPending
                                                        ? "Отменяем…"
                                                        : "Отменить игру"}
                                                </Button>
                                                {cancelMutation.isError && (
                                                    <p
                                                        className="text-sm text-error"
                                                        role="alert"
                                                    >
                                                        {cancelMutation.error instanceof
                                                            ApiError &&
                                                        cancelMutation.error
                                                            .status === 403
                                                            ? "Сервер отказал в доступе к управлению этой игрой."
                                                            : "Не удалось отменить игру. Попробуйте ещё раз."}
                                                    </p>
                                                )}
                                            </section>
                                        )}
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

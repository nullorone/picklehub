import { useNavigate, useParams } from "react-router-dom";
import { Page } from "@/components/Page.tsx";
import { GlassCard } from "../../../../components/GlassCard/Card.tsx";
import { EventForm } from "@/components/EventForm/EventForm.tsx";
import { useGame, useUpdateGame } from "@/api/useGames.ts";
import { useSessionUser } from "@/api/session.ts";

export function EventEditPage() {
    const { eventId = "" } = useParams();
    const gameQuery = useGame(eventId);
    const update = useUpdateGame();
    const navigate = useNavigate();
    const currentUserId = useSessionUser()?.id;
    const game = gameQuery.data;
    return (
        <Page>
            <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-8 sm:px-6">
                {gameQuery.isPending && <p role="status">Загружаем игру…</p>}
                {gameQuery.isError && (
                    <GlassCard role="alert">
                        Не удалось загрузить игру для редактирования.
                    </GlassCard>
                )}
                {game && game.organizerId !== currentUserId && (
                    <GlassCard role="alert">
                        Только организатор может редактировать эту игру.
                    </GlassCard>
                )}
                {game && game.organizerId === currentUserId && (
                    <EventForm
                        key={game.id}
                        game={game}
                        pending={update.isPending}
                        isError={update.isError}
                        onReset={() => update.reset()}
                        onSubmit={async (input) => {
                            const updated = await update.mutateAsync({
                                gameId: game.id,
                                input,
                            });
                            navigate(`/event/${updated.id}`);
                        }}
                    />
                )}
            </main>
        </Page>
    );
}

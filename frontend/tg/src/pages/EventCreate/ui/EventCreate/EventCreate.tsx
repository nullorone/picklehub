import { useNavigate } from "react-router-dom";
import { Page } from "@/components/Page.tsx";
import { EventForm } from "@/components/EventForm/EventForm.tsx";
import { useCreateGame } from "@/api/useGames.ts";
import { useState } from "react";
import { EventCreatedDialog } from "@picklehub/ui-web";
import type { GameDetail } from "@/api/games.ts";
import { gameShareLink } from "@/helpers/gameShareLink.ts";

export function EventCreate() {
    const navigate = useNavigate();
    const create = useCreateGame();
    const [createdGame, setCreatedGame] = useState<GameDetail>();
    const [shareMessage, setShareMessage] = useState("");

    async function shareEvent() {
        if (!createdGame) return;
        const url = gameShareLink(createdGame.id);
        try {
            if (navigator.share) {
                await navigator.share({ title: "Событие PickleHub", url });
            } else {
                await navigator.clipboard.writeText(url);
                setShareMessage("Ссылка скопирована. Отправьте её игрокам!");
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                return;
            setShareMessage(
                "Не удалось поделиться ссылкой. Попробуйте ещё раз.",
            );
        }
    }

    return (
        <Page>
            <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-4 sm:px-6">
                <EventForm
                    pending={create.isPending || Boolean(createdGame)}
                    isError={create.isError}
                    onReset={() => create.reset()}
                    onSubmit={async (input) => {
                        const game = await create.mutateAsync(input);
                        setCreatedGame(game);
                    }}
                />
                {createdGame && (
                    <EventCreatedDialog
                        open
                        startsAt={createdGame.startsAt}
                        shareMessage={shareMessage}
                        onClose={() =>
                            navigate(`/event/${createdGame.id}/details`)
                        }
                        onShare={() => {
                            void shareEvent();
                        }}
                    />
                )}
            </main>
        </Page>
    );
}

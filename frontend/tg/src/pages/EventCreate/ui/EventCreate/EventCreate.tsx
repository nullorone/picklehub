import { useNavigate } from "react-router-dom";
import { Page } from "@/components/Page.tsx";
import { EventForm } from "@/components/EventForm/EventForm.tsx";
import { useCreateGame } from "@/api/useGames.ts";

export function EventCreate() {
    const navigate = useNavigate();
    const create = useCreateGame();

    return (
        <Page>
            <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-4 sm:px-6">
                <EventForm
                    pending={create.isPending}
                    isError={create.isError}
                    onReset={() => create.reset()}
                    onSubmit={async (input) => {
                        const game = await create.mutateAsync(input);
                        navigate(`/event/${game.id}`);
                    }}
                />
            </main>
        </Page>
    );
}

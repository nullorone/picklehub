import { Button } from "../../../../components/Button/Button.tsx";
import { GlassCard } from "../../../../components/GlassCard/Card.tsx";
import { useTournamentList } from "../../hooks/useTournamentList.ts";

export interface EventListErrorProps {
    events: ReturnType<typeof useTournamentList>;
}

export function EventListError({ events }: EventListErrorProps) {
    return (
        <GlassCard className="grid gap-3" role="alert">
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
            <Button onClick={() => void events.refetch()} type="button">
                Повторить
            </Button>
        </GlassCard>
    );
}

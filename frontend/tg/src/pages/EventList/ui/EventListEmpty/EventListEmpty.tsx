import { GlassCard } from "../../../../components/GlassCard/Card.tsx";

export function EventListEmpty() {
    return (
        <GlassCard className="grid gap-2">
            <h2 className="font-semibold">Пока нет запланированных игр</h2>
            <p className="text-sm leading-relaxed text-text-secondary">
                Загляните позже — новые встречи появятся здесь.
            </p>
        </GlassCard>
    );
}

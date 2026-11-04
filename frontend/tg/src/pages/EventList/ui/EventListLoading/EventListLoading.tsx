import {
    GlassCard,
    GlassCardContent,
    GlassCardFooter,
    GlassCardHeader,
    GlassSkeleton,
} from "@picklehub/ui-web";

const COUNT_CARD = 3;

export function EventListLoading() {
    return (
        <div
            className="grid gap-3"
            aria-label="Загрузка событий"
            aria-live="polite"
        >
            {new Array(COUNT_CARD).fill(null).map((_, idx) => (
                <div key={idx} className="w-full max-w-md">
                    <GlassCard className="w-full">
                        <GlassCardHeader className="space-y-2">
                            <GlassSkeleton className="h-5 w-1/2" />
                            <GlassSkeleton className="h-4 w-3/4" />
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-2">
                            <GlassSkeleton className="h-4 w-full" />
                            <GlassSkeleton className="h-4 w-full" />
                            <GlassSkeleton className="h-4 w-2/3" />
                        </GlassCardContent>
                        <GlassCardFooter>
                            <GlassSkeleton className="h-10 w-full" />
                        </GlassCardFooter>
                    </GlassCard>
                </div>
            ))}
        </div>
    );
}

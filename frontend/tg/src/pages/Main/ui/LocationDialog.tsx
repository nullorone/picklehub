import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { detectLocation, locationSelected } from "../../../store/locationSlice";
import { MapPin, Navigation } from "lucide-react";
import {
    GlassButton,
    GlassDialog,
    GlassDialogClose,
    GlassDialogContent,
    GlassDialogTitle,
    GlassDialogTrigger,
    GlassInput,
} from "@picklehub/ui-web";

interface LocationDialogProps {
    locations: readonly string[];
}

export function LocationDialog({ locations }: LocationDialogProps) {
    const dispatch = useAppDispatch();
    const { selected, requestId, error } = useAppSelector(
        (state) => state.location,
    );
    const value = selected?.source === "manual" ? selected.name : undefined;
    useEffect(() => {
        void dispatch(detectLocation({ requestPermission: false }));
    }, [dispatch]);
    const [query, setQuery] = useState("");
    const [draft, setDraft] = useState(value);
    const matches = locations.filter((location) =>
        location
            .toLocaleLowerCase("ru")
            .includes(query.trim().toLocaleLowerCase("ru")),
    );

    return (
        <GlassDialog
            onOpenChange={(open) => {
                if (open) {
                    setQuery("");
                    setDraft(value);
                }
            }}
        >
            <div className="w-10 shrink-0">
                <GlassDialogTrigger asChild>
                    <GlassButton
                        variant="outline"
                        size="icon"
                        aria-label="Локация"
                        title={selected?.name ?? "Локация"}
                        className="w-10 max-w-10 shrink-0"
                    >
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                    </GlassButton>
                </GlassDialogTrigger>
                <GlassDialogContent
                    aria-describedby={undefined}
                    className="bg-white/10 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.2)] before:hidden"
                >
                    <GlassDialogTitle>Локация</GlassDialogTitle>
                    <div className="mt-6 flex flex-col gap-3">
                        <section
                            aria-label="Выбранная локация"
                            className="rounded-xl border border-white/20 p-3 text-sm text-white"
                        >
                            <p className="mt-1 font-medium">
                                {selected?.name ?? "Локация не выбрана"}
                            </p>
                        </section>
                        <GlassButton
                            variant="outline"
                            disabled={Boolean(requestId)}
                            onClick={() => {
                                setDraft(undefined);
                                void dispatch(
                                    detectLocation({ requestPermission: true }),
                                );
                            }}
                        >
                            <Navigation
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                            {requestId
                                ? "Определяем местоположение…"
                                : "Текущая"}
                        </GlassButton>
                        {error && (
                            <p role="alert" className="text-sm text-white/70">
                                {error}
                            </p>
                        )}
                        <label
                            htmlFor="location-search"
                            className="text-sm text-white"
                        >
                            Ваша локация
                        </label>
                        <GlassInput
                            id="location-search"
                            type="search"
                            placeholder="Поиск локации"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <fieldset className="max-h-60 overflow-y-auto flex flex-col gap-2">
                            <legend className="sr-only">
                                Выберите локацию
                            </legend>
                            {matches.map((location) => (
                                <label
                                    key={location}
                                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/20 p-3 text-sm text-white has-[:checked]:bg-white/10"
                                >
                                    <input
                                        type="radio"
                                        name="location"
                                        value={location}
                                        checked={draft === location}
                                        onChange={() => setDraft(location)}
                                        className="accent-cyan-400"
                                    />
                                    {location}
                                </label>
                            ))}
                            {matches.length === 0 && (
                                <p
                                    role="status"
                                    className="text-sm text-white/60"
                                >
                                    Локации не найдены.
                                </p>
                            )}
                        </fieldset>
                        <GlassDialogClose asChild>
                            <GlassButton
                                variant="accent"
                                className="w-full"
                                disabled={!draft}
                                onClick={() => {
                                    if (draft)
                                        dispatch(locationSelected(draft));
                                }}
                            >
                                Применить
                            </GlassButton>
                        </GlassDialogClose>
                        <GlassDialogClose asChild>
                            <GlassButton variant="outline" className="w-full">
                                Закрыть
                            </GlassButton>
                        </GlassDialogClose>
                    </div>
                </GlassDialogContent>
            </div>
        </GlassDialog>
    );
}

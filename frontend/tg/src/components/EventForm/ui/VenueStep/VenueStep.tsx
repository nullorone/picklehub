import { useEffect, useId, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    MapPin,
    Plus,
    Search,
    X,
} from "lucide-react";
import {
    Button,
    GlassInput,
    GlassSeparator,
    GlassTextarea,
} from "@picklehub/ui-web";
import { Label } from "@picklehub/ui-web/label";
import { minVenueSearchLength, venueSearchLimit } from "./const";
import { searchVenues } from "./searchVenues";
import { formatAddress } from "@/helpers/formatAddress";
import type { VenueMode, VenueStepProps } from "./types";

export function VenueStep({
    values,
    hidden,
    busy,
    update,
    errors,
    venues,
    loading,
    loadError,
    onRetry,
}: VenueStepProps) {
    const id = useId();
    const searchRef = useRef<HTMLInputElement>(null);
    const manualDraft = useRef({
        name: values.venueName,
        address: values.venueAddress,
    });
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState<VenueMode>(
        values.venueAddress ? "selected" : "search",
    );
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const results = searchVenues(venues, query);
    const visibleResults = results.slice(0, venueSearchLimit);
    const searching = query.trim().length >= minVenueSearchLength;
    const expanded = open && visibleResults.length > 0;
    const activeVenue = expanded ? visibleResults[activeIndex] : undefined;

    useEffect(() => {
        if (activeVenue)
            document
                .getElementById(`${id}-${activeVenue.id}`)
                ?.scrollIntoView({ block: "nearest" });
    }, [activeVenue, id]);

    const selectVenue = (venue: (typeof venues)[number]) => {
        update("venueName", venue.name);
        update("venueAddress", venue.address);
        setMode("selected");
        setOpen(false);
    };

    return (
        <fieldset
            hidden={hidden}
            className="grid w-full min-w-0 max-w-sm gap-6"
            disabled={busy}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                    setActiveIndex(-1);
                }
            }}
        >
            <legend className="sr-only">Площадка события</legend>
            {mode === "search" && (
                <>
                    <div className="grid gap-2">
                        <Label
                            htmlFor={`${id}-search`}
                            className="text-white/80"
                        >
                            Название или адрес
                        </Label>
                        <div className="relative">
                            <GlassInput
                                ref={searchRef}
                                id={`${id}-search`}
                                name="venueSearch"
                                role="combobox"
                                className="h-12 pl-10 pr-11"
                                value={query}
                                placeholder="Название, адрес"
                                maxLength={300}
                                autoComplete="off"
                                aria-autocomplete="list"
                                aria-expanded={expanded}
                                aria-controls={
                                    expanded ? `${id}-results` : undefined
                                }
                                aria-activedescendant={
                                    activeVenue
                                        ? `${id}-${activeVenue.id}`
                                        : undefined
                                }
                                aria-describedby={`${id}-hint`}
                                onFocus={() => setOpen(true)}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setOpen(true);
                                    setActiveIndex(-1);
                                }}
                                onKeyDown={(event) => {
                                    if (event.nativeEvent.isComposing) return;
                                    if (event.key === "Escape") {
                                        event.preventDefault();
                                        setOpen(false);
                                        setActiveIndex(-1);
                                    }
                                    if (
                                        (event.key === "ArrowDown" ||
                                            event.key === "ArrowUp") &&
                                        visibleResults.length
                                    ) {
                                        event.preventDefault();
                                        setOpen(true);
                                        const next =
                                            event.key === "ArrowDown"
                                                ? (activeIndex + 1) %
                                                  visibleResults.length
                                                : (activeIndex <= 0
                                                      ? visibleResults.length
                                                      : activeIndex) - 1;
                                        setActiveIndex(next);
                                    }
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        if (activeVenue)
                                            selectVenue(activeVenue);
                                    }
                                }}
                            />
                            <Search
                                className="pointer-events-none absolute left-3 top-3.5 size-5 text-white/50"
                                aria-hidden="true"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="Очистить поиск"
                                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                    onClick={() => {
                                        setQuery("");
                                        setActiveIndex(-1);
                                        searchRef.current?.focus();
                                    }}
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        <p
                            id={`${id}-hint`}
                            role="status"
                            className="text-sm text-text-secondary"
                        >
                            {!searching
                                ? "Начните вводить название или адрес площадки."
                                : loading
                                  ? "Ищем площадки…"
                                  : loadError
                                    ? "Поиск временно недоступен. Можно указать адрес вручную."
                                    : results.length
                                      ? `Найдено площадок: ${results.length}`
                                      : "В нашем списке пока нет такого места. Укажите адрес вручную."}
                        </p>
                        {expanded && (
                            <ul
                                id={`${id}-results`}
                                role="listbox"
                                aria-label="Найденные площадки"
                                className="flex max-h-72 flex-col gap-1 scroll-py-1 overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-white/5 p-1"
                            >
                                {visibleResults.map((venue, index) => (
                                    <li
                                        key={venue.id}
                                        id={`${id}-${venue.id}`}
                                        role="option"
                                        tabIndex={-1}
                                        aria-selected={activeIndex === index}
                                        className={`flex min-h-16 shrink-0 cursor-pointer items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/10 ${activeIndex === index ? "bg-white/10" : ""}`}
                                        onPointerDown={(event) => {
                                            if (event.pointerType === "mouse")
                                                event.preventDefault();
                                        }}
                                        onClick={() => selectVenue(venue)}
                                    >
                                        <MapPin
                                            className="mt-0.5 size-4 shrink-0 text-white/50"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 break-words">
                                            <span className="block text-sm font-medium text-text">
                                                {venue.name}
                                            </span>
                                            <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                                                {formatAddress(venue.address)}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {expanded && results.length > venueSearchLimit && (
                            <p className="text-xs text-text-secondary">
                                Уточните город или улицу, чтобы сузить поиск.
                            </p>
                        )}
                        {searching && loadError && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11 justify-start px-0 text-text"
                                onClick={onRetry}
                            >
                                Повторить загрузку
                            </Button>
                        )}
                        {errors.venueAddress && (
                            <p className="text-sm text-error" role="alert">
                                Выберите площадку или укажите свой адрес.
                            </p>
                        )}
                    </div>
                    <GlassSeparator />
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-12 w-full justify-start gap-3 whitespace-normal px-0 text-text hover:scale-100 active:scale-100"
                        onClick={() => {
                            update("venueName", manualDraft.current.name);
                            update(
                                "venueAddress",
                                manualDraft.current.address || query.trim(),
                            );
                            setMode("manual");
                        }}
                    >
                        <Plus
                            className="size-5 shrink-0 text-white/60"
                            aria-hidden="true"
                        />
                        <span className="flex-1 text-left">
                            Указать свой адрес
                        </span>
                        <ArrowRight
                            className="size-4 shrink-0 text-white/50"
                            aria-hidden="true"
                        />
                    </Button>
                </>
            )}
            {mode === "selected" && (
                <>
                    <div className="grid gap-3">
                        <Label className="text-white/80">Площадка</Label>
                        <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5">
                                <MapPin
                                    className="size-5 text-white/70"
                                    aria-hidden="true"
                                />
                            </span>
                            <div className="min-w-0 flex-1 break-words">
                                <p className="font-medium text-text">
                                    {values.venueName || "Своё место"}
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                                    {formatAddress(values.venueAddress)}
                                </p>
                            </div>
                            <Check
                                className="mt-1 size-4 shrink-0 text-accent"
                                aria-hidden="true"
                            />
                        </div>
                    </div>
                    <GlassSeparator />
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-12 justify-start gap-2 px-0 text-text hover:scale-100 active:scale-100"
                        onClick={() => {
                            setQuery("");
                            setMode("search");
                            setOpen(false);
                        }}
                    >
                        Изменить площадку
                        <ArrowRight
                            className="ml-auto size-4 text-white/50"
                            aria-hidden="true"
                        />
                    </Button>
                </>
            )}
            {mode === "manual" && (
                <>
                    <div className="grid gap-2">
                        <Label
                            htmlFor={`${id}-address`}
                            className="text-white/80"
                        >
                            Адрес
                        </Label>
                        <GlassTextarea
                            id={`${id}-address`}
                            autoFocus
                            className="min-h-28"
                            name="venueAddress"
                            maxLength={300}
                            placeholder="Город, улица, дом"
                            value={values.venueAddress}
                            aria-invalid={Boolean(errors.venueAddress)}
                            aria-describedby={`${id}-address-hint${errors.venueAddress ? ` ${id}-address-error` : ""}`}
                            onChange={(event) =>
                                update("venueAddress", event.target.value)
                            }
                        />
                        <p
                            id={`${id}-address-hint`}
                            className="text-sm text-text-secondary"
                        >
                            Укажите полный адрес, чтобы участники нашли место.
                        </p>
                        {errors.venueAddress && (
                            <p
                                id={`${id}-address-error`}
                                className="text-sm text-error"
                                role="alert"
                            >
                                {errors.venueAddress}
                            </p>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor={`${id}-name`} className="text-white/80">
                            Название места{" "}
                            <span className="text-text-secondary">
                                (необязательно)
                            </span>
                        </Label>
                        <GlassInput
                            id={`${id}-name`}
                            name="venueName"
                            className="h-12"
                            maxLength={120}
                            placeholder="Как называется место?"
                            value={values.venueName}
                            aria-invalid={Boolean(errors.venueName)}
                            aria-describedby={
                                errors.venueName
                                    ? `${id}-name-error`
                                    : undefined
                            }
                            onChange={(event) =>
                                update("venueName", event.target.value)
                            }
                        />
                        {errors.venueName && (
                            <p
                                id={`${id}-name-error`}
                                className="text-sm text-error"
                                role="alert"
                            >
                                {errors.venueName}
                            </p>
                        )}
                    </div>
                    <GlassSeparator />
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-12 justify-start gap-2 whitespace-normal px-0 text-text hover:scale-100 active:scale-100"
                        onClick={() => {
                            manualDraft.current = {
                                name: values.venueName,
                                address: values.venueAddress,
                            };
                            setMode("search");
                        }}
                    >
                        <ArrowLeft
                            className="size-4 shrink-0 text-white/50"
                            aria-hidden="true"
                        />
                        Найти площадку в списке
                    </Button>
                </>
            )}
        </fieldset>
    );
}

import type { GameEvent } from "../../pages/EventList/types";

export function VenueMapLinks({
    location,
}: {
    location: GameEvent["location"];
}) {
    const query = encodeURIComponent(location.address?.trim() || location.name);
    const linkClass =
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ds-border bg-white/5 transition-colors hover:bg-white/10";

    return (
        <span className="inline-flex shrink-0 gap-2">
            <a
                href={`https://yandex.ru/maps/?text=${query}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Открыть место в Яндекс Картах"
                title="Яндекс Карты"
                className={linkClass}
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        fill="#FC3F1D"
                        d="M12 1a8 8 0 0 0-8 8c0 5.5 8 14 8 14s8-8.5 8-14a8 8 0 0 0-8-8Z"
                    />
                    <circle cx="12" cy="9" r="3" fill="white" />
                </svg>
            </a>
            <a
                href={`https://www.google.com/maps/search/?api=1&query=${query}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Открыть место в Google Maps"
                title="Google Maps"
                className={linkClass}
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        fill="#34A853"
                        d="M12 1a8 8 0 0 0-8 8c0 5.5 8 14 8 14s8-8.5 8-14a8 8 0 0 0-8-8Z"
                    />
                    <path
                        fill="#4285F4"
                        d="M12 1a8 8 0 0 0-8 8c0 2 .9 4.4 2.2 6.6L18 3.7A8 8 0 0 0 12 1Z"
                    />
                    <path
                        fill="#FBBC04"
                        d="M6.2 15.6c1 1.7 2.2 3.3 3.3 4.7L20 9a8 8 0 0 0-2-5.3Z"
                    />
                    <path
                        fill="#EA4335"
                        d="M4 9a8 8 0 0 1 2.3-5.7L12 9l-5.8 6.6C4.9 13.4 4 11 4 9Z"
                    />
                    <circle cx="12" cy="9" r="3" fill="white" />
                </svg>
            </a>
        </span>
    );
}

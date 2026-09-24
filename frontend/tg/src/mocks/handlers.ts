import { delay, http, HttpResponse } from "msw";
import type { components } from "@picklehub/api";

type GameDetail = components["schemas"]["GameDetail"];
type Game = components["schemas"]["Game"];
const organizerId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";
const now = Date.now();
const iso = (offsetHours: number) =>
    new Date(now + offsetHours * 3_600_000).toISOString();
const participant = (
    userId: string,
    displayName: string,
    isOrganizer = false,
) => ({
    userId,
    displayName,
    joinedAt: iso(-1),
    isOrganizer,
});

const seeds: GameDetail[] = [
    {
        id: "10000000-0000-4000-8000-000000000001",
        organizerId,
        organizerParticipates: true,
        venueName: "Пиклбол в Сокольниках",
        venueAddress: "Москва, парк Сокольники",
        startsAt: iso(30),
        durationMinutes: 120,
        participantLimit: 8,
        participantCount: 2,
        status: "SCHEDULED",
        desiredLevel: "Любой уровень",
        description: "Берите ракетки",
        createdAt: iso(-24),
        updatedAt: iso(-2),
        participants: [
            participant(organizerId, "Алексей", true),
            participant(otherId, "Мария"),
        ],
    },
    {
        id: "10000000-0000-4000-8000-000000000002",
        organizerId,
        organizerParticipates: false,
        venueName: "Центр на Таганке",
        venueAddress: "Москва, ул. Земляной Вал",
        startsAt: iso(48),
        durationMinutes: 90,
        participantLimit: 4,
        participantCount: 4,
        status: "FULL",
        createdAt: iso(-20),
        updatedAt: iso(-1),
        participants: [
            participant(playerId, "Денис"),
            participant(otherId, "Мария"),
            participant("00000000-0000-4000-8000-000000000004", "Олег"),
            participant("00000000-0000-4000-8000-000000000005", "Нина"),
        ],
    },
    {
        id: "10000000-0000-4000-8000-000000000003",
        organizerId,
        organizerParticipates: true,
        venueName: "Игра отменена",
        venueAddress: "Москва",
        startsAt: iso(72),
        durationMinutes: 60,
        participantLimit: 4,
        participantCount: 1,
        status: "CANCELLED",
        createdAt: iso(-18),
        updatedAt: iso(-1),
        participants: [participant(organizerId, "Алексей", true)],
    },
];

let games = structuredClone(seeds);
const route = (path: string) => `*${path}`;

function error(status: number, code: string, message: string) {
    return HttpResponse.json(
        { code, message, requestId: crypto.randomUUID() },
        { status },
    );
}

function mode() {
    return (
        new URLSearchParams(window.location.search).get("mockScenario") ??
        "normal"
    );
}

function currentUser(request: Request) {
    const token = request.headers
        .get("Authorization")
        ?.replace("Bearer dev:", "");
    return token === "player-2"
        ? playerId
        : token === "player-1"
          ? organizerId
          : undefined;
}

function requireUser(request: Request) {
    return currentUser(request) ?? "00000000-0000-4000-8000-000000000099";
}

function listGame(game: GameDetail): Game {
    return Object.fromEntries(
        Object.entries(game).filter(([key]) => key !== "participants"),
    ) as Game;
}

function updateCounts(game: GameDetail) {
    game.participantCount = game.participants.length;
    if (game.status !== "CANCELLED") {
        game.status =
            game.participantCount >= game.participantLimit
                ? "FULL"
                : "SCHEDULED";
    }
    game.updatedAt = new Date().toISOString();
}

export const handlers = [
    http.get(route("/games"), async ({ request }) => {
        const scenario = mode();
        if (scenario === "error")
            return error(401, "UNAUTHENTICATED", "Dev session is missing");
        if (scenario === "delay") await delay(1800);
        if (!currentUser(request))
            return error(401, "UNAUTHENTICATED", "Use the local dev identity");
        const visible =
            scenario === "empty"
                ? []
                : games.filter((game) => game.status !== "CANCELLED");
        return HttpResponse.json({ items: visible.map(listGame) });
    }),
    http.get(route("/games/:gameId"), async ({ params, request }) => {
        if (mode() === "error")
            return error(503, "GAME_CONFLICT", "Temporary mock API error");
        if (mode() === "delay") await delay(1800);
        if (!currentUser(request))
            return error(401, "UNAUTHENTICATED", "Use the local dev identity");
        const game = games.find((item) => item.id === params.gameId);
        return game
            ? HttpResponse.json(game)
            : error(404, "GAME_NOT_FOUND", "Игра не найдена");
    }),
    http.put(route("/games/:gameId/participation"), ({ params, request }) => {
        if (!currentUser(request))
            return error(401, "UNAUTHENTICATED", "Use the local dev identity");
        const game = games.find((item) => item.id === params.gameId);
        if (!game) return error(404, "GAME_NOT_FOUND", "Игра не найдена");
        const userId = requireUser(request);
        if (game.status === "CANCELLED")
            return error(410, "GAME_CANCELLED", "Игра отменена");
        if (!game.participants.some((item) => item.userId === userId)) {
            if (game.participantCount >= game.participantLimit)
                return error(409, "GAME_FULL", "Нет свободных мест");
            game.participants.push(
                participant(userId, userId === playerId ? "Денис" : "Алексей"),
            );
            if (userId === game.organizerId) game.organizerParticipates = true;
            updateCounts(game);
        }
        return HttpResponse.json(game);
    }),
    http.delete(
        route("/games/:gameId/participation"),
        ({ params, request }) => {
            if (!currentUser(request))
                return error(
                    401,
                    "UNAUTHENTICATED",
                    "Use the local dev identity",
                );
            const game = games.find((item) => item.id === params.gameId);
            if (!game) return error(404, "GAME_NOT_FOUND", "Игра не найдена");
            if (game.status === "CANCELLED")
                return error(410, "GAME_CANCELLED", "Игра отменена");
            const userId = requireUser(request);
            game.participants = game.participants.filter(
                (item) => item.userId !== userId,
            );
            if (userId === game.organizerId) game.organizerParticipates = false;
            updateCounts(game);
            return HttpResponse.json(game);
        },
    ),
];

export function resetMockGames() {
    games = structuredClone(seeds);
}

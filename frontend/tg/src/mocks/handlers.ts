import { delay, http, HttpResponse } from "msw";
import type { components } from "@picklehub/api";

type GameDetail = components["schemas"]["GameDetail"];
type Game = components["schemas"]["Game"];
const organizerId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";
const visitorId = "00000000-0000-4000-8000-000000000099";
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
const displayName = (userId: string) =>
    userId === organizerId
        ? "Алексей"
        : userId === playerId
          ? "Денис"
          : userId === otherId
            ? "Мария"
            : userId === visitorId
              ? "Гость"
              : "Игрок";

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
    {
        id: "10000000-0000-4000-8000-000000000004",
        organizerId,
        organizerParticipates: true,
        venueName: "Игра уже началась",
        venueAddress: "Москва",
        startsAt: iso(-1),
        durationMinutes: 60,
        participantLimit: 4,
        participantCount: 1,
        status: "SCHEDULED",
        createdAt: iso(-24),
        updatedAt: iso(-1),
        participants: [participant(organizerId, "Алексей", true)],
    },
    {
        id: "10000000-0000-4000-8000-000000000005",
        organizerId,
        organizerParticipates: true,
        venueName: "Последнее место",
        venueAddress: "Москва",
        startsAt: iso(60),
        durationMinutes: 90,
        participantLimit: 2,
        participantCount: 1,
        status: "SCHEDULED",
        createdAt: iso(-24),
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
          : token === "player-3"
            ? otherId
            : token === "player-4"
              ? visitorId
              : undefined;
}

function requireUser(request: Request) {
    return currentUser(request) ?? visitorId;
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
    http.post(route("/games"), async ({ request }) => {
        if (mode() === "error")
            return error(503, "GAME_CONFLICT", "Temporary mock API error");
        if (!currentUser(request))
            return error(401, "UNAUTHENTICATED", "Use the local dev identity");
        const input =
            (await request.json()) as components["schemas"]["CreateGameRequest"];
        const venueName = input.venueName.trim();
        const venueAddress = input.venueAddress.trim();
        const desiredLevel = input.desiredLevel?.trim();
        const description = input.description?.trim();
        const startsAt = Date.parse(input.startsAt);
        if (
            !venueName ||
            venueName.length > 120 ||
            !venueAddress ||
            venueAddress.length > 300 ||
            !Number.isFinite(startsAt) ||
            startsAt <= Date.now() ||
            input.durationMinutes < 30 ||
            input.durationMinutes > 480 ||
            input.participantLimit < 2 ||
            input.participantLimit > 32 ||
            (desiredLevel !== undefined &&
                (desiredLevel.length < 1 || desiredLevel.length > 80)) ||
            (description !== undefined && description.length > 2000)
        )
            return error(400, "VALIDATION_ERROR", "Проверьте данные игры");

        const userId = requireUser(request);
        const participates = input.organizerParticipates ?? true;
        const created: GameDetail = {
            id: crypto.randomUUID(),
            organizerId: userId,
            organizerParticipates: participates,
            venueName,
            venueAddress,
            startsAt: new Date(startsAt).toISOString(),
            durationMinutes: input.durationMinutes,
            participantLimit: input.participantLimit,
            participantCount: participates ? 1 : 0,
            status: "SCHEDULED",
            ...(desiredLevel ? { desiredLevel } : {}),
            ...(description ? { description } : {}),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            participants: participates
                ? [participant(userId, displayName(userId), true)]
                : [],
        };
        games.unshift(created);
        return HttpResponse.json(created, { status: 201 });
    }),
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
        if (mode() === "join-error")
            return error(503, "GAME_CONFLICT", "Временная ошибка API");
        if (!currentUser(request))
            return error(401, "UNAUTHENTICATED", "Use the local dev identity");
        const game = games.find((item) => item.id === params.gameId);
        if (!game) return error(404, "GAME_NOT_FOUND", "Игра не найдена");
        const userId = requireUser(request);
        if (game.status === "CANCELLED")
            return error(410, "GAME_CANCELLED", "Игра отменена");
        if (Date.parse(game.startsAt) <= Date.now())
            return error(409, "GAME_CONFLICT", "Игра уже началась");
        if (
            mode() === "join-conflict" &&
            game.id === "10000000-0000-4000-8000-000000000005"
        ) {
            game.participants.push(participant(otherId, "Мария"));
            updateCounts(game);
            return error(409, "GAME_FULL", "Последнее место уже занято");
        }
        if (!game.participants.some((item) => item.userId === userId)) {
            if (game.participantCount >= game.participantLimit)
                return error(409, "GAME_FULL", "Нет свободных мест");
            game.participants.push(participant(userId, displayName(userId)));
            if (userId === game.organizerId) game.organizerParticipates = true;
            updateCounts(game);
        }
        return HttpResponse.json(game);
    }),
    http.delete(
        route("/games/:gameId/participation"),
        ({ params, request }) => {
            if (mode() === "leave-error")
                return error(503, "GAME_CONFLICT", "Временная ошибка API");
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
            if (Date.parse(game.startsAt) <= Date.now())
                return error(409, "GAME_CONFLICT", "Игра уже началась");
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

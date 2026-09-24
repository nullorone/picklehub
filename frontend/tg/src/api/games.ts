import type { components } from "@picklehub/api";
import { apiClient } from "@/api/client.ts";

export type Game = components["schemas"]["Game"];
export type GameDetail = components["schemas"]["GameDetail"];
export type GamePage = components["schemas"]["GamePage"];
export type CreateGameRequest = components["schemas"]["CreateGameRequest"];

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

function unwrap<T>(result: {
    data?: T;
    error?: components["schemas"]["ErrorResponse"];
    response: Response;
}): T {
    if (result.data !== undefined) return result.data;
    const error = result.error;
    throw new ApiError(
        result.response.status,
        error?.code ?? "UNKNOWN",
        error?.message ?? "Ошибка API",
    );
}

export async function getGames(cursor?: string, limit = 20): Promise<GamePage> {
    const result = await apiClient.GET("/games", {
        params: { query: { cursor, limit } },
    });
    return unwrap(result);
}

export async function getGame(gameId: string): Promise<GameDetail> {
    const result = await apiClient.GET("/games/{gameId}", {
        params: { path: { gameId } },
    });
    return unwrap(result);
}

export async function createGame(
    input: CreateGameRequest,
): Promise<GameDetail> {
    const result = await apiClient.POST("/games", {
        params: { header: { "Idempotency-Key": crypto.randomUUID() } },
        body: input,
    });
    return unwrap(result);
}

export async function joinGame(gameId: string): Promise<GameDetail> {
    const result = await apiClient.PUT("/games/{gameId}/participation", {
        params: {
            path: { gameId },
            header: { "Idempotency-Key": crypto.randomUUID() },
        },
    });
    return unwrap(result);
}

export async function leaveGame(gameId: string): Promise<GameDetail> {
    const result = await apiClient.DELETE("/games/{gameId}/participation", {
        params: {
            path: { gameId },
            header: { "Idempotency-Key": crypto.randomUUID() },
        },
    });
    return unwrap(result);
}

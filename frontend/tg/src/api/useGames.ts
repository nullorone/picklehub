import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from "@tanstack/react-query";
import {
    getGame,
    getGames,
    createGame,
    joinGame,
    leaveGame,
    updateGame,
    removeParticipant,
    cancelGame,
    type GameDetail,
    type CreateGameRequest,
    type UpdateGameRequest,
} from "@/api/games.ts";
import { gameKeys } from "@/api/queryKeys.ts";

export function useGames(cursor?: string, limit = 20) {
    return useQuery({
        queryKey: gameKeys.list(cursor, limit),
        queryFn: () => getGames(cursor, limit),
        refetchInterval: 30_000,
    });
}

export function useGame(gameId: string) {
    return useQuery({
        queryKey: gameKeys.detail(gameId),
        queryFn: () => getGame(gameId),
        enabled: Boolean(gameId),
        refetchInterval: 15_000,
    });
}

function useParticipationMutation(
    mutationFn: (gameId: string) => Promise<GameDetail>,
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onMutate: async (gameId) => {
            await queryClient.cancelQueries({
                queryKey: gameKeys.detail(gameId),
            });
            const previous = queryClient.getQueryData<GameDetail>(
                gameKeys.detail(gameId),
            );
            return { previous, gameId };
        },
        onError: (_error, _gameId, context) => {
            if (context?.previous)
                queryClient.setQueryData(
                    gameKeys.detail(context.gameId),
                    context.previous,
                );
        },
        onSuccess: (game) =>
            queryClient.setQueryData(gameKeys.detail(game.id), game),
        onSettled: async (_data, _error, gameId) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: gameKeys.lists() }),
                queryClient.invalidateQueries({
                    queryKey: gameKeys.detail(gameId),
                }),
            ]);
        },
    });
}

export const useJoinGame = () => useParticipationMutation(joinGame);
export const useLeaveGame = () => useParticipationMutation(leaveGame);

function refreshGame(queryClient: QueryClient, game: GameDetail) {
    queryClient.setQueryData(gameKeys.detail(game.id), game);
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: gameKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: gameKeys.detail(game.id) }),
    ]);
}

export function useUpdateGame() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            gameId,
            input,
        }: {
            gameId: string;
            input: UpdateGameRequest;
        }) => updateGame(gameId, input),
        onSuccess: async (game) => {
            await refreshGame(queryClient, game);
        },
        onError: async (_error, { gameId }) => {
            await queryClient.invalidateQueries({
                queryKey: gameKeys.detail(gameId),
            });
        },
    });
}

export function useRemoveParticipant() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ gameId, userId }: { gameId: string; userId: string }) =>
            removeParticipant(gameId, userId),
        onSuccess: (game) => refreshGame(queryClient, game),
        onError: async (_error, { gameId }) => {
            await queryClient.invalidateQueries({
                queryKey: gameKeys.detail(gameId),
            });
        },
    });
}

export function useCancelGame() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: cancelGame,
        onSuccess: (game) => refreshGame(queryClient, game),
        onError: async (_error, gameId) => {
            await queryClient.invalidateQueries({
                queryKey: gameKeys.detail(gameId),
            });
        },
    });
}

export function useCreateGame() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateGameRequest) => createGame(input),
        onSuccess: async (game) => {
            queryClient.setQueryData(gameKeys.detail(game.id), game);
            await queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
        },
    });
}

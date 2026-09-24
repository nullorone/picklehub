import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    getGame,
    getGames,
    joinGame,
    leaveGame,
    type GameDetail,
} from "@/api/games.ts";
import { gameKeys } from "@/api/queryKeys.ts";

export function useGames(cursor?: string, limit = 20) {
    return useQuery({
        queryKey: gameKeys.list(cursor, limit),
        queryFn: () => getGames(cursor, limit),
    });
}

export function useGame(gameId: string) {
    return useQuery({
        queryKey: gameKeys.detail(gameId),
        queryFn: () => getGame(gameId),
        enabled: Boolean(gameId),
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

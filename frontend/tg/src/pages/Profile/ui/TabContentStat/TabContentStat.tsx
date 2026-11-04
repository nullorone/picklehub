import { GlassTabsContent, Space, StatsGrid } from "@picklehub/ui-web";
import { UserStats } from "../../types.ts";

export interface TabContentStatProps {
    statistic: UserStats;
}

export function TabContentStat({ statistic }: TabContentStatProps) {
    return (
        <GlassTabsContent value="stat">
            <div className="space-y-4">
                {/* Quick items */}
                <StatsGrid
                    className="grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-2 [&>div]:min-w-0 [&>div>div]:min-w-0"
                    stats={[
                        {
                            title: "Выигранные игры",
                            value: statistic.gamesWon,
                            glowColor: "green",
                        },
                        {
                            title: "Процент побед",
                            value: `${statistic.winRate}%`,
                            glowColor: "blue",
                            change: {
                                value: 2,
                                type: "neutral",
                            },
                        },
                        {
                            title: "Текущая серия",
                            value: statistic.currentStreak,
                            glowColor: "amber",
                        },
                        {
                            title: "Средний счет",
                            value: statistic.averageScore,
                            glowColor: "purple",
                            change: {
                                value: 2,
                                type: "increase",
                            },
                        },
                    ]}
                />

                {/* Detailed items */}
                <Space>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Детальная статистика
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Сыграно игр
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.gamesPlayed}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Лучшая серия побед
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.bestStreak} игр
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Всего набранных очков
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.totalPoints}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Участвовал в трунирах
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.tournamentsEntered}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Выигранные турниры
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.tournamentsWon}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Состаю в клубах
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {statistic.clubsJoined}
                            </span>
                        </div>
                    </div>
                </Space>
            </div>
        </GlassTabsContent>
    );
}

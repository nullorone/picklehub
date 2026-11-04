import { GlassTabsContent } from "@picklehub/ui-web";
import { RecentMatch } from "../../types.ts";

export interface TabContentHistoryState {
    items: RecentMatch[];
}

export function TabContentHistory({ items }: TabContentHistoryState) {
    return (
        <GlassTabsContent value="history">
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                        Последние матчи
                    </h3>
                    <button className="text-blue-600 dark:text-blue-400 text-sm">
                        Смотреть все
                    </button>
                </div>

                <div className="space-y-3">
                    {items.map((match) => (
                        <div
                            key={match.id}
                            className={`bg-white dark:bg-gray-800 border-l-4 p-4 rounded-lg ${
                                match.result === "win"
                                    ? "border-green-500"
                                    : "border-red-500"
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-white text-sm">
                                        vs {match.opponent}
                                    </div>
                                    {match.tournament && (
                                        <div className="text-xs text-blue-600 dark:text-blue-400">
                                            {match.tournament}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div
                                        className={`text-sm font-medium ${
                                            match.result === "win"
                                                ? "text-green-600"
                                                : "text-red-600"
                                        }`}
                                    >
                                        {match.result === "win" ? "W" : "L"}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {match.date}
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Final: {match.score}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </GlassTabsContent>
    );
}

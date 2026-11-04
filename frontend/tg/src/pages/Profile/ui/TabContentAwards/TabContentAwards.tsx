import { GlassTabsContent } from "@picklehub/ui-web";
import { Star } from "lucide-react";
import { Achievement } from "../../types.ts";

export interface TabContentAwardsProps {
    items: Achievement[];
}

export function TabContentAwards({ items }: TabContentAwardsProps) {
    return (
        <GlassTabsContent value="awards">
            <div className="space-y-4">
                <div className="text-center">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        Награды
                    </h3>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {items.filter((a) => a.earned).length} of {items.length}{" "}
                        earned
                    </div>
                </div>

                <div className="space-y-3">
                    {items.map((achievement) => (
                        <div
                            key={achievement.id}
                            className={`bg-white dark:bg-gray-800 p-4 rounded-lg border-2 ${
                                achievement.earned
                                    ? "border-yellow-200 dark:border-yellow-800"
                                    : "border-gray-200 dark:border-gray-700 opacity-50"
                            }`}
                        >
                            <div className="flex items-center space-x-3">
                                <div className="text-2xl">
                                    {achievement.icon}
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 dark:text-white">
                                        {achievement.title}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        {achievement.description}
                                    </div>
                                    {achievement.earned &&
                                        achievement.earnedDate && (
                                            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                                Earned {achievement.earnedDate}
                                            </div>
                                        )}
                                </div>
                                {achievement.earned && (
                                    <Star
                                        size={16}
                                        className="text-yellow-500 fill-current"
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </GlassTabsContent>
    );
}

import { GlassTabsContent } from "@picklehub/ui-web";
import { UserProfile } from "../../types.ts";
import { useState } from "react";

export interface TabContentSettingsProps {
    profile: UserProfile;
}

export function TabContentSettings({ profile }: TabContentSettingsProps) {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <GlassTabsContent value="settings">
            <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Основная информация
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={profile.name}
                                disabled={!isEditing}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={profile.email}
                                disabled={!isEditing}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Hometown
                            </label>
                            <input
                                type="text"
                                value={profile.hometown}
                                disabled={!isEditing}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Bio
                            </label>
                            <textarea
                                value={profile.bio}
                                disabled={!isEditing}
                                rows={3}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Preferences
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Email Notifications
                            </span>
                            <button className="bg-blue-600 text-white px-3 py-1 text-xs rounded-full">
                                ON
                            </button>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Tournament Alerts
                            </span>
                            <button className="bg-blue-600 text-white px-3 py-1 text-xs rounded-full">
                                ON
                            </button>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Public Profile
                            </span>
                            <button className="bg-gray-400 text-white px-3 py-1 text-xs rounded-full">
                                OFF
                            </button>
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Save Changes
                        </button>
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex-1 bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </GlassTabsContent>
    );
}

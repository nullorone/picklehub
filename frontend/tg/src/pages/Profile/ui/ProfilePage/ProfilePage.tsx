import { GlassProfileCard } from "@picklehub/ui-web";
import {
    achievements,
    recentMatches,
    userProfile,
    userStats,
} from "../../mock.ts";
import duprImg from "../../../../assets/dupr.jpg";
import { Tabs } from "../Tabs/Tabs.tsx";

export function ProfilePage() {
    return (
        <div className="flex flex-col mx-auto gap-6 mt-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Профиль
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Ваш pickleball журнал
                    </p>
                </div>
                {/*<button*/}
                {/*    onClick={() => setIsEditing(!isEditing)}*/}
                {/*    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"*/}
                {/*>*/}
                {/*    <Edit3 size={20} />*/}
                {/*</button>*/}
            </div>

            {/* Profile Header */}
            <GlassProfileCard
                name={userProfile.name}
                avatarSrc={userProfile.profileImage ?? undefined}
                dupr={userStats.dupr}
                duprLogoSrc={duprImg}
                ranking={userStats.ranking}
            />
            <Tabs
                statistic={userStats}
                histories={recentMatches}
                awards={achievements}
                profile={userProfile}
            />
        </div>
    );
}

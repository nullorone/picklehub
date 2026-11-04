import { GlassTabs, GlassTabsList, GlassTabsTrigger } from "@picklehub/ui-web";
import { Award, History, Settings, User } from "lucide-react";
import {
    TabContentStat,
    TabContentStatProps,
} from "../TabContentStat/TabContentStat.tsx";
import {
    TabContentHistory,
    TabContentHistoryState,
} from "../TabContentHistory/TabContentHistory.tsx";
import {
    TabContentAwards,
    TabContentAwardsProps,
} from "../TabContentAwards/TabContentAwards.tsx";
import { TabContentSettings } from "../TabContentSettings/TabContentSettings.tsx";
import { UserProfile } from "../../types.ts";

export interface TabsProps {
    profile: UserProfile;
    statistic: TabContentStatProps["statistic"];
    histories: TabContentHistoryState["items"];
    awards: TabContentAwardsProps["items"];
}

export function Tabs({ statistic, histories, awards, profile }: TabsProps) {
    return (
        <GlassTabs defaultValue="stat" className="w-full max-w-lg">
            <GlassTabsList className="w-full">
                <GlassTabsTrigger value="stat" className="group flex-1">
                    <User className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        Статистика
                    </span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="history" className="group flex-1">
                    <History className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        История
                    </span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="awards" className="group flex-1">
                    <Award className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        Награды
                    </span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="settings" className="group flex-1">
                    <Settings className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        Настройки
                    </span>
                </GlassTabsTrigger>
            </GlassTabsList>
            <TabContentStat statistic={statistic} />
            <TabContentHistory items={histories} />
            <TabContentAwards items={awards} />
            <TabContentSettings profile={profile} />
        </GlassTabs>
    );
}

import { GlassTabs, GlassTabsList, GlassTabsTrigger } from "@picklehub/ui-web";
import { CalendarCheck, CalendarDays } from "lucide-react";
import {
    TabContentAll,
    TabContentAllProps,
} from "../TabContentAll/TabContentAll.tsx";
import {
    TabContentMySelf,
    TabContentMySelfProps,
} from "../TabContentMySelf/TabContentMySelf.tsx";

export interface TabsProps {
    games: TabContentAllProps["games"];
    mySelfItems: TabContentMySelfProps["games"];
}

export function Tabs({ games, mySelfItems }: TabsProps) {
    return (
        <GlassTabs defaultValue="all" className="w-full max-w-lg">
            <GlassTabsList className="w-full">
                <GlassTabsTrigger value="all" className="group flex-1">
                    <CalendarDays className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        Все события
                    </span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="mySelf" className="group flex-1">
                    <CalendarCheck className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">
                        Мои события
                    </span>
                </GlassTabsTrigger>
            </GlassTabsList>
            <TabContentAll games={games} />
            <TabContentMySelf games={mySelfItems} />
        </GlassTabs>
    );
}

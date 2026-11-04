import { useTournamentList } from "../../hooks/useTournamentList.ts";
import { Header } from "../Header/Header.tsx";
import { Wrapper } from "./EventListPage.styles.tsx";
import { Tabs } from "../Tabs/Tabs.tsx";

export function EventListPage() {
    const games = useTournamentList();

    return (
        <Wrapper>
            <Header />
            <Tabs
                games={games}
                mySelfItems={{
                    isPending: false,
                    isError: false,
                    isSuccess: true,
                    data: {
                        items: [],
                    },
                }}
            />
        </Wrapper>
    );
}

import { Header as DesignHeader } from "@picklehub/ui-web";
import { useNavigate } from "react-router-dom";
import { useSessionUser } from "@/api/session.ts";

export function Header() {
    const user = useSessionUser();
    const navigate = useNavigate();

    return (
        <DesignHeader
            displayName={user?.displayName ?? ""}
            onProfileClick={() => navigate("/profile")}
            style={{
                paddingTop:
                    "max(env(safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px), var(--tg-content-safe-area-inset-top, 0px))",
            }}
        />
    );
}

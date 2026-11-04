import { Header as DesignHeader } from "@picklehub/ui-web";

export function Header() {
    return (
        <DesignHeader
            style={{
                position: "fixed",
                top: "12px",
                left: "12px",
                right: "12px",
                width: "calc(100dvw - 24px)",
                zIndex: 1000,
            }}
        />
    );
}

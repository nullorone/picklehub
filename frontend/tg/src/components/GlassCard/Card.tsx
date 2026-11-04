import type { HTMLAttributes } from "react";
import { GlassCard as GlassCardUI } from "@picklehub/ui-web";

export function GlassCard({
    className = "",
    children,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <GlassCardUI glowEffect={false} className="tg-card min-w-0" {...props}>
            <div className={`p-5 ${className}`}>{children}</div>
        </GlassCardUI>
    );
}

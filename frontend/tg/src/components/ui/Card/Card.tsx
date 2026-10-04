import type { HTMLAttributes } from "react";
import { GlassCard } from "@picklehub/ui-web";

export function Card({
    className = "",
    children,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <GlassCard glowEffect={false} className="tg-card min-w-0" {...props}>
            <div className={`p-5 ${className}`}>{children}</div>
        </GlassCard>
    );
}

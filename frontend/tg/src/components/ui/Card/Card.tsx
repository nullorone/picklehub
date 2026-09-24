import type { HTMLAttributes } from "react";

export function Card({
    className = "",
    ...props
}: HTMLAttributes<HTMLElement>) {
    return (
        <section
            className={`min-w-0 rounded-card border border-border bg-surface p-5 shadow-sm ${className}`}
            {...props}
        />
    );
}

import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger";
};

const variants = {
    primary: "bg-accent text-[var(--ph-button-text)] hover:bg-accent-hover",
    secondary: "border border-border bg-surface text-text hover:bg-background",
    danger: "bg-error text-white",
};

export function Button({
    className = "",
    variant = "primary",
    ...props
}: ButtonProps) {
    return (
        <button
            className={`inline-flex min-h-12 w-full items-center justify-center rounded-control px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
            {...props}
        />
    );
}

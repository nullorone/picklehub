import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
};

export function TextField({
    className = "",
    error,
    id,
    label,
    ...props
}: TextFieldProps) {
    const inputId = id ?? props.name;
    const errorId = error && inputId ? `${inputId}-error` : undefined;

    return (
        <label
            className="grid min-w-0 gap-2 text-sm font-medium text-text"
            htmlFor={inputId}
        >
            {label}
            <input
                className={`min-h-12 w-full min-w-0 rounded-control border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-text-secondary ${className}`}
                id={inputId}
                aria-invalid={Boolean(error)}
                aria-describedby={errorId}
                {...props}
            />
            {error && (
                <span
                    className="text-sm font-normal text-error"
                    id={errorId}
                    role="alert"
                >
                    {error}
                </span>
            )}
        </label>
    );
}

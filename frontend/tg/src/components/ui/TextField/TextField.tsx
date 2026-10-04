import { GlassInput } from "@picklehub/ui-web";
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
            <GlassInput
                glowOnFocus={false}
                className={`tg-input min-h-12 h-auto w-full min-w-0 text-base ${className}`}
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

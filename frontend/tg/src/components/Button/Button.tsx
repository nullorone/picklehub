import {
    Button as DSButton,
    type ButtonProps as DSButtonProps,
} from "@picklehub/ui-web";

type ButtonProps = Omit<DSButtonProps, "variant"> & {
    variant?: "primary" | "secondary" | "danger";
};

export function Button({
    className = "",
    variant = "primary",
    ...props
}: ButtonProps) {
    return (
        <DSButton
            size="lg"
            variant={
                variant === "secondary"
                    ? "default"
                    : variant === "danger"
                      ? "destructive"
                      : "primary"
            }
            className={`tg-button min-h-12 h-auto w-full whitespace-normal py-3 hover:scale-100 active:scale-100 ${className}`}
            {...props}
        />
    );
}

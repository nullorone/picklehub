import type { ChoiceOption } from "../../types";
import { GlassWidgetBase } from "@picklehub/ui-web";

type ChoiceCardsProps<T extends string> = {
    name: string;
    hideDescription?: boolean;
    legend: string;
    value: T;
    options: ChoiceOption<T>[];
    disabled: boolean;
    hidden: boolean;
    onChange: (value: T) => void;
};

export function ChoiceCards<T extends string>({
    name,
    legend,
    value,
    options,
    disabled,
    hidden,
    onChange,
    hideDescription = false,
}: ChoiceCardsProps<T>) {
    return (
        <fieldset
            hidden={hidden}
            disabled={disabled}
            className="mx-auto flex w-full max-w-[412px] flex-wrap justify-center gap-3"
        >
            <legend className="sr-only">{legend}</legend>
            {options.map((option) => (
                <label
                    key={option.value}
                    className="relative aspect-square w-[calc((100%-12px)/2)] max-w-[200px] min-w-0 cursor-pointer rounded-2xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                >
                    <input
                        className="sr-only"
                        type="radio"
                        name={name}
                        aria-label={option.label}
                        value={option.value}
                        checked={value === option.value}
                        onChange={() => onChange(option.value)}
                    />
                    <GlassWidgetBase
                        size="s"
                        glowColor={option.color}
                        role="presentation"
                        className={`border-0 ${
                            value === option.value
                                ? "shadow-[0_8px_32px_rgba(0,0,0,0.37)]"
                                : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.37)]"
                        }`}
                    >
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                            <option.icon
                                size={28}
                                className="shrink-0 text-white"
                                aria-hidden="true"
                            />
                            <span className="text-sm font-semibold text-white sm:text-lg">
                                {option.label}
                            </span>
                            {!hideDescription && (
                                <span className="text-xs leading-tight text-gray-400 sm:text-sm">
                                    {option.description}
                                </span>
                            )}
                        </div>
                    </GlassWidgetBase>
                    {value === option.value && (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-r from-cyan-500/80 via-blue-500/80 to-purple-500/80 p-[3px]"
                            style={{
                                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                maskComposite: "exclude",
                            }}
                        />
                    )}
                </label>
            ))}
        </fieldset>
    );
}

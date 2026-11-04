import { ReactNode } from "react";

export function Wrapper({ children }: { children: ReactNode }) {
    return (
        <div className="mx-auto grid w-full max-w-lg gap-5 px-4sm:px-6 my-3">
            {children}
        </div>
    );
}

export function CardList({ children }: { children: ReactNode }) {
    return <ul className="flex flex-col gap-3">{children}</ul>;
}

export function CardWrapper({ children }: { children: ReactNode }) {
    return <li>{children}</li>;
}

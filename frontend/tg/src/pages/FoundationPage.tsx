import { useState } from "react";

import { Button } from "@/components/ui/Button/Button.tsx";
import { Card } from "@/components/ui/Card/Card.tsx";
import { TextField } from "@/components/ui/TextField/TextField.tsx";

export function FoundationPage() {
    const [name, setName] = useState("");

    return (
        <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center gap-6 px-4 py-8 sm:px-6">
            <header className="flex min-w-0 items-center gap-4">
                <div
                    aria-hidden="true"
                    className="grid size-16 shrink-0 place-items-center rounded-[22px] bg-accent text-2xl font-bold text-white"
                >
                    P
                </div>
                <div className="min-w-0">
                    <p className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-accent">
                        PickleHub
                    </p>
                    <h1 className="break-words text-2xl font-bold leading-tight sm:text-[28px]">
                        Игра начинается здесь
                    </h1>
                </div>
            </header>

            <Card className="grid gap-5">
                <div>
                    <h2 className="text-lg font-semibold">
                        Основа приложения готова
                    </h2>
                    <p className="mt-2 break-words text-sm leading-relaxed text-text-secondary">
                        Здесь появятся ваши игры и встречи с игроками.
                    </p>
                </div>
                <TextField
                    autoComplete="name"
                    label="Как к вам обращаться?"
                    name="displayName"
                    onChange={(event) => setName(event.currentTarget.value)}
                    placeholder="Ваше имя"
                    value={name}
                />
                <Button onClick={() => setName("")}>Продолжить</Button>
                <Button onClick={() => setName("")} variant="secondary">
                    Позже
                </Button>
            </Card>
        </main>
    );
}

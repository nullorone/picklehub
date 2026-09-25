import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button.tsx";
import { Page } from "@/components/Page.tsx";
import { TextField } from "@/components/ui/TextField/TextField.tsx";
import { ApiError } from "@/api/games.ts";
import { useCreateGame, useGame, useUpdateGame } from "@/api/useGames.ts";
import { moscowDateTimeInput, moscowDateTimeToUtc } from "@/pages/gameTime.ts";
import { mockUser, mockUserIds } from "@/api/client.ts";
import { Card } from "@/components/ui/Card/Card.tsx";

type FormValues = {
    venueName: string;
    venueAddress: string;
    startsAt: string;
    durationMinutes: string;
    participantLimit: string;
    organizerParticipates: boolean;
    desiredLevel: string;
    description: string;
};

const initialValues: FormValues = {
    venueName: "",
    venueAddress: "",
    startsAt: moscowDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    durationMinutes: "120",
    participantLimit: "8",
    organizerParticipates: true,
    desiredLevel: "",
    description: "",
};

export function GameCreatePage() {
    const { matchId } = useParams();
    const gameQuery = useGame(matchId ?? "");
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const navigate = useNavigate();
    const create = useCreateGame();
    const updateGame = useUpdateGame();
    const pending = create.isPending || updateGame.isPending;
    const currentUserId =
        import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "false"
            ? mockUserIds[mockUser]
            : undefined;
    const canEdit =
        !matchId ||
        !gameQuery.data ||
        gameQuery.data.organizerId === currentUserId;

    useEffect(() => {
        const game = gameQuery.data;
        if (!game) return;
        setValues({
            venueName: game.venueName,
            venueAddress: game.venueAddress,
            startsAt: moscowDateTimeInput(new Date(game.startsAt)),
            durationMinutes: String(game.durationMinutes),
            participantLimit: String(game.participantLimit),
            organizerParticipates: game.organizerParticipates,
            desiredLevel: game.desiredLevel ?? "",
            description: game.description ?? "",
        });
    }, [gameQuery.data]);

    function validate() {
        const next: Record<string, string> = {};
        const startsAt = moscowDateTimeToUtc(values.startsAt);
        const duration = Number(values.durationMinutes);
        const limit = Number(values.participantLimit);
        if (!values.venueName.trim() || values.venueName.trim().length > 120)
            next.venueName = "Укажите название площадки (до 120 символов).";
        if (
            !values.venueAddress.trim() ||
            values.venueAddress.trim().length > 300
        )
            next.venueAddress = "Укажите адрес (до 300 символов).";
        if (!startsAt || Date.parse(startsAt) <= Date.now())
            next.startsAt = "Выберите дату и время в будущем.";
        if (!Number.isInteger(duration) || duration < 30 || duration > 480)
            next.durationMinutes =
                "Длительность должна быть от 30 до 480 минут.";
        if (!Number.isInteger(limit) || limit < 2 || limit > 32)
            next.participantLimit = "Укажите от 2 до 32 мест.";
        if (gameQuery.data && limit < gameQuery.data.participantCount)
            next.participantLimit = `В игре уже ${gameQuery.data.participantCount} участника. Лимит нельзя уменьшить ниже этого числа.`;
        if (values.desiredLevel.trim().length > 80)
            next.desiredLevel = "Подсказка уровня — до 80 символов.";
        if (values.description.length > 2000)
            next.description = "Описание — до 2000 символов.";
        setErrors(next);
        return Object.keys(next).length === 0 && startsAt
            ? { startsAt, duration, limit }
            : undefined;
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;
        const valid = validate();
        if (!valid) return;
        try {
            const input = {
                venueName: values.venueName.trim(),
                venueAddress: values.venueAddress.trim(),
                startsAt: valid.startsAt,
                durationMinutes: valid.duration,
                participantLimit: valid.limit,
                organizerParticipates: values.organizerParticipates,
                ...(values.desiredLevel.trim()
                    ? { desiredLevel: values.desiredLevel.trim() }
                    : {}),
                ...(values.description.trim()
                    ? { description: values.description.trim() }
                    : {}),
            };
            const game = matchId
                ? await updateGame.mutateAsync({ gameId: matchId, input })
                : await create.mutateAsync(input);
            navigate(`/matches/${game.id}`);
        } catch (error) {
            if (error instanceof ApiError && error.status === 400) {
                setErrors({
                    form: "Сервер не принял данные. Проверьте поля и попробуйте снова.",
                });
            }
        }
    }

    const update = <K extends keyof FormValues>(
        key: K,
        value: FormValues[K],
    ) => {
        setValues((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: "", form: "" }));
    };

    return (
        <Page>
            <main className="mx-auto grid w-full max-w-lg gap-5 px-4 py-8 sm:px-6">
                <Link
                    className="min-h-11 py-2 text-sm font-semibold text-accent"
                    to="/"
                >
                    ← Все игры
                </Link>
                {matchId && !gameQuery.isPending && !canEdit && (
                    <Card role="alert">
                        <h1 className="font-semibold">
                            Нет доступа к управлению игрой
                        </h1>
                        <p className="mt-2 text-sm text-text-secondary">
                            Только организатор может редактировать эту игру.
                        </p>
                    </Card>
                )}
                {matchId && gameQuery.isPending && (
                    <p role="status">Загружаем игру…</p>
                )}
                {matchId && gameQuery.isError && (
                    <Card role="alert">
                        <p>Не удалось загрузить игру для редактирования.</p>
                    </Card>
                )}
                {canEdit && (!matchId || gameQuery.isSuccess) && (
                    <>
                        <header className="grid gap-2">
                            <h1 className="text-2xl font-bold">
                                {matchId
                                    ? "Редактировать игру"
                                    : "Создать игру"}
                            </h1>
                            <p className="text-sm leading-relaxed text-text-secondary">
                                Укажите площадку и время встречи. Адрес вводится
                                вручную.
                            </p>
                        </header>
                        <Card>
                            <form
                                className="grid gap-4"
                                onSubmit={(event) => void submit(event)}
                                noValidate
                            >
                                <TextField
                                    label="Название площадки"
                                    name="venueName"
                                    value={values.venueName}
                                    maxLength={120}
                                    autoComplete="organization"
                                    error={errors.venueName}
                                    onChange={(event) =>
                                        update("venueName", event.target.value)
                                    }
                                />
                                <label className="grid gap-2 text-sm font-medium">
                                    Адрес
                                    <textarea
                                        className="min-h-20 w-full rounded-control border border-border bg-surface px-4 py-3 text-base"
                                        name="venueAddress"
                                        maxLength={300}
                                        value={values.venueAddress}
                                        aria-invalid={Boolean(
                                            errors.venueAddress,
                                        )}
                                        onChange={(event) =>
                                            update(
                                                "venueAddress",
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {errors.venueAddress && (
                                        <span
                                            className="text-sm font-normal text-error"
                                            role="alert"
                                        >
                                            {errors.venueAddress}
                                        </span>
                                    )}
                                </label>
                                <TextField
                                    label="Дата и время начала (Москва)"
                                    name="startsAt"
                                    type="datetime-local"
                                    value={values.startsAt}
                                    error={errors.startsAt}
                                    onChange={(event) =>
                                        update("startsAt", event.target.value)
                                    }
                                />
                                <p className="-mt-3 text-xs text-text-secondary">
                                    Часовой пояс: Europe/Moscow (UTC+3). На
                                    сервер отправится время UTC.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <TextField
                                        label="Длительность, мин"
                                        name="durationMinutes"
                                        type="number"
                                        min={30}
                                        max={480}
                                        step={1}
                                        value={values.durationMinutes}
                                        error={errors.durationMinutes}
                                        onChange={(event) =>
                                            update(
                                                "durationMinutes",
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <TextField
                                        label="Всего мест"
                                        name="participantLimit"
                                        type="number"
                                        min={2}
                                        max={32}
                                        step={1}
                                        value={values.participantLimit}
                                        error={errors.participantLimit}
                                        onChange={(event) =>
                                            update(
                                                "participantLimit",
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <TextField
                                    label="Желаемый уровень (необязательно)"
                                    name="desiredLevel"
                                    value={values.desiredLevel}
                                    maxLength={80}
                                    error={errors.desiredLevel}
                                    onChange={(event) =>
                                        update(
                                            "desiredLevel",
                                            event.target.value,
                                        )
                                    }
                                />
                                <label className="grid gap-2 text-sm font-medium">
                                    Описание (необязательно)
                                    <textarea
                                        className="min-h-24 w-full rounded-control border border-border bg-surface px-4 py-3 text-base"
                                        name="description"
                                        maxLength={2000}
                                        value={values.description}
                                        aria-invalid={Boolean(
                                            errors.description,
                                        )}
                                        onChange={(event) =>
                                            update(
                                                "description",
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {errors.description && (
                                        <span
                                            className="text-sm font-normal text-error"
                                            role="alert"
                                        >
                                            {errors.description}
                                        </span>
                                    )}
                                </label>
                                <label className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-control border border-border p-4 text-sm">
                                    <input
                                        className="mt-1 size-5 accent-accent"
                                        type="checkbox"
                                        checked={values.organizerParticipates}
                                        onChange={(event) =>
                                            update(
                                                "organizerParticipates",
                                                event.target.checked,
                                            )
                                        }
                                    />
                                    <span>
                                        <span className="block font-semibold">
                                            Я участвую
                                        </span>
                                        <span className="mt-1 block text-text-secondary">
                                            Если включено, вы займёте одно
                                            место; иначе все места останутся
                                            доступными игрокам.
                                        </span>
                                    </span>
                                </label>
                                {(errors.form ||
                                    create.isError ||
                                    updateGame.isError) && (
                                    <p
                                        className="text-sm text-error"
                                        role="alert"
                                    >
                                        {errors.form ??
                                            "Не удалось создать игру. Проверьте подключение и попробуйте снова. Введённые данные сохранены."}
                                    </p>
                                )}
                                <Button type="submit" disabled={pending}>
                                    {pending
                                        ? "Сохраняем…"
                                        : matchId
                                          ? "Сохранить изменения"
                                          : "Создать игру"}
                                </Button>
                            </form>
                        </Card>
                    </>
                )}
            </main>
        </Page>
    );
}

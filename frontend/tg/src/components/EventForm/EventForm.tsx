import type { GameDetail, CreateGameRequest } from "@/api/games.ts";
import { PreviewStep } from "./ui/PreviewStep/PreviewStep";
import { PaymentStep } from "./ui/PaymentStep/PaymentStep";
import { ScheduleStep } from "./ui/ScheduleStep/ScheduleStep";
import { VenueStep } from "./ui/VenueStep/VenueStep";
import { RestrictionsStep } from "./ui/RestrictionsStep/RestrictionsStep";
import { CourtsStep } from "./ui/CourtsStep/CourtsStep";
import { getDefaultCourtCount } from "./ui/CourtsStep/getDefaultCourtCount";
import { TrainingTypeStep } from "./ui/TrainingTypeStep/TrainingTypeStep";
import { FormatDescription } from "./ui/FormatDescription/FormatDescription";
import { FormatStep } from "./ui/FormatStep/FormatStep";
import { BasicsStep } from "./ui/BasicsStep/BasicsStep";
import {
    Button,
    GlassAlertDialog,
    GlassAlertDialogTrigger,
    GlassAlertDialogContent,
    GlassAlertDialogHeader,
    GlassAlertDialogTitle,
    GlassAlertDialogDescription,
    GlassAlertDialogFooter,
    GlassAlertDialogCancel,
    GlassAlertDialogAction,
} from "@picklehub/ui-web";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/GlassCard/Card.tsx";
import { useForm, type FieldPathValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/api/games.ts";
import {
    moscowDateTimeInput,
    moscowDateTimeToUtc,
} from "@/helpers/gameTime.ts";

import {
    eventFormSchema,
    initialValues,
    firstStep,
    hiddenEventTypeStep,
    stepFieldsByEventType,
    stepTitlesByEventType,
} from "./const";
import type { FormValues } from "./types";
import { useVenues } from "@/api/venues";

type EventFormProps = {
    game?: GameDetail;
    pending: boolean;
    isError: boolean;
    onSubmit: (input: CreateGameRequest) => Promise<unknown>;
    onReset: () => void;
};

export function EventForm({
    game,
    pending,
    isError,
    onSubmit,
    onReset,
}: EventFormProps) {
    const formId = useId();
    const venues = useVenues();
    const [venueResetKey, setVenueResetKey] = useState(0);
    const [actionsContainer, setActionsContainer] =
        useState<HTMLElement | null>(null);
    useEffect(() => {
        setActionsContainer(document.getElementById("event-form-actions"));
    }, []);
    const eventTypesRef = useRef<HTMLDivElement>(null);
    const stepLabelRef = useRef<HTMLParagraphElement>(null);
    const [step, setStep] = useState(firstStep);
    const schema = eventFormSchema.superRefine((values, context) => {
        const usernames = values.invitedUsernames.trim()
            ? values.invitedUsernames
                  .trim()
                  .split(/[\s,;]+/)
                  .map((username) => username.replace(/^@/, "").toLowerCase())
            : [];
        if (new Set(usernames).size !== usernames.length) {
            context.addIssue({
                code: "custom",
                path: ["invitedUsernames"],
                message: "Уберите повторяющиеся логины.",
            });
        }
        if (
            usernames.length + Number(values.organizerParticipates) >
            Number(values.participantLimit)
        ) {
            context.addIssue({
                code: "custom",
                path: ["invitedUsernames"],
                message:
                    "Количество приглашённых с учётом вашего участия превышает лимит игроков.",
            });
        }
        if (game && Number(values.participantLimit) < game.participantCount) {
            context.addIssue({
                code: "custom",
                path: ["participantLimit"],
                message: `В игре уже ${game.participantCount} участника. Лимит нельзя уменьшить ниже этого числа.`,
            });
        }
    });
    const {
        watch,
        reset,
        setValue,
        setError,
        clearErrors,
        trigger,
        handleSubmit,
        formState,
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: game
            ? {
                  ...initialValues,
                  eventType: "play-on",
                  format: "none",
                  venueName: game.venueName,
                  venueAddress: game.venueAddress,
                  startsAt: moscowDateTimeInput(new Date(game.startsAt)),
                  durationMinutes: String(game.durationMinutes),
                  participantLimit: game.participantLimit,
                  courtCount: getDefaultCourtCount(game.participantLimit),
                  availableSpots: Math.max(
                      0,
                      game.participantLimit -
                          Number(game.organizerParticipates),
                  ),
                  organizerParticipates: game.organizerParticipates,
                  desiredLevel: game.desiredLevel ?? "",
                  description: game.description ?? "",
              }
            : {
                  ...initialValues,
                  startsAt: moscowDateTimeInput(
                      new Date(Date.now() + 24 * 60 * 60 * 1000),
                  ),
              },
    });
    const values = watch();
    const showChoiceCards = step === 2 && values.eventType === "play-on";
    useLayoutEffect(() => {
        const fieldset = eventTypesRef.current;
        const stepLabel = stepLabelRef.current;
        if (
            (step !== firstStep && !showChoiceCards) ||
            !fieldset ||
            !stepLabel ||
            !actionsContainer
        )
            return;

        const updateSpace = () => {
            const button = actionsContainer.querySelector("button");
            if (!button) return;
            const availableHeight =
                button.getBoundingClientRect().top -
                (fieldset.getBoundingClientRect().top + window.scrollY) -
                16;
            fieldset.style.minHeight = `${Math.max(0, availableHeight)}px`;
        };
        const observer = new ResizeObserver(updateSpace);
        observer.observe(actionsContainer);
        observer.observe(stepLabel);
        window.addEventListener("resize", updateSpace);
        updateSpace();
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateSpace);
            fieldset.style.removeProperty("min-height");
        };
    }, [step, showChoiceCards, actionsContainer]);

    const errors = Object.fromEntries(
        Object.entries(formState.errors).map(([key, error]) => [
            key,
            error.message,
        ]),
    );
    const busy = pending || formState.isSubmitting;
    const stepFields = stepFieldsByEventType[values.eventType ?? "play-on"];
    const titles = stepTitlesByEventType[values.eventType ?? "play-on"];
    const lastStep = titles.length - 1;

    async function next() {
        if (busy || step === lastStep) return;
        if (await trigger(stepFields[step]))
            setStep((current) =>
                current + 1 === hiddenEventTypeStep ? current + 2 : current + 1,
            );
    }

    async function submit(inputValues: FormValues) {
        if (pending || inputValues.eventType === "training") return;
        const startsAt = moscowDateTimeToUtc(inputValues.startsAt);
        if (!startsAt) return;
        try {
            await onSubmit({
                venueName:
                    inputValues.venueName.trim() ||
                    inputValues.venueAddress.trim().slice(0, 120),
                venueAddress: inputValues.venueAddress.trim(),
                startsAt,
                durationMinutes: Number(inputValues.durationMinutes),
                participantLimit: Number(inputValues.participantLimit),
                organizerParticipates: inputValues.organizerParticipates,
                ...(inputValues.desiredLevel.trim()
                    ? { desiredLevel: inputValues.desiredLevel.trim() }
                    : {}),
                ...(inputValues.description.trim()
                    ? { description: inputValues.description.trim() }
                    : {}),
            });
        } catch (error) {
            setError("root", {
                message:
                    error instanceof ApiError && error.status === 400
                        ? "Сервер не принял данные. Проверьте поля и попробуйте снова."
                        : "Не удалось сохранить игру. Проверьте подключение и попробуйте снова. Введённые данные сохранены.",
            });
        }
    }

    const update = <K extends keyof FormValues>(
        key: K,
        value: FieldPathValue<FormValues, K>,
    ) => {
        setValue(key, value, {
            shouldDirty: true,
            shouldValidate: Boolean(formState.errors[key]),
        });
        if (
            (key === "participantLimit" && values.courtCountMatchPlayers) ||
            (key === "courtCountMatchPlayers" && value === true)
        ) {
            setValue(
                "courtCount",
                getDefaultCourtCount(
                    key === "participantLimit"
                        ? Number(value)
                        : values.participantLimit,
                ),
                {
                    shouldDirty: true,
                    shouldValidate: Boolean(formState.errors.courtCount),
                },
            );
        }
        if (
            (key === "participantLimit" && values.availableSpotsMatchPlayers) ||
            (key === "organizerParticipates" &&
                values.availableSpotsMatchPlayers) ||
            (key === "availableSpotsMatchPlayers" && value === true)
        ) {
            const participantLimit =
                key === "participantLimit"
                    ? Number(value)
                    : values.participantLimit;
            const organizerParticipates =
                key === "organizerParticipates"
                    ? Boolean(value)
                    : values.organizerParticipates;
            setValue(
                "availableSpots",
                Math.max(0, participantLimit - Number(organizerParticipates)),
                {
                    shouldDirty: true,
                    shouldValidate: Boolean(formState.errors.availableSpots),
                },
            );
        }
        clearErrors("root");
    };

    return (
        <form
            id={formId}
            className="grid gap-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (step < lastStep) void next();
                else
                    void handleSubmit(submit, (invalid) => {
                        const firstStep = stepFields.findIndex((fields) =>
                            fields.some((field) => invalid[field]),
                        );
                        if (firstStep >= 0) setStep(firstStep);
                    })(event);
            }}
            noValidate
        >
            <div>
                <h1 className="text-2xl font-bold">
                    {game ? "Редактировать игру" : "Создать событие"}
                </h1>
                <p
                    ref={stepLabelRef}
                    role="status"
                    className="text-[var(--ph-text-secondary)]"
                >
                    Шаг{" "}
                    {step - firstStep + 1 - Number(step > hiddenEventTypeStep)}{" "}
                    из {titles.length - firstStep - 1}: {titles[step]}
                </p>
            </div>
            {step === 2 && values.eventType === "play-on" && (
                <FormatDescription value={values.format} />
            )}
            <div
                ref={eventTypesRef}
                hidden={step !== firstStep && !showChoiceCards}
                className="grid content-center"
            >
                <BasicsStep
                    values={values}
                    hidden={step !== firstStep}
                    busy={busy}
                    update={update}
                    errors={errors}
                />
                <FormatStep
                    values={values}
                    hidden={step !== 2 || values.eventType !== "play-on"}
                    busy={busy}
                    update={update}
                />
            </div>
            <CourtsStep
                values={values}
                hidden={step !== 3}
                busy={busy}
                update={update}
                errors={errors}
                formId={formId}
            />
            <RestrictionsStep
                values={values}
                hidden={step !== 4}
                busy={busy}
                update={update}
                errors={errors}
                formId={formId}
                onDuprBlur={(field, value) => {
                    if (/^\d+$/.test(value)) {
                        setValue(field, `${value}.000`, { shouldDirty: true });
                    }
                    void trigger(["duprMin", "duprMax"]);
                }}
            />
            <VenueStep
                key={venueResetKey}
                venues={venues.data ?? []}
                loading={venues.isPending}
                loadError={venues.isError}
                onRetry={() => {
                    void venues.refetch();
                }}
                values={values}
                hidden={step !== 5}
                busy={busy}
                update={update}
                errors={errors}
            />
            <ScheduleStep
                values={values}
                hidden={step !== 6}
                busy={busy}
                update={update}
                errors={errors}
            />
            <PaymentStep
                values={values}
                hidden={step !== 7}
                busy={busy}
                update={update}
                errors={errors}
            />
            {step === lastStep && values.eventType === "play-on" && (
                <PreviewStep values={values} busy={busy} onEdit={setStep} />
            )}
            <GlassCard
                className="grid gap-4"
                hidden={
                    step === firstStep ||
                    showChoiceCards ||
                    step === 3 ||
                    step === 4 ||
                    step === 5 ||
                    step === 6 ||
                    step === 7 ||
                    step === 8
                }
            >
                <TrainingTypeStep
                    values={values}
                    hidden={step !== 2 || values.eventType !== "training"}
                    busy={busy}
                    update={update}
                    errors={errors}
                />
                {(errors.root || isError) && (
                    <p className="text-sm text-error" role="alert">
                        {errors.root ||
                            "Не удалось сохранить игру. Проверьте подключение и попробуйте снова. Введённые данные сохранены."}
                    </p>
                )}
            </GlassCard>
            {(step === 7 || step === 8) && (errors.root || isError) && (
                <p className="text-sm text-error" role="alert">
                    {errors.root ||
                        "Не удалось сохранить игру. Проверьте подключение и попробуйте снова."}
                </p>
            )}
            {actionsContainer &&
                createPortal(
                    <div
                        className="mx-auto grid w-full max-w-lg grid-cols-[30%_70%] gap-3 p-3"
                        aria-label="Управление формой события"
                    >
                        <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            className="w-full min-h-12 whitespace-normal text-text border-border hover:scale-100 active:scale-100"
                            disabled={busy || step === firstStep}
                            onClick={() =>
                                setStep((current) =>
                                    current - 1 === hiddenEventTypeStep
                                        ? current - 2
                                        : current - 1,
                                )
                            }
                        >
                            Назад
                        </Button>
                        <Button
                            type="submit"
                            form={formId}
                            size="lg"
                            variant="accent"
                            className="w-full min-h-12 whitespace-normal hover:scale-100 active:scale-100"
                            disabled={
                                busy ||
                                (step === firstStep && !values.title.trim()) ||
                                (step === 1 && !values.eventType) ||
                                (step === 2 &&
                                    !(values.eventType === "training"
                                        ? values.trainingType
                                        : values.format)) ||
                                (values.eventType === "training" &&
                                    step === lastStep)
                            }
                        >
                            {busy
                                ? "Сохраняем…"
                                : step === lastStep
                                  ? game
                                      ? "Сохранить"
                                      : "Создать"
                                  : "Вперед"}
                        </Button>
                        <GlassAlertDialog>
                            <div className="col-span-2">
                                <GlassAlertDialogTrigger asChild>
                                    <Button
                                        type="button"
                                        size="lg"
                                        variant="outline"
                                        className="w-full min-h-12 whitespace-normal border-error text-error hover:border-error hover:bg-error/10 hover:scale-100 active:scale-100"
                                        disabled={busy || step === firstStep}
                                    >
                                        Начать сначала
                                    </Button>
                                </GlassAlertDialogTrigger>
                            </div>
                            <GlassAlertDialogContent className="inset-x-0 bottom-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl bg-surface text-text pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0">
                                <div className="mx-auto max-w-lg">
                                    <GlassAlertDialogHeader>
                                        <GlassAlertDialogTitle className="text-text">
                                            Начать сначала?
                                        </GlassAlertDialogTitle>
                                        <GlassAlertDialogDescription className="text-text-secondary">
                                            Все введённые данные будут сброшены.
                                            Вы вернётесь к названию и доступу
                                            события.
                                        </GlassAlertDialogDescription>
                                    </GlassAlertDialogHeader>
                                    <GlassAlertDialogFooter>
                                        <GlassAlertDialogCancel className="text-text border-border">
                                            Продолжить заполнение
                                        </GlassAlertDialogCancel>
                                        <GlassAlertDialogAction
                                            className="bg-none bg-error text-white hover:bg-error/90"
                                            onClick={() => {
                                                reset({
                                                    ...initialValues,
                                                    startsAt:
                                                        moscowDateTimeInput(
                                                            new Date(
                                                                Date.now() +
                                                                    24 *
                                                                        60 *
                                                                        60 *
                                                                        1000,
                                                            ),
                                                        ),
                                                });
                                                setStep(0);
                                                setVenueResetKey(
                                                    (current) => current + 1,
                                                );
                                                onReset();
                                            }}
                                        >
                                            Сбросить данные
                                        </GlassAlertDialogAction>
                                    </GlassAlertDialogFooter>
                                </div>
                            </GlassAlertDialogContent>
                        </GlassAlertDialog>
                    </div>,
                    actionsContainer,
                )}
        </form>
    );
}

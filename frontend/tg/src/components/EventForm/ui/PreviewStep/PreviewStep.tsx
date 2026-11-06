import { Button } from "@picklehub/ui-web";
import { SquarePen } from "lucide-react";
import { moscowDateTimeToUtc } from "@/helpers/gameTime";
import {
    eventTypeOptions,
    formatOptions,
    trainingTypeOptions,
} from "../../const";
import { participantGenderOptions } from "../RestrictionsStep/const";
import { costFields } from "../PaymentStep/const";
import {
    previewDateFormatter,
    previewMoneyFormatter,
    previewTimeFormatter,
} from "./const";
import type { PreviewSection, PreviewStepProps } from "./types";

export function PreviewStep({ values, busy, onEdit }: PreviewStepProps) {
    const amount = (value: string) => Number(value.replace(",", ".")) || 0;
    const money = (value: string | number) =>
        previewMoneyFormatter.format(
            typeof value === "string" ? amount(value) : value,
        );
    const dateTime = (value: Date) =>
        `${previewDateFormatter.format(value)}\n${previewTimeFormatter.format(value)}`;
    const yesNo = (value: boolean) => (value ? "Да" : "Нет");
    const startsAt = moscowDateTimeToUtc(values.startsAt);
    const start = startsAt ? new Date(startsAt) : undefined;
    const atMinute = (minute: number) =>
        start ? new Date(start.getTime() + minute * 60_000) : undefined;
    const end = atMinute(Number(values.durationMinutes));
    const durationHours = Math.floor(Number(values.durationMinutes) / 60);
    const durationMinutes = Number(values.durationMinutes) % 60;
    const durationLabel = [
        durationHours > 0 ? `${durationHours}ч.` : "",
        durationMinutes > 0 ? `${durationMinutes}мин.` : "",
    ]
        .filter(Boolean)
        .join(" ");
    const expensesTotal =
        Math.round(
            ((amount(values.courtHourlyRate) *
                values.courtCount *
                Number(values.durationMinutes)) /
                60 +
                amount(values.organizerFee) +
                amount(values.otherExpenses)) *
                100,
        ) / 100;
    const totalCost = values.costBreakdownEnabled
        ? values.costPerPerson === ""
            ? expensesTotal
            : Number(values.costPerPerson) * values.participantLimit
        : values.totalCost;
    const sections: PreviewSection[] = [
        {
            title: "Название и доступ",
            step: 0,
            rows: [
                { label: "Название", value: values.title },
                {
                    label: "Доступ",
                    value: values.isPrivate
                        ? "Приватное, только по ссылке"
                        : "Открытое",
                },
                {
                    label: "Тип события",
                    value:
                        eventTypeOptions.find(
                            ({ value }) => value === values.eventType,
                        )?.label ?? "—",
                },
                ...(values.invitedUsernames.trim()
                    ? [
                          {
                              label: "Приглашённые",
                              value: values.invitedUsernames,
                          },
                      ]
                    : []),
            ],
        },
        {
            step: 2,
            title:
                values.eventType === "training"
                    ? "Тип тренировки"
                    : "Формат игры",
            rows: [
                {
                    label: "Формат",
                    value:
                        values.eventType === "training"
                            ? (trainingTypeOptions.find(
                                  ({ value }) => value === values.trainingType,
                              )?.label ?? "—")
                            : (formatOptions.find(
                                  ({ value }) => value === values.format,
                              )?.label ?? "—"),
                },
            ],
        },
        {
            title: "Корты и игроки",
            step: 3,
            rows: [
                { label: "Количество игроков", value: values.participantLimit },
                { label: "Число кортов", value: values.courtCount },
                { label: "Мест для записи", value: values.availableSpots },
                {
                    label: "Ваше участие",
                    value: yesNo(values.organizerParticipates),
                },
                {
                    label: "Список ожидания",
                    value: yesNo(values.waitlistEnabled),
                },
                {
                    label: "Авто-ротация из списка ожидания",
                    value: yesNo(values.waitlistAutoRotation),
                },
                {
                    label: "Модерация игроков",
                    value: yesNo(values.playerModeration),
                },
            ],
        },
        {
            title: "Ограничения",
            step: 4,
            rows: [
                {
                    label: "Пол участников",
                    value:
                        participantGenderOptions.find(
                            ({ value }) => value === values.participantGender,
                        )?.label ?? "—",
                },
                ...(values.participantGender === "mixed"
                    ? [
                          { label: "Мужчин", value: values.maleCount },
                          { label: "Женщин", value: values.femaleCount },
                      ]
                    : []),
                {
                    label: "Рейтинг DUPR",
                    value: values.duprRestricted
                        ? [
                              values.duprMin && `от ${values.duprMin}`,
                              values.duprMax && `до ${values.duprMax}`,
                          ]
                              .filter(Boolean)
                              .join(" ")
                        : "Без ограничений",
                },
                ...(values.desiredLevel.trim()
                    ? [{ label: "Уровень игры", value: values.desiredLevel }]
                    : []),
            ],
        },
        {
            title: "Площадка",
            step: 5,
            rows: [
                {
                    label: "Название площадки",
                    value: values.venueName || "Не указано",
                },
                { label: "Адрес", value: values.venueAddress },
            ],
        },
        {
            title: "Дата и время",
            step: 6,
            rows: [
                {
                    label: "Начало (МСК)",
                    value: start ? dateTime(start) : "—",
                },
                {
                    label: "Окончание (МСК)",
                    value: end ? dateTime(end) : "—",
                },
                {
                    label: "Длительность",
                    value: durationLabel,
                },
                {
                    label: "Временные слоты",
                    value: values.timeSlotsEnabled ? "Включены" : "Выключены",
                },
                ...(values.timeSlotsEnabled
                    ? values.timeSlots.map((slot, index) => ({
                          label: `Слот ${index + 1}`,
                          value: `${previewTimeFormatter.format(atMinute(slot.start))} – ${previewTimeFormatter.format(atMinute(slot.end))}`,
                      }))
                    : []),
            ],
        },
        {
            title: "Оплата",
            step: 7,
            rows: [
                {
                    label: "Общая стоимость",
                    value: totalCost === "" ? "Не указана" : money(totalCost),
                },
                {
                    label: "Детализация стоимости",
                    value: yesNo(values.costBreakdownEnabled),
                },
                ...(values.costBreakdownEnabled
                    ? [
                          ...costFields.map(({ key, label }) => ({
                              label,
                              value: money(values[key]),
                          })),
                          {
                              label: "Стоимость/чел",
                              value:
                                  values.costPerPerson === ""
                                      ? "Не указана"
                                      : money(values.costPerPerson),
                          },
                      ]
                    : []),
                {
                    label: "Комментарий",
                    value: values.description.trim() || "Не указан",
                },
            ],
        },
    ];

    return (
        <section
            aria-label="Предпросмотр события"
            className="grid min-w-0 gap-4"
        >
            <p className="text-sm text-text-secondary">
                Проверьте настройки события перед созданием.
            </p>
            {sections.map(({ title, step, rows }) => (
                <fieldset
                    key={title}
                    disabled={busy}
                    className="relative grid min-w-0 gap-3 rounded-xl border border-white/15 bg-white/5 p-3 pr-14"
                >
                    <legend className="max-w-full px-1 text-sm font-medium text-white/80">
                        {title}
                    </legend>
                    <div className="absolute right-2 top-1 size-10">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-10 text-white/80 hover:bg-white/10 hover:scale-100 active:scale-100"
                            disabled={busy}
                            aria-label={`Изменить: ${title}`}
                            onClick={() => onEdit(step)}
                        >
                            <SquarePen className="size-4" aria-hidden="true" />
                        </Button>
                    </div>
                    <dl className="grid min-w-0 gap-3 text-sm">
                        {rows.map(({ label, value }) => (
                            <div
                                key={label}
                                className="grid min-w-0 gap-1 sm:grid-cols-2 sm:gap-4"
                            >
                                <dt className="text-text-secondary">{label}</dt>
                                <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </fieldset>
            ))}
        </section>
    );
}

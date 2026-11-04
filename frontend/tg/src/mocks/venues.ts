import type { KnownVenue } from "@/api/venues.ts";

// Моковый справочник по https://picklepoint.ru/courts/ от 3 ноября 2026.
// Сообщества без точного адреса и дубли одной площадки исключены.
export const mockVenues: KnownVenue[] = [
    {
        id: "svoya-kuhnya",
        name: "Своя кухня",
        address: "Москва, ул. Сущёвский Вал, 56, стр. 1",
    },
    {
        id: "salut-geraklion",
        name: "Салют Гераклион",
        address: "Москва, Лодочная ул., 15, стр. 1А",
    },
    {
        id: "zenit",
        name: "Зенит · Красногорск",
        address: "Московская область, Красногорск, Советская ул., 14",
    },
    {
        id: "tennis-capital",
        name: "Tennis Capital · Савёловская",
        address: "Москва, Складочная ул., 1, стр. 1, Станколит",
    },
    {
        id: "002-pickleball",
        name: "002 Пиклбол",
        address: "Москва, Рабочая ул., 53, стр. 1",
    },
    {
        id: "neva",
        name: "Семейный клуб «Нева»",
        address:
            "Ленинградская область, п. им. Свердлова, ул. Ермаковская, 21Б, стр. 7",
    },
    {
        id: "padelton",
        name: "Паделтон",
        address: "Казань, ул. Николая Ершова, 7Б, стадион «Трудовые резервы»",
    },
    {
        id: "lime-padel",
        name: "Лайм Падел",
        address: "Казань, ул. Юлиуса Фучика, 90, ТРЦ «Франт»",
    },
];

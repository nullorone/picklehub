import assert from "node:assert/strict";
import { chromium } from "playwright";
import { moscowDateTimeInput } from "../src/helpers/gameTime.ts";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const next = (page) =>
    page.getByRole("button", { name: "Вперед", exact: true });
const back = (page) => page.getByRole("button", { name: "Назад", exact: true });

try {
    for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({
            viewport: { width, height: 844 },
        });
        page.setDefaultTimeout(15000);
        let submitted;
        page.on("request", (request) => {
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname === "/games"
            ) {
                submitted = request.postDataJSON();
            }
        });
        await page.goto(`${baseUrl}/?mockScenario=normal#/event/new`);
        await page
            .getByRole("textbox", { name: "Название события" })
            .fill("Проверка расписания");
        await next(page).click();
        await page.getByText("Без формата", { exact: true }).click();
        for (let index = 0; index < 3; index++) await next(page).click();
        await page.getByRole("button", { name: "Указать свой адрес" }).click();
        await page
            .getByRole("textbox", { name: "Адрес", exact: true })
            .fill("Тестоград, улица Проверки, 1");
        await next(page).click();
        const step = page.getByRole("group", {
            name: "Дата и время события",
            exact: true,
        });
        await step.waitFor();
        assert.equal(
            await step.evaluate((element) =>
                Boolean(element.closest(".tg-card")),
            ),
            false,
        );
        const date = page.getByLabel("Дата", { exact: true });
        const chooseDate = async (value) => {
            const displayed = (await date.textContent()).trim();
            const current = /^\d{2}\.\d{2}\.\d{4}$/.test(displayed)
                ? displayed.split(".").reverse().join("-")
                : moscowDateTimeInput().split("T")[0];
            const [year, month, day] = value.split("-").map(Number);
            const [currentYear, currentMonth] = current.split("-").map(Number);
            await date.click();
            const calendar = page.getByRole("dialog", {
                name: "Выбор даты события",
            });
            await calendar.waitFor();
            const difference = (year - currentYear) * 12 + month - currentMonth;
            for (let index = 0; index < Math.abs(difference); index++) {
                await calendar
                    .getByRole("button", {
                        name: difference > 0 ? "Next month" : "Previous month",
                        exact: true,
                    })
                    .click();
            }
            await calendar
                .getByRole("button", { name: String(day), exact: true })
                .click();
            await calendar.waitFor({ state: "hidden" });
            assert.equal(
                (await date.textContent()).trim(),
                value.split("-").reverse().join("."),
            );
        };
        const row = await date.evaluate((element) => {
            const label = element.parentElement
                .querySelector("label")
                .getBoundingClientRect();
            const button = element.getBoundingClientRect();
            const icon = element.querySelector("svg").getBoundingClientRect();
            return (
                Math.abs(
                    label.top +
                        label.height / 2 -
                        button.top -
                        button.height / 2,
                ) < 2 && icon.left < button.right - 60
            );
        });
        assert.ok(row, "Дата и лейбл в одной строке, иконка перед датой");
        await date.click();
        await page
            .getByRole("dialog", { name: "Выбор даты события" })
            .waitFor();
        await page.keyboard.press("Escape");
        await page
            .getByRole("dialog", { name: "Выбор даты события" })
            .waitFor({ state: "hidden" });
        const time = page.locator('input[name="startsAtTime"]');
        assert.equal(await step.getByRole("spinbutton").count(), 0);
        const duration = step.getByRole("group", {
            name: "Длительность",
            exact: true,
        });
        const timeSlots = step.getByRole("switch", {
            name: "Запись по слотам",
            exact: true,
        });
        assert.equal(await timeSlots.isChecked(), false);
        await timeSlots.check();
        assert.equal(await timeSlots.isChecked(), true);
        await back(page).click();
        await next(page).click();
        assert.equal(await timeSlots.isChecked(), true);
        await timeSlots.uncheck();
        assert.equal(await timeSlots.isChecked(), false);
        const manualEnd = step.getByRole("checkbox", {
            name: "Указать время окончания",
            exact: true,
        });
        const endTime = step.locator('input[name="endsAtTime"]');
        assert.equal(await manualEnd.isChecked(), false);
        assert.equal(await endTime.count(), 0);
        const futureDate = new Date(Date.now() + 7 * 86400000)
            .toISOString()
            .slice(0, 10);
        await chooseDate(futureDate);
        await time.fill("18:30");
        await page.getByRole("button", { name: "1,5 ч", exact: true }).click();
        await timeSlots.check();
        const slot = (number) =>
            step.getByRole("group", { name: `Слот ${number}`, exact: true });
        const slotStart = (number) =>
            slot(number).getByLabel("Начало", { exact: true });
        const slotEnd = (number) =>
            slot(number).getByLabel("Окончание", { exact: true });
        const addSlot = step.getByRole("button", {
            name: "Добавить слот",
            exact: true,
        });
        assert.equal(await slotStart(1).inputValue(), "18:30");
        assert.equal(await slotEnd(1).inputValue(), "19:30");
        await addSlot.click();
        assert.equal(await slotStart(2).inputValue(), "19:30");
        assert.equal(await slotEnd(2).inputValue(), "20:00");
        assert.equal(await addSlot.isDisabled(), true);
        await slotStart(2).fill("19:00");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Укажите слоты внутри времени события" })
            .waitFor();
        await slotStart(2).fill("19:30");
        await slotEnd(2).fill("20:01");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Укажите слоты внутри времени события" })
            .waitFor();
        await slotEnd(2).fill("");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Укажите слоты внутри времени события" })
            .waitFor();
        await slotEnd(2).fill("20:00");
        await next(page).click();
        await back(page).click();
        assert.equal(await slotEnd(2).inputValue(), "20:00");
        await time.fill("23:30");
        assert.equal(await slotEnd(1).inputValue(), "00:30");
        assert.equal(await slotEnd(2).inputValue(), "01:00");
        await slotEnd(1).fill("00:15");
        await next(page).click();
        await back(page).click();
        assert.equal(await slotEnd(1).inputValue(), "00:15");
        await time.fill("18:30");
        await slotEnd(1).fill("19:30");
        await step
            .getByRole("button", { name: "Удалить слот 2", exact: true })
            .click();
        assert.equal(await slot(2).count(), 0);
        assert.equal(
            await page
                .getByRole("button", { name: "1,5 ч", exact: true })
                .getAttribute("aria-pressed"),
            "true",
        );
        const layout = await step.evaluate((element) => {
            const parent = element.getBoundingClientRect();
            return [
                ...element.querySelectorAll(
                    'input:not([aria-hidden="true"]), button',
                ),
            ].every((control) => {
                const bounds = control.getBoundingClientRect();
                return (
                    bounds.left >= parent.left - 1 &&
                    bounds.right <= parent.right + 1
                );
            });
        });
        assert.ok(layout, "Поля и кнопки помещаются в ширину шага");
        await timeSlots.uncheck();
        await time.fill("");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Выберите дату и время в будущем" })
            .waitFor();
        assert.equal(await time.getAttribute("aria-invalid"), "true");
        await time.fill("18:30");
        const pastDate = new Date(Date.now() - 7 * 86400000)
            .toISOString()
            .slice(0, 10);
        await chooseDate(pastDate);
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Выберите дату и время в будущем" })
            .waitFor();
        await chooseDate(futureDate);
        for (const label of ["1 ч", "1,5 ч", "2 ч", "3 ч"]) {
            await duration
                .getByRole("button", { name: label, exact: true })
                .click();
            await next(page).click();
            await page
                .getByRole("status")
                .filter({ hasText: "Шаг 7 из 7" })
                .waitFor();
            await back(page).click();
            assert.equal(
                await duration
                    .getByRole("button", { name: label, exact: true })
                    .getAttribute("aria-pressed"),
                "true",
            );
        }
        await duration
            .getByRole("button", { name: "1,5 ч", exact: true })
            .click();
        await back(page).click();
        await next(page).click();
        assert.equal(
            await date.textContent().then((value) => value.trim()),
            futureDate.split("-").reverse().join("."),
        );
        assert.equal(await time.inputValue(), "18:30");
        assert.equal(
            await duration
                .getByRole("button", { name: "1,5 ч", exact: true })
                .getAttribute("aria-pressed"),
            "true",
        );
        await manualEnd.check();
        assert.equal(await endTime.inputValue(), "20:00");
        await endTime.fill("19:45");
        assert.equal(
            await duration.getByRole("button", { pressed: true }).count(),
            0,
        );
        await back(page).click();
        await next(page).click();
        assert.equal(await manualEnd.isChecked(), true);
        assert.equal(await endTime.inputValue(), "19:45");
        await time.fill("23:30");
        assert.equal(await endTime.inputValue(), "00:45");
        await endTime.fill("00:30");
        assert.equal(
            await duration
                .getByRole("button", { name: "1 ч", exact: true })
                .getAttribute("aria-pressed"),
            "true",
        );
        await step
            .getByText("Окончание на следующий день.", { exact: false })
            .waitFor();
        for (const invalid of ["", "23:45", "08:00"]) {
            await endTime.fill(invalid);
            await next(page).click();
            await step
                .getByRole("alert")
                .filter({
                    hasText: "Длительность должна быть от 30 до 480 минут",
                })
                .waitFor();
        }
        await time.fill("18:30");
        await endTime.fill("19:45");
        await manualEnd.uncheck();
        assert.equal(await endTime.count(), 0);
        await manualEnd.check();
        assert.equal(await endTime.inputValue(), "19:45");
        await page.screenshot({
            path: `/private/tmp/picklehub-schedule-${width}.png`,
            fullPage: true,
        });
        await next(page).click();
        await next(page).click();
        await page.waitForURL(/#\/event\/[0-9a-f-]+$/);
        assert.equal(submitted.startsAt, `${futureDate}T15:30:00.000Z`);
        assert.equal(submitted.durationMinutes, 75);
        console.log(
            `PASS ${width}px: адаптивность, дата, время, пресеты, валидация, возврат, отправка UTC`,
        );
        await page.close();
    }
} finally {
    await browser.close();
}

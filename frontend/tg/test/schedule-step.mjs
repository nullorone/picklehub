import assert from "node:assert/strict";
import { chromium } from "playwright";

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
        await page.getByText("Play on", { exact: true }).click();
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
        const time = page.getByLabel("Начало", { exact: true });
        const duration = page.getByRole("spinbutton", {
            name: "Длительность",
            exact: true,
        });
        const futureDate = new Date(Date.now() + 7 * 86400000)
            .toISOString()
            .slice(0, 10);
        await date.fill(futureDate);
        await time.fill("18:30");
        await page.getByRole("button", { name: "1,5 ч", exact: true }).click();
        assert.equal(await duration.inputValue(), "90");
        assert.equal(
            await page
                .getByRole("button", { name: "1,5 ч", exact: true })
                .getAttribute("aria-pressed"),
            "true",
        );
        await duration.fill("75");
        assert.equal(
            await step.getByRole("button", { pressed: true }).count(),
            0,
        );
        const layout = await step.evaluate((element) => {
            const parent = element.getBoundingClientRect();
            return [...element.querySelectorAll("input, button")].every(
                (control) => {
                    const bounds = control.getBoundingClientRect();
                    return (
                        bounds.left >= parent.left - 1 &&
                        bounds.right <= parent.right + 1
                    );
                },
            );
        });
        assert.ok(layout, "Поля и кнопки помещаются в ширину шага");
        await time.fill("");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Выберите дату и время в будущем" })
            .waitFor();
        assert.equal(await time.getAttribute("aria-invalid"), "true");
        await time.fill("18:30");
        await date.fill("2020-01-01");
        await next(page).click();
        await step
            .getByRole("alert")
            .filter({ hasText: "Выберите дату и время в будущем" })
            .waitFor();
        await date.fill(futureDate);
        for (const invalid of ["", "29", "481", "30.5"]) {
            await duration.fill(invalid);
            await next(page).click();
            await step
                .getByRole("alert")
                .filter({
                    hasText: "Длительность должна быть от 30 до 480 минут",
                })
                .waitFor();
        }
        for (const valid of ["30", "480"]) {
            await duration.fill(valid);
            await next(page).click();
            await page
                .getByRole("status")
                .filter({ hasText: "Шаг 8 из 8" })
                .waitFor();
            await back(page).click();
            assert.equal(await duration.inputValue(), valid);
        }
        await duration.fill("75");
        await back(page).click();
        await next(page).click();
        assert.equal(await date.inputValue(), futureDate);
        assert.equal(await time.inputValue(), "18:30");
        assert.equal(await duration.inputValue(), "75");
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

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });

try {
    for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({
            viewport: { width, height: 844 },
        });
        await page.goto(`${baseUrl}/?mockScenario=normal#/event/new`);
        await page
            .getByRole("textbox", { name: "Название события" })
            .fill("Проверка кортов");
        const next = page.getByRole("button", { name: "Вперед", exact: true });
        await next.click();
        await page.getByRole("status").filter({ hasText: "Шаг 2 из 7: Формат игры" }).waitFor();
        assert.equal(await page.getByText("Play on", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Назад", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Шаг 1 из 7: Название и доступ" }).waitFor();
        await next.click();
        await page.getByText("Без формата", { exact: true }).click();
        await next.click();

        const players = page.getByRole("spinbutton", {
            name: "Количество игроков",
            exact: true,
        });
        const courts = page.getByRole("spinbutton", {
            name: "Число кортов",
            exact: true,
        });
        const manual = page.getByRole("checkbox", {
            name: "Изменить количество кортов",
            exact: true,
        });
        const spots = page.getByRole("spinbutton", {
            name: "Мест для записи",
            exact: true,
        });
        const participates = page.getByRole("switch", {
            name: "Участвовать в событии",
            exact: true,
        });
        const customSpots = page.getByRole("checkbox", {
            name: "Изменить количество мест для записи",
            exact: true,
        });
        assert.equal(
            await spots.inputValue(),
            String(Number(await players.inputValue()) - 1),
        );
        assert.equal(
            await participates.evaluate((element) => {
                const field = element
                    .closest("fieldset")
                    .querySelector('[name="availableSpots"]');
                return Boolean(
                    element.compareDocumentPosition(field) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
            }),
            true,
        );
        await participates.uncheck();
        assert.equal(await spots.inputValue(), await players.inputValue());
        await participates.check();
        await players.fill("12");
        assert.equal(await spots.inputValue(), "11");
        await customSpots.check();
        await spots.fill("5");
        await participates.uncheck();
        assert.equal(await spots.inputValue(), "5");
        await customSpots.uncheck();
        assert.equal(await spots.inputValue(), "12");
        await participates.check();
        assert.equal(await spots.inputValue(), "11");
        await next.click();
        await page.getByRole("button", { name: "Назад", exact: true }).click();
        assert.equal(await spots.inputValue(), "11");
        assert.equal(await courts.isDisabled(), true);
        assert.equal(
            await courts.inputValue(),
            String(
                Math.max(1, Math.ceil(Number(await players.inputValue()) / 4)),
            ),
        );
        for (const [count, expected] of [
            [2, 1],
            [3, 1],
            [4, 1],
            [5, 2],
            [8, 2],
            [9, 3],
            [96, 24],
        ]) {
            await players.fill(String(count));
            assert.equal(await courts.inputValue(), String(expected));
        }
        await manual.check();
        assert.equal(await courts.isEnabled(), true);
        await courts.fill("7");
        await players.fill("12");
        assert.equal(await courts.inputValue(), "7");
        await next.click();
        await page.getByRole("button", { name: "Назад", exact: true }).click();
        assert.equal(await manual.isChecked(), true);
        assert.equal(await courts.inputValue(), "7");
        await courts.fill("0");
        await next.click();
        await page
            .getByRole("alert")
            .filter({ hasText: "Укажите целое число кортов" })
            .waitFor();
        await manual.uncheck();
        assert.equal(await courts.inputValue(), "3");
        assert.equal(await courts.isDisabled(), true);
        await next.click();
        await page.getByRole("button", { name: "Назад", exact: true }).click();
        await page
            .getByRole("button", { name: "Начать сначала", exact: true })
            .click();
        await page
            .getByRole("button", { name: "Сбросить данные", exact: true })
            .click();
        await page
            .getByRole("textbox", { name: "Название события" })
            .fill("После сброса");
        await next.click();
        await page.getByText("Без формата", { exact: true }).click();
        await next.click();
        assert.equal(
            await courts.inputValue(),
            String(
                Math.max(1, Math.ceil(Number(await players.inputValue()) / 4)),
            ),
        );
        assert.equal(await courts.isDisabled(), true);
        assert.equal(await manual.isChecked(), false);
        await page.close();
    }
    console.log(
        "Расчёт кортов, ручной режим, валидация и сброс проверены на трёх ширинах экрана.",
    );
} finally {
    await browser.close();
}

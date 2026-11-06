import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
    for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({
            viewport: { width, height: 844 },
        });
        await page.goto(
            `${process.env.APP_URL ?? "http://127.0.0.1:5173"}/?mockScenario=normal#/event/new`,
        );
        await page
            .getByRole("textbox", { name: "Название события" })
            .fill("Проверка оплаты");
        const next = page.getByRole("button", { name: "Вперед", exact: true });
        await next.click();
        await page.getByText("Без формата", { exact: true }).click();
        for (let i = 0; i < 3; i++) await next.click();
        await page.getByRole("button", { name: "Указать свой адрес" }).click();
        await page
            .getByRole("textbox", { name: "Адрес", exact: true })
            .fill("Тестовый адрес");
        await next.click();
        await next.click();
        const total = page.getByLabel("Общая стоимость", { exact: true });
        assert.equal(
            await total.evaluate((element) =>
                Boolean(element.closest(".tg-card")),
            ),
            false,
        );
        await total.fill("1500");
        assert.equal(
            await page.getByLabel("Стоимость/чел", { exact: true }).count(),
            0,
        );
        await page
            .getByRole("checkbox", { name: "Детализация стоимости" })
            .check();
        assert.equal(
            await page
                .getByLabel("Стоимость/чел", { exact: true })
                .inputValue(),
            "",
        );
        await page.getByLabel("Корт/час", { exact: true }).fill("1000");
        assert.equal(
            await page
                .getByLabel("Стоимость/чел", { exact: true })
                .inputValue(),
            "500",
        );
        await page
            .getByLabel("Комиссия организатору", { exact: true })
            .fill("300");
        await page.getByLabel("Прочие расходы", { exact: true }).fill("100");
        assert.equal(await total.inputValue(), "2400");
        assert.equal(
            await page
                .getByLabel("Стоимость/чел", { exact: true })
                .inputValue(),
            "600",
        );
        const perPerson = page.getByLabel("Стоимость/чел", { exact: true });
        await perPerson.fill("500");
        await perPerson.clear();
        assert.equal(await perPerson.inputValue(), "");
        await perPerson.fill("99999");
        assert.equal(await total.inputValue(), "399996");
        await perPerson.press("End");
        await perPerson.press("9");
        assert.equal(await perPerson.inputValue(), "99999");
        await perPerson.fill("700");
        assert.equal(await total.inputValue(), "2800");
        await page.getByLabel("Прочие расходы", { exact: true }).fill("101");
        await page.getByLabel("Прочие расходы", { exact: true }).fill("100");
        assert.equal(await total.inputValue(), "2400");
        const padding = await perPerson.evaluate((element) => {
            const block = element.parentElement.parentElement.parentElement;
            const bounds = block.getBoundingClientRect();
            const input = element.getBoundingClientRect();
            const label = block.querySelector("label").getBoundingClientRect();
            return {
                left: label.left - bounds.left,
                right: bounds.right - input.right,
            };
        });
        assert.ok(Math.abs(padding.left - padding.right) < 2);
        await page
            .getByLabel("Комментарий (необязательно)")
            .fill("Оплата на месте");
        await page
            .getByRole("checkbox", { name: "Детализация стоимости" })
            .uncheck();
        assert.equal(await total.inputValue(), "2400");
        await page.getByRole("button", { name: "Назад", exact: true }).click();
        await next.click();
        assert.equal(await total.inputValue(), "2400");
        assert.equal(
            await page.getByLabel("Комментарий (необязательно)").inputValue(),
            "Оплата на месте",
        );
        await page.close();
    }
    console.log(
        "Payment step: calculation, toggle, comment and navigation passed at 320, 390 and 1280px",
    );
} finally {
    await browser.close();
}

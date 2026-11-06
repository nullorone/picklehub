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
        await next.click();
        const preview = page.getByRole("region", {
            name: "Предпросмотр события",
        });
        await preview.waitFor();
        assert.ok(
            await preview
                .getByText("Проверка оплаты", { exact: true })
                .isVisible(),
        );
        assert.ok(
            await preview
                .getByText("Тестовый адрес", { exact: true })
                .isVisible(),
        );
        assert.ok(
            await preview
                .getByText("Оплата на месте", { exact: true })
                .isVisible(),
        );
        const previewValue = (label) =>
            preview
                .locator("dl > div")
                .filter({
                    has: page
                        .locator("dt")
                        .filter({ hasText: new RegExp(`^${label}$`) }),
                })
                .locator("dd");
        assert.match(
            await previewValue("Общая стоимость").innerText(),
            /2\s?400/,
        );
        assert.equal(await previewValue("Количество игроков").innerText(), "4");
        assert.equal(await previewValue("Мест для записи").innerText(), "3");
        assert.equal(await previewValue("Формат").innerText(), "Без формата");
        assert.equal(await previewValue("Длительность").innerText(), "2ч.");
        for (const label of ["Начало (МСК)", "Окончание (МСК)"]) {
            const dateTime = await preview
                .locator("dl > div")
                .filter({ has: page.getByText(label, { exact: true }) })
                .locator("dd")
                .innerText();
            assert.match(dateTime, /^.+\n\d{2}:\d{2}$/);
            assert.ok(!dateTime.includes(" в "));
        }

        for (const [duration, expected] of [
            [75, "1ч. 15мин."],
            [30, "30мин."],
            [120, "2ч."],
        ]) {
            await preview
                .getByRole("button", {
                    name: "Изменить: Дата и время",
                    exact: true,
                })
                .click();
            await page
                .getByRole("checkbox", { name: "Указать время окончания" })
                .check();
            const startTime = await page
                .getByLabel("Начало", { exact: true })
                .inputValue();
            const [hour, minute] = startTime.split(":").map(Number);
            const endMinutes = (hour * 60 + minute + duration) % (24 * 60);
            await page
                .getByLabel("Окончание", { exact: true })
                .fill(
                    `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
                );
            await next.click();
            await next.click();
            assert.equal(
                await previewValue("Длительность").innerText(),
                expected,
            );
        }
        assert.equal(
            await previewValue("Рейтинг DUPR").innerText(),
            "Без ограничений",
        );
        assert.ok(
            await page
                .locator('[aria-label="Управление формой события"]')
                .getByRole("button", { name: "Создать", exact: true })
                .isEnabled(),
        );
        assert.equal(await next.count(), 0);
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth,
            ),
            false,
        );
        const editTitles = [
            "Название и доступ",
            "Формат игры",
            "Корты и игроки",
            "Ограничения",
            "Площадка",
            "Дата и время",
            "Оплата",
        ];
        assert.equal(
            await preview.getByRole("button").count(),
            editTitles.length,
        );
        assert.equal(await preview.locator(".tg-card").count(), 0);
        for (const [index, title] of editTitles.entries()) {
            const edit = preview.getByRole("button", {
                name: `Изменить: ${title}`,
                exact: true,
            });
            assert.equal(
                await edit.locator("svg.lucide-square-pen").count(),
                1,
            );
            assert.equal((await edit.innerText()).trim(), "");
            const layout = await edit.evaluate((button) => {
                const block = button.closest("fieldset");
                const action = button.getBoundingClientRect();
                const bounds = block.getBoundingClientRect();
                const content = block
                    .querySelector("dl > div")
                    .getBoundingClientRect();
                return {
                    position: getComputedStyle(
                        button.parentElement.parentElement,
                    ).position,
                    inside:
                        action.left >= bounds.left &&
                        action.right <= bounds.right &&
                        action.top >= bounds.top,
                    gap: action.left - content.right,
                };
            });
            assert.equal(layout.position, "absolute");
            assert.ok(layout.inside);
            assert.ok(layout.gap >= 8);
            await edit.click();
            assert.ok(
                (await page.getByRole("status").innerText()).endsWith(title),
            );
            for (let step = index; step < editTitles.length; step++)
                await next.click();
            await preview.waitFor();
        }
        await preview
            .getByRole("button", { name: "Изменить: Оплата", exact: true })
            .click();
        await total.fill("1700");
        await page
            .getByRole("checkbox", { name: "Детализация стоимости" })
            .check();
        await perPerson.fill("700");
        await next.click();
        assert.match(
            await previewValue("Общая стоимость").innerText(),
            /2\s?800/,
        );
        assert.match(await previewValue("Стоимость/чел").innerText(), /700/);
        assert.match(await previewValue("Корт/час").innerText(), /1\s?000/);
        if (width === 390)
            await page.screenshot({
                path: "/private/tmp/picklehub-event-preview.png",
                fullPage: true,
            });
        let createRequests = 0;
        page.on("request", (request) => {
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname.endsWith("/games")
            )
                createRequests += 1;
        });
        await page.evaluate(() => {
            const url = new URL(window.location.href);
            url.searchParams.set("mockScenario", "error");
            window.history.replaceState(null, "", url);
        });
        await page
            .locator('[aria-label="Управление формой события"]')
            .getByRole("button", { name: "Создать", exact: true })
            .click();
        await page
            .getByRole("alert")
            .filter({ hasText: "Не удалось сохранить игру" })
            .first()
            .waitFor();
        assert.equal(createRequests, 1);
        assert.ok(await preview.isVisible());
        assert.equal(await page.getByRole("dialog").count(), 0);
        await page.evaluate(() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("mockScenario");
            window.history.replaceState(null, "", url);
        });
        await page
            .locator('[aria-label="Управление формой события"]')
            .getByRole("button", { name: "Создать", exact: true })
            .click();
        const success = page.getByRole("dialog", {
            name: "Событие успешно создано",
        });
        await success.waitFor();
        assert.equal(createRequests, 2);
        assert.ok(await success.locator("time").getAttribute("datetime"));
        assert.ok(
            await success
                .getByRole("button", { name: "Поделиться", exact: true })
                .isVisible(),
        );
        await success
            .getByRole("button", { name: "Посмотреть", exact: true })
            .click();
        await page.waitForURL(/#\/event\/[0-9a-f-]+\/details$/);
        await page
            .getByRole("heading", { name: "Тестовый адрес", exact: true })
            .waitFor();
        assert.equal(await page.getByText("Событие не найдено.").count(), 0);
        const legacyUrl = page.url().replace(/\/details$/, "");
        await page.goto(legacyUrl);
        await page.waitForURL(/#\/event\/[0-9a-f-]+\/details$/);
        await page.close();
    }
    console.log(
        "Payment and preview: calculation, settings, navigation and submission passed at 320, 390 and 1280px",
    );
} finally {
    await browser.close();
}

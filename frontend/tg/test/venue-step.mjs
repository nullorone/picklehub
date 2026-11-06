import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const nextButton = (page) =>
    page.getByRole("button", { name: "Вперед", exact: true });
const backButton = (page) =>
    page.getByRole("button", { name: "Назад", exact: true });

async function openForm(page, scenario = "normal") {
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    await page.goto(`${baseUrl}/?mockScenario=${scenario}#/event/new`);
    await page
        .getByRole("textbox", { name: "Название события" })
        .fill("Вечерняя игра");
}

async function reachVenue(page) {
    await nextButton(page).click();
    await page.getByText("Без формата", { exact: true }).click();
    for (let index = 0; index < 3; index++) await nextButton(page).click();
    await page
        .getByRole("status")
        .filter({ hasText: "Шаг 5 из 7: Площадка" })
        .waitFor();
}

try {
    for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({
            viewport: { width, height: 844 },
        });
        let venueRequests = 0;
        let submitted;
        page.on("request", (request) => {
            if (new URL(request.url()).pathname === "/venues") venueRequests++;
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname === "/games"
            )
                submitted = request.postDataJSON();
        });
        const catalogReady = page.waitForResponse(
            (response) => new URL(response.url()).pathname === "/venues",
        );
        await openForm(page);
        await catalogReady;
        assert.equal(
            venueRequests,
            1,
            "Справочник загружается уже на первом шаге",
        );
        await reachVenue(page);
        assert.equal(
            await page.getByRole("listbox").count(),
            0,
            "Без запроса нет региональных рекомендаций",
        );
        assert.equal(
            await page
                .getByRole("group", { name: "Площадка события" })
                .evaluate((el) => Boolean(el.closest(".tg-card"))),
            false,
            "Как и предыдущие шаги, площадка без внешней карточки",
        );
        if (width === 390)
            await page.screenshot({
                path: "/private/tmp/picklehub-venue-empty.png",
                fullPage: true,
            });
        await nextButton(page).click();
        await page
            .getByRole("alert")
            .filter({ hasText: "Выберите площадку" })
            .waitFor();
        const search = page.getByRole("combobox", {
            name: "Название или адрес",
        });
        await search.fill("мо");
        await page.getByRole("option").nth(4).waitFor();
        const layout = await page.getByRole("listbox").evaluate((list) => {
            const rows = [...list.querySelectorAll('[role="option"]')];
            return rows.map((row, index) => {
                const bounds = row.getBoundingClientRect();
                const content = row.lastElementChild.getBoundingClientRect();
                const previous = rows[index - 1]?.getBoundingClientRect();
                return {
                    bottomPadding: bounds.bottom - content.bottom,
                    gap: previous ? bounds.top - previous.bottom : null,
                };
            });
        });
        assert.ok(
            layout.every((row) => row.bottomPadding >= 11),
            "Длинные адреса помещаются в строки с нижним отступом",
        );
        const gaps = layout.slice(1).map((row) => row.gap);
        assert.ok(
            gaps.every((gap) => gap >= 0 && Math.abs(gap - gaps[0]) < 1),
            "Строки не накладываются и имеют равные интервалы",
        );
        await search.fill("м");
        assert.equal(await page.getByRole("listbox").count(), 0);
        await search.fill("гЕрАкЛиОн");
        await page
            .getByRole("option", { name: /Салют Гераклион.*Лодочная/ })
            .waitFor();
        await search.fill("москва лодочная 15");
        assert.equal(
            await page
                .getByRole("listbox", { name: "Найденные площадки" })
                .getByRole("option")
                .count(),
            1,
        );
        await search.press("Escape");
        assert.equal(await search.getAttribute("aria-expanded"), "false");
        await search.press("ArrowDown");
        assert.ok(await search.getAttribute("aria-activedescendant"));
        await search.press("Enter");
        await nextButton(page).click();
        await page
            .getByRole("status")
            .filter({ hasText: "Шаг 6 из 7" })
            .waitFor();
        await backButton(page).click();
        await page.getByRole("button", { name: "Изменить площадку" }).click();
        await search.fill("савеловская");
        await page.getByRole("option", { name: /Tennis Capital/ }).waitFor();
        await search.fill("Testville, Example Road, 42");
        await page
            .getByRole("status")
            .filter({ hasText: "В нашем списке пока нет такого места" })
            .waitFor();
        await page.getByRole("button", { name: "Указать свой адрес" }).click();
        const address = page.getByRole("textbox", {
            name: "Адрес",
            exact: true,
        });
        assert.equal(await address.inputValue(), "Testville, Example Road, 42");
        assert.equal(
            await page
                .getByRole("textbox", {
                    name: "Название места (необязательно)",
                })
                .inputValue(),
            "",
        );
        await address.fill("   ");
        await nextButton(page).click();
        await page
            .getByRole("alert")
            .filter({ hasText: "Укажите адрес." })
            .waitFor();
        await address.fill("Testville, Example Road, 42");
        await nextButton(page).click();
        await backButton(page).click();
        assert.equal(await address.inputValue(), "Testville, Example Road, 42");
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
        );
        if (width === 390)
            await page.screenshot({
                path: "/private/tmp/picklehub-venue-custom.png",
                fullPage: true,
            });
        await nextButton(page).click();
        await nextButton(page).click();
        await nextButton(page).click();
        await page.waitForURL(/#\/event\/[0-9a-f-]+$/);
        assert.equal(submitted.venueAddress, "Testville, Example Road, 42");
        assert.equal(submitted.venueName, submitted.venueAddress);
        assert.equal(venueRequests, 1, "Переходы по шагам используют кэш");
        console.log(
            `PASS ${width}px: ранняя загрузка, поиск по названию и адресу, ё/е, выбор, свой адрес, валидация, возврат и сохранение`,
        );
        await page.close();
    }

    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    await openForm(page, "error");
    await reachVenue(page);
    await page
        .getByRole("combobox", { name: "Название или адрес" })
        .fill("своя");
    await page.getByRole("button", { name: "Повторить загрузку" }).waitFor();
    await page.getByRole("button", { name: "Указать свой адрес" }).click();
    await page
        .getByRole("textbox", { name: "Адрес", exact: true })
        .fill("Тестоград, улица Проверки, 1");
    await page.getByRole("button", { name: "Найти площадку в списке" }).click();
    await page.evaluate(() =>
        history.replaceState(null, "", "?mockScenario=normal#/event/new"),
    );
    await page.getByRole("button", { name: "Повторить загрузку" }).click();
    await page.getByRole("option", { name: /Своя кухня/ }).waitFor();
    await page.getByRole("button", { name: "Указать свой адрес" }).click();
    assert.equal(
        await page
            .getByRole("textbox", { name: "Адрес", exact: true })
            .inputValue(),
        "Тестоград, улица Проверки, 1",
    );
    await page.getByRole("button", { name: "Найти площадку в списке" }).click();
    await page
        .getByRole("combobox", { name: "Название или адрес" })
        .fill("казань");
    await page.getByRole("option", { name: /Паделтон/ }).click();
    await page.screenshot({
        path: "/private/tmp/picklehub-venue-selected.png",
        fullPage: true,
    });
    await page
        .getByRole("button", { name: "Начать сначала", exact: true })
        .click();
    await page.getByRole("button", { name: "Сбросить данные" }).click();
    await page
        .getByRole("textbox", { name: "Название события" })
        .fill("Другая игра");
    await reachVenue(page);
    assert.equal(
        await page
            .getByRole("combobox", { name: "Название или адрес" })
            .inputValue(),
        "",
    );
    assert.equal(
        await page.getByRole("button", { name: "Изменить площадку" }).count(),
        0,
    );
    await page
        .getByRole("combobox", { name: "Название или адрес" })
        .fill("казань");
    await page.screenshot({
        path: "/private/tmp/picklehub-venue-search.png",
        fullPage: true,
    });
    console.log(
        "PASS: ошибка загрузки, ручной ввод, повторная загрузка без потери данных, сброс формы",
    );
    await page.close();

    const touch = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    await openForm(touch);
    await reachVenue(touch);
    const touchSearch = touch.getByRole("combobox", {
        name: "Название или адрес",
    });
    await touchSearch.fill("казань");
    await touch.getByRole("option", { name: /Лайм Падел/ }).tap();
    await touch.getByRole("button", { name: "Изменить площадку" }).waitFor();
    await touch.getByRole("button", { name: "Изменить площадку" }).tap();
    await touchSearch.fill("Testville, Example Road, 1");
    await touch.getByRole("button", { name: "Указать свой адрес" }).tap();
    const touchAddress = touch.getByRole("textbox", {
        name: "Адрес",
        exact: true,
    });
    const touchName = touch.getByRole("textbox", {
        name: "Название места (необязательно)",
    });
    await touchAddress.fill("Testville, Example Road, 2");
    await touchName.fill("Community court");
    await touch.getByRole("button", { name: "Найти площадку в списке" }).tap();
    await touchSearch.fill("другой запрос");
    await touch.getByRole("button", { name: "Указать свой адрес" }).tap();
    assert.equal(await touchAddress.inputValue(), "Testville, Example Road, 2");
    assert.equal(await touchName.inputValue(), "Community court");
    await touch.getByRole("button", { name: "Найти площадку в списке" }).tap();
    await touch.getByRole("button", { name: "Очистить поиск" }).tap();
    assert.equal(await touchSearch.inputValue(), "");
    assert.equal(await touch.getByRole("listbox").count(), 0);
    assert.equal(
        await touchSearch.evaluate((el) => el === document.activeElement),
        true,
    );
    console.log(
        "PASS: выбор касанием, сохранение черновика адреса и названия, очистка без региональных подсказок",
    );
    await touch.close();
} finally {
    await browser.close();
}

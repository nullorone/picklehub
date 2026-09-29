import { emitEvent, isTMA, mockTelegramEnv } from "@telegram-apps/sdk-react";

// It is important, to mock the environment only for development purposes. When building the
// application, import.meta.env.DEV will become false, and the code inside will be tree-shaken,
// so you will not see it in your final bundle.
if (import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "false") {
    if (!(await isTMA("complete"))) {
        const theme = new URLSearchParams(window.location.search).get("theme");
        const themeParams =
            theme === "light"
                ? ({
                      accent_text_color: "#2f683b",
                      bg_color: "#f6f7f4",
                      button_color: "#387a45",
                      button_text_color: "#ffffff",
                      destructive_text_color: "#a83226",
                      header_bg_color: "#f6f7f4",
                      hint_color: "#72776f",
                      link_color: "#2f683b",
                      secondary_bg_color: "#ffffff",
                      section_bg_color: "#ffffff",
                      section_header_text_color: "#2f683b",
                      subtitle_text_color: "#72776f",
                      text_color: "#20241f",
                  } as const)
                : ({
                      accent_text_color: "#6ab2f2",
                      bg_color: "#20231f",
                      button_color: "#80b889",
                      button_text_color: "#171b17",
                      destructive_text_color: "#f2aaa1",
                      header_bg_color: "#20231f",
                      hint_color: "#b1b7ad",
                      link_color: "#9bc9a2",
                      secondary_bg_color: "#292d28",
                      section_bg_color: "#20231f",
                      section_header_text_color: "#9bc9a2",
                      subtitle_text_color: "#b1b7ad",
                      text_color: "#f2f4ed",
                  } as const);
        const noInsets = { left: 0, top: 0, bottom: 0, right: 0 } as const;

        mockTelegramEnv({
            onEvent(e) {
                // Here you can write your own handlers for all known Telegram Mini Apps methods:
                // https://docs.telegram-mini-apps.com/platform/methods
                if (e[0] === "web_app_request_theme") {
                    return emitEvent("theme_changed", {
                        theme_params: themeParams,
                    });
                }
                if (e[0] === "web_app_request_viewport") {
                    return emitEvent("viewport_changed", {
                        height: window.innerHeight,
                        width: window.innerWidth,
                        is_expanded: true,
                        is_state_stable: true,
                    });
                }
                if (e[0] === "web_app_request_content_safe_area") {
                    return emitEvent("content_safe_area_changed", noInsets);
                }
                if (e[0] === "web_app_request_safe_area") {
                    return emitEvent("safe_area_changed", noInsets);
                }
            },
            launchParams: new URLSearchParams([
                // Discover more launch parameters:
                // https://docs.telegram-mini-apps.com/platform/launch-parameters#parameters-list
                ["tgWebAppThemeParams", JSON.stringify(themeParams)],
                // Your init data goes here. Learn more about it here:
                // https://docs.telegram-mini-apps.com/platform/init-data#parameters-list
                //
                // Note that to make sure, you are using a valid init data, you must pass it exactly as it
                // is sent from the Telegram application. The reason is in case you will sort its keys
                // (auth_date, hash, user, etc.) or values your own way, init data validation will more
                // likely to fail on your server side. So, to make sure you are working with a valid init
                // data, it is better to take a real one from your application and paste it here. It should
                // look something like this (a correctly encoded URL search params):
                // ```
                // user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22...
                // ```
                // But in case you don't really need a valid init data, use this one:
                [
                    "tgWebAppData",
                    new URLSearchParams([
                        [
                            "auth_date",
                            ((new Date().getTime() / 1000) | 0).toString(),
                        ],
                        ["hash", "some-hash"],
                        ["signature", "some-signature"],
                        [
                            "user",
                            JSON.stringify({ id: 1, first_name: "Vladislav" }),
                        ],
                    ]).toString(),
                ],
                ["tgWebAppVersion", "8.4"],
                ["tgWebAppPlatform", "tdesktop"],
            ]),
        });

        console.info(
            "⚠️ As long as the current environment was not considered as the Telegram-based one, it was mocked. Take a note, that you should not do it in production and current behavior is only specific to the development process. Environment mocking is also applied only in development mode. So, after building the application, you will not see this behavior and related warning, leading to crashing the application outside Telegram.",
        );
    }
}

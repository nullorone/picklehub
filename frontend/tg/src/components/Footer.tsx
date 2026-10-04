import pickleballIcon from "../assets/pickleball.svg";
import { GlassDock } from "@picklehub/ui-web";
import { useLocation, useNavigate } from "react-router-dom";

export function Footer() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const iconProps = {
        width: 20,
        height: 20,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true as const,
    };

    return (
        <footer className="tg-footer">
            <nav
                aria-label="Основная навигация"
                className="mx-auto w-full max-w-lg px-4 sm:px-6"
            >
                <GlassDock
                    className="tg-footer-dock"
                    baseSize={40}
                    maxSize={40}
                    magnification={1}
                    items={[
                        {
                            id: "home",
                            label: "Главная",
                            iconScale: 1,
                            glow: false,
                            icon: (
                                <svg {...iconProps}>
                                    <path d="m3 10 9-7 9 7v10H3Z" />
                                    <path d="M9 20v-7h6v7" />
                                </svg>
                            ),
                            active:
                                pathname === "/" ||
                                pathname.startsWith("/matches/"),
                            onClick: () => navigate("/"),
                        },
                        {
                            id: "play",
                            label: "Играть",
                            iconScale: 3.5,
                            glow: true,
                            containerStyle: {
                                width: 64,
                                height: 64,
                                top: "-50%",
                                position: "absolute",
                                left: "50%",
                                transform: "translateX(-50%)",
                            },
                            buttonStyle: {
                                width: 64,
                                height: 64,
                                position: "absolute",
                                top: 0,
                                transform: "none",
                                overflow: "hidden",
                                borderRadius: "50%",
                                flexShrink: 0,
                                boxShadow: "0 8px 24px rgb(6 182 212 / 40%)",
                            },
                            icon: (
                                <img
                                    src={pickleballIcon}
                                    width={20}
                                    height={20}
                                    alt=""
                                    aria-hidden="true"
                                />
                            ),
                            active: pathname === "/games/new",
                            onClick: () => navigate("/games/new"),
                        },
                        {
                            id: "profile",
                            label: "Профиль",
                            iconScale: 1,
                            glow: false,
                            icon: (
                                <svg {...iconProps}>
                                    <circle cx="12" cy="8" r="4" />
                                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                                </svg>
                            ),
                            active: pathname === "/profile",
                            onClick: () => navigate("/profile"),
                        },
                    ]}
                />
            </nav>
        </footer>
    );
}

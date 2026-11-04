import pickleballIcon from "../assets/pickleball-icon.svg";
import { Droplet, Globe, House, Send, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { LiquidNavbar, LiquidNavbarProps } from "@picklehub/ui-web";
import { useCallback } from "react";

// const buttonClassName =
//     "relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 " +
//     "bg-white/15 backdrop-blur-xl transition-all duration-200 ease-out hover:bg-white/25 " +
//     "shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)] " +
//     "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

// function ButtonHighlights() {
//     return (
//         <>
//             <span
//                 aria-hidden="true"
//                 className="pointer-events-none absolute inset-0 rounded-[inherit] bg-linear-to-b from-white/20 to-transparent"
//             />
//             <span
//                 aria-hidden="true"
//                 className="pointer-events-none absolute inset-0 rounded-[inherit] bg-linear-to-tr from-transparent to-white/10"
//             />
//         </>
//     );
// }

export function Footer() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const activeItem =
        pathname === "/profile" ? 2 : pathname === "/event/new" ? 1 : 0;

    const iconProps = {
        size: 18,
        strokeWidth: 1.8,
        "aria-hidden": true,
    } as const;
    const NimbusIcons = {
        home: <House {...iconProps} />,
        globe: <Globe {...iconProps} />,
        plane: <Send {...iconProps} />,
        drop: <Droplet {...iconProps} />,
        user: <UserRound {...iconProps} />,
        ball: <img src={pickleballIcon} alt={""} />,
    };
    const navItems: LiquidNavbarProps["items"] = [
        { label: "Главная", icon: NimbusIcons.home, fx: "wave" },
        { label: "Создать", icon: NimbusIcons.ball, fx: "glow" },
        { label: "Профиль", icon: NimbusIcons.user, fx: "wave" },
    ];

    const handleNavItemChange = useCallback<
        NonNullable<LiquidNavbarProps["onChange"]>
    >(
        (_, { label }) => {
            switch (label) {
                case "Профиль":
                    navigate("/profile");
                    break;
                case "Создать":
                    navigate("/event/new");
                    break;
                default:
                    navigate("/");
            }
        },
        [navigate],
    );

    return (
        // <footer className="tg-footer ds-glass ds-header-glass rounded-2xl border text-ds-text">
        <footer className="tg-footer">
            <div id="event-form-actions" />
            <LiquidNavbar
                className={"w-full flex justify-around items-center"}
                active={activeItem}
                onChange={handleNavItemChange}
                items={navItems}
                tone={"dark"}
            />
            {/*<nav*/}
            {/*    aria-label="Основная навигация"*/}
            {/*    className="relative mx-auto grid min-h-16 w-full max-w-lg grid-cols-[44px_minmax(0,1fr)_44px] items-center px-2 sm:px-2"*/}
            {/*>*/}
            {/*    <button*/}
            {/*        type="button"*/}
            {/*        aria-label="Главная"*/}
            {/*        aria-current={isHome ? "page" : undefined}*/}
            {/*        onClick={() => navigate("/")}*/}
            {/*        className={buttonClassName}*/}
            {/*    >*/}
            {/*        <ButtonHighlights />*/}
            {/*        <House*/}
            {/*            className="relative"*/}
            {/*            size={20}*/}
            {/*            strokeWidth={1.8}*/}
            {/*            aria-hidden="true"*/}
            {/*        />*/}
            {/*    </button>*/}
            {/*    <button*/}
            {/*        type="button"*/}
            {/*        aria-label="Список событий"*/}
            {/*        onClick={() => navigate("/event/list")}*/}
            {/*        className={`${buttonClassName} tg-footer-play justify-self-center -translate-y-2`}*/}
            {/*    >*/}
            {/*        <ButtonHighlights />*/}
            {/*        <img*/}
            {/*            className="relative h-full w-full rounded-full scale-125"*/}
            {/*            src={pickleballIcon}*/}
            {/*            alt=""*/}
            {/*            aria-hidden="true"*/}
            {/*        />*/}
            {/*    </button>*/}
            {/*    <button*/}
            {/*        type="button"*/}
            {/*        aria-label="Профиль"*/}
            {/*        onClick={() => navigate("/profile")}*/}
            {/*        className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"*/}
            {/*    >*/}
            {/*        <GlassAvatar aria-hidden="true">*/}
            {/*            {avatarSrc && (*/}
            {/*                <GlassAvatarImage src={avatarSrc} alt="" />*/}
            {/*            )}*/}
            {/*            <GlassAvatarFallback>*/}
            {/*                {firstLetterUserName}*/}
            {/*            </GlassAvatarFallback>*/}
            {/*        </GlassAvatar>*/}
            {/*    </button>*/}
            {/*    /!*<button*!/*/}
            {/*    /!*    type="button"*!/*/}
            {/*    /!*    aria-label="Календарь"*!/*/}
            {/*    /!*    aria-current={pathname === "/profile" ? "page" : undefined}*!/*/}
            {/*    /!*    onClick={() => navigate("/profile")}*!/*/}
            {/*    /!*    className={buttonClassName}*!/*/}
            {/*    /!*>*!/*/}
            {/*    /!*    <ButtonHighlights />*!/*/}
            {/*    /!*    <Calendar*!/*/}
            {/*    /!*        className="relative"*!/*/}
            {/*    /!*        size={20}*!/*/}
            {/*    /!*        strokeWidth={1.8}*!/*/}
            {/*    /!*        aria-hidden="true"*!/*/}
            {/*    /!*    />*!/*/}
            {/*    /!*</button>*!/*/}
            {/*</nav>*/}
        </footer>
    );
}

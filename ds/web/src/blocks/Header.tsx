import { ComponentPropsWithoutRef } from 'react';
import { cn } from '../utils';
import pickleballIcon from '../assets/pickleball.svg';

export interface HeaderProps extends ComponentPropsWithoutRef<'header'> {
    onNotificationsClick?: () => void;
    hasNotifications?: boolean;
}

export function Header({ onNotificationsClick, hasNotifications = false, className, ...props }: HeaderProps) {
    return (
        <header className={cn('ds-glass ds-header-glass w-full rounded-2xl border text-ds-text', className)} {...props}>
            <div className="flex items-center justify-center min-h-16 w-full max-w-lg">
                {/*<button*/}
                {/*    type="button"*/}
                {/*    aria-label={hasNotifications ? 'Уведомления, есть новые' : 'Уведомления'}*/}
                {/*    onClick={onNotificationsClick}*/}
                {/*    className={cn(*/}
                {/*        'relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/20',*/}
                {/*        'bg-white/15 backdrop-blur-xl transition-all duration-200 ease-out hover:bg-white/25',*/}
                {/*        'shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)]',*/}
                {/*        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent'*/}
                {/*    )}*/}
                {/*>*/}
                {/*    <span*/}
                {/*        aria-hidden="true"*/}
                {/*        className="pointer-events-none absolute inset-0 rounded-xl bg-linear-to-b from-white/20 to-transparent"*/}
                {/*    />*/}
                {/*    <span*/}
                {/*        aria-hidden="true"*/}
                {/*        className="pointer-events-none absolute inset-0 rounded-xl bg-linear-to-tr from-transparent to-white/10"*/}
                {/*    />*/}
                {/*    <Bell className="relative" size={20} strokeWidth={1.8} aria-hidden="true" />*/}
                {/*    {hasNotifications && (*/}
                {/*        <div*/}
                {/*            data-dock-active-indicator=""*/}
                {/*            aria-hidden="true"*/}
                {/*            className={cn(*/}
                {/*                'absolute w-2 h-2 rounded-full',*/}
                {/*                'bg-linear-to-r from-pink-400 to-red-400',*/}
                {/*                'shadow-[0_0_8px_rgba(6,182,212,0.8),0_0_16px_rgba(6,182,212,0.4)] right-1 top-1'*/}
                {/*            )}*/}
                {/*        />*/}
                {/*    )}*/}
                {/*</button>*/}
                <div className={'flex flex-col gap-0.5'}>
                    <span className="text-center text-s font-light" style={{ letterSpacing: '10px' }}>
                        PICKLEHUB
                    </span>
                    <span className={'text-center text-2xs'}>x</span>
                    <span
                        className={'flex justify-center items-center text-center text-s font-light'}
                        style={{ letterSpacing: '2px' }}
                    >
                        PR
                        <span className={'inline-block mr-1'}>
                            <img
                                className="h-[14px] w-[14px] rounded-full"
                                src={pickleballIcon}
                                alt="pickleball"
                                aria-hidden="true"
                            />
                        </span>{' '}
                        PICKLEBALL
                    </span>
                </div>
            </div>
        </header>
    );
}

import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { cn } from '../utils';

export interface SpaceProps extends HTMLAttributes<HTMLDivElement> {
    /** Inner spacing. Numbers are pixels; strings accept CSS padding values. */
    padding?: CSSProperties['padding'];
    /** Corner radius. Numbers are pixels; strings accept CSS border-radius values. */
    borderRadius?: CSSProperties['borderRadius'];
}

export const Space = forwardRef<HTMLDivElement, SpaceProps>(
    ({ children, padding = 24, borderRadius = 16, className, style, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('relative isolate', className)}
            style={{ padding, borderRadius, ...style }}
            {...props}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 -z-20 rounded-[inherit] bg-linear-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 blur-xl opacity-70"
            />
            <div
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute inset-0 -z-10 rounded-[inherit] border border-white/20',
                    'bg-white/10 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.37)]',
                    'before:absolute before:inset-0 before:rounded-[inherit]',
                    'before:bg-linear-to-b before:from-white/20 before:to-transparent',
                    'after:absolute after:inset-0 after:rounded-[inherit]',
                    'after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                )}
            />
            {children}
        </div>
    )
);
Space.displayName = 'Space';

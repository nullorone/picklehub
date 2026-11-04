// Adapted from EIN UI (MIT), copyright (c) 2025 Ehsan Ghaffar. See ds/THIRD_PARTY_NOTICES.md.
'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../utils';

interface GlassWidgetBaseProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
    children: React.ReactNode;
    size?: 's' | 'sm' | 'md' | 'lg' | 'xl';
    glowEffect?: boolean;
    shadowEffect?: boolean;
    glowColor?: 'cyan' | 'purple' | 'blue' | 'pink' | 'green' | 'amber' | 'red';
    hoverScale?: boolean;
    interactive?: boolean;
}

const sizeClasses = {
    xs: 'p-1',
    s: 'p-2',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
    xl: 'p-6',
};

const glowColors = {
    cyan: 'from-cyan-500/30 via-blue-500/30 to-purple-500/30',
    purple: 'from-purple-500/30 via-pink-500/30 to-purple-500/30',
    blue: 'from-blue-500/30 via-indigo-500/30 to-blue-500/30',
    pink: 'from-pink-500/30 via-rose-500/30 to-pink-500/30',
    green: 'from-emerald-500/30 via-teal-500/30 to-emerald-500/30',
    amber: 'from-amber-500/30 via-orange-500/30 to-amber-500/30',
    red: 'from-red-500/30 via-rose-500/30 to-red-500/30',
};

const GlassWidgetBase = React.forwardRef<HTMLDivElement, GlassWidgetBaseProps>(
    (
        {
            className,
            children,
            size = 'md',
            glowEffect = true,
            glowColor = 'cyan',
            shadowEffect,
            hoverScale = true,
            interactive = true,
            ...props
        },
        ref
    ) => {
        // Keep legacy animation options out of DOM props while animations are disabled.
        void hoverScale;
        void interactive;
        return (
            <motion.div
                className="relative h-full"
                initial="false"
                // animate="false"
                // whileHover={interactive && hoverScale ? 'hover' : undefined}
            >
                {/* Glow effect */}
                {glowEffect && (
                    <motion.div
                        className={cn('absolute -inset-0.5 rounded-2xl bg-linear-to-r blur-xl', glowColors[glowColor])}
                        initial="false"
                        // animate="false"
                        // whileHover={interactive ? 'hover' : undefined}
                        aria-hidden="true"
                    />
                )}

                {/* Widget container */}
                <motion.div
                    ref={ref}
                    className={cn(
                        'relative h-full rounded-2xl border border-white/20',
                        'flex items-center justify-center',
                        !shadowEffect && [
                            'bg-white/10 backdrop-blur-xl',
                            'shadow-[0_8px_32px_rgba(0,0,0,0.37)]',
                            // Inner highlight linear
                            'before:absolute before:inset-0 before:rounded-2xl',
                            'before:bg-linear-to-b before:from-white/20 before:to-transparent before:pointer-events-none',
                            // Inner shadow for depth
                            'after:absolute after:inset-px after:rounded-[calc(1rem-1px)]',
                            'after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] after:pointer-events-none',
                        ],
                        sizeClasses[size],
                        className
                    )}
                    role="article"
                    {...props}
                >
                    <div className="relative z-10 h-full">{children}</div>
                </motion.div>
            </motion.div>
        );
    }
);
GlassWidgetBase.displayName = 'GlassWidgetBase';

export { GlassWidgetBase };
export type { GlassWidgetBaseProps };

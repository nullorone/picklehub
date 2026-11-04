// Adapted from EIN UI (MIT), copyright (c) 2025 Ehsan Ghaffar. See ds/THIRD_PARTY_NOTICES.md.
'use client';

import * as React from 'react';
import { cn } from '../utils';

interface GlassGaugeProps extends React.HTMLAttributes<HTMLDivElement> {
    value: number;
    max?: number;
    size?: 'xxs' | 'xs' | 's' | 'sm' | 'md' | 'lg';
    showValue?: boolean;
    label?: string;
    colorScheme?: 'cyan' | 'purple' | 'green' | 'orange' | 'gradient' | 'gradient-progress';
    animated?: boolean;
    text?: string;
}

const sizes = {
    xxs: { size: 20, strokeWidth: 2, fontSize: 'text-2xs' },
    xs: { size: 35, strokeWidth: 4, fontSize: 'text-xs' },
    s: { size: 60, strokeWidth: 6, fontSize: 'text-s' },
    sm: { size: 100, strokeWidth: 8, fontSize: 'text-lg' },
    md: { size: 150, strokeWidth: 10, fontSize: 'text-2xl' },
    lg: { size: 200, strokeWidth: 12, fontSize: 'text-4xl' },
};

const colorSchemes = {
    cyan: { stroke: 'stroke-cyan-500', glow: 'from-cyan-500/40 to-blue-500/40' },
    purple: { stroke: 'stroke-purple-500', glow: 'from-purple-500/40 to-pink-500/40' },
    green: { stroke: 'stroke-emerald-500', glow: 'from-emerald-500/40 to-teal-500/40' },
    orange: { stroke: 'stroke-orange-500', glow: 'from-orange-500/40 to-amber-500/40' },
    gradient: { stroke: '', glow: 'from-cyan-500/40 via-blue-500/40 to-purple-500/40' },
};

const progressGradients = {
    red: { stops: ['#d9a0a0', '#c98282', '#b96b6b'], glow: 'from-red-300/20 to-rose-400/20' },
    yellow: { stops: ['#e2d5a1', '#d4be7c', '#c6aa60'], glow: 'from-yellow-200/20 to-amber-300/20' },
    green: { stops: ['#a8cfb5', '#87b99a', '#6aa381'], glow: 'from-green-200/20 to-emerald-300/20' },
};

const GlassGauge = React.forwardRef<HTMLDivElement, GlassGaugeProps>(
    (
        {
            className,
            value,
            max = 100,
            size = 'md',
            showValue = true,
            label,
            colorScheme = 'cyan',
            animated = true,
            text,
            ...props
        },
        ref
    ) => {
        const [displayValue, setDisplayValue] = React.useState(0);
        const config = sizes[size];
        const progressGradient = progressGradients[value < 40 ? 'red' : value < 80 ? 'yellow' : 'green'];
        const colors =
            colorScheme === 'gradient-progress'
                ? { stroke: '', glow: progressGradient.glow }
                : colorSchemes[colorScheme];
        const isGradient = colorScheme === 'gradient' || colorScheme === 'gradient-progress';
        const gradientStops =
            colorScheme === 'gradient-progress' ? progressGradient.stops : ['#06b6d4', '#3b82f6', '#a855f7'];
        const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

        const radius = (config.size - config.strokeWidth) / 2;
        const circumference = radius * 2 * Math.PI;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;

        React.useEffect(() => {
            if (!animated) {
                setDisplayValue(value);
                return;
            }

            const duration = 1000;
            const steps = 60;
            const increment = value / steps;
            let current = 0;
            let step = 0;

            const timer = setInterval(() => {
                step++;
                current = Math.min(current + increment, value);
                setDisplayValue(Math.round(current));

                if (step >= steps) {
                    clearInterval(timer);
                    setDisplayValue(value);
                }
            }, duration / steps);

            return () => clearInterval(timer);
        }, [value, animated]);

        const gradientId = React.useId();

        return (
            <div ref={ref} className={cn('relative inline-flex flex-col items-center', className)} {...props}>
                {/* Glow effect */}
                <div
                    className={cn('absolute rounded-full bg-linear-to-r blur-xl opacity-60', colors.glow)}
                    style={{
                        width: config.size * 0.8,
                        height: config.size * 0.8,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                    }}
                />

                <div className="relative" style={{ width: config.size, height: config.size }}>
                    <svg width={config.size} height={config.size} className="transform -rotate-90">
                        {/* Gradient definition */}
                        {isGradient && (
                            <defs>
                                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={gradientStops[0]} />
                                    <stop offset="50%" stopColor={gradientStops[1]} />
                                    <stop offset="100%" stopColor={gradientStops[2]} />
                                </linearGradient>
                            </defs>
                        )}

                        {/* Background track */}
                        <circle
                            cx={config.size / 2}
                            cy={config.size / 2}
                            r={radius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={config.strokeWidth}
                            className="text-white/10"
                        />

                        {/* Glass reflection on track */}
                        <circle
                            cx={config.size / 2}
                            cy={config.size / 2}
                            r={radius - config.strokeWidth / 2}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1}
                            className="text-white/5"
                        />

                        {/* Progress arc */}
                        <circle
                            cx={config.size / 2}
                            cy={config.size / 2}
                            r={radius}
                            fill="none"
                            stroke={isGradient ? `url(#${gradientId})` : undefined}
                            strokeWidth={config.strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className={cn('transition-all duration-1000 ease-out', !isGradient && colors.stroke)}
                        />
                    </svg>

                    {/* Center content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {showValue && (
                            <>
                                {text ? (
                                    <span className={cn('font-bold text-white', config.fontSize)}>{text}</span>
                                ) : (
                                    <span className={cn('font-bold text-white', config.fontSize)}>
                                        {displayValue}
                                        <span className="text-white/40 text-sm">%</span>
                                    </span>
                                )}
                            </>
                        )}
                        {label && <span className="text-white/60 text-sm">{label}</span>}
                    </div>
                </div>
            </div>
        );
    }
);
GlassGauge.displayName = 'GlassGauge';

export { GlassGauge };

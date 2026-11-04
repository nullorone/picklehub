'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Onboarding.module.css';

export type OnboardingPlacement = 'top' | 'bottom' | 'left' | 'right';
export type OnboardingArrowPosition = 'left' | 'center' | 'right';

export interface OnboardingStep {
    content: ReactNode;
    /** Preferred side; flips or shifts when there is insufficient viewport space. */
    placement?: OnboardingPlacement;
    /** Defaults to center; left/right place the tip 15px from the edge (top/bottom on vertical sides). */
    arrowPosition?: OnboardingArrowPosition;
    padding?: number;
    borderRadius?: number;
}

export interface OnboardingProps {
    /** steps[0] describes data-onboarding="1", steps[1] describes "2", etc. */
    steps: readonly OnboardingStep[];
    open?: boolean;
    /** Called on dismissal or completion of the last step. */
    onClose?: () => void;
}

interface Geometry {
    x: number;
    y: number;
    width: number;
    height: number;
    tooltipX: number;
    tooltipY: number;
    side: OnboardingPlacement;
}

const MARGIN = 12;
const GAP = 12;

export function Onboarding({ open = true, steps, onClose }: OnboardingProps) {
    return open && steps.length > 0 ? <OnboardingTour steps={steps} onClose={onClose} /> : null;
}

function OnboardingTour({ steps, onClose }: Omit<OnboardingProps, 'open'>) {
    const [stepIndex, setStepIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const step = steps[stepIndex];
    const active = !dismissed && !!step;
    const { placement = 'bottom', arrowPosition = 'center', padding = 8, borderRadius = 12 } = step ?? {};
    const close = () => {
        setDismissed(true);
        onClose?.();
    };
    const id = useId();
    const maskId = `onboarding-mask-${id.replace(/:/g, '')}`;
    const descriptionId = `onboarding-description-${id.replace(/:/g, '')}`;
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [geometry, setGeometry] = useState<Geometry | null>(null);

    useLayoutEffect(() => {
        if (!active) return;
        let frame = 0;
        let describedElement: HTMLElement | null = null;
        const detachDescription = () => {
            if (!describedElement) return;
            const remaining = (describedElement.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .filter((value) => value && value !== descriptionId);
            if (remaining.length) describedElement.setAttribute('aria-describedby', remaining.join(' '));
            else describedElement.removeAttribute('aria-describedby');
            describedElement = null;
        };
        const measure = () => {
            const element = document.querySelector<HTMLElement>(`[data-onboarding="${stepIndex + 1}"]`);
            const rect = element?.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight;
            const visible =
                rect &&
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < viewportHeight &&
                rect.left < viewportWidth &&
                getComputedStyle(element!).visibility !== 'hidden';
            if (!visible) {
                detachDescription();
                setGeometry((previous) => (previous === null ? previous : null));
            } else {
                if (describedElement !== element) {
                    detachDescription();
                    describedElement = element!;
                    const existing = describedElement.getAttribute('aria-describedby');
                    describedElement.setAttribute(
                        'aria-describedby',
                        [existing, descriptionId].filter(Boolean).join(' ')
                    );
                }
                const inset = Number.isFinite(padding) ? Math.max(0, padding) : 8;
                const x = Math.max(0, rect.left - inset);
                const y = Math.max(0, rect.top - inset);
                const width = Math.min(viewportWidth, rect.right + inset) - x;
                const height = Math.min(viewportHeight, rect.bottom + inset) - y;
                const tip = tooltipRef.current?.getBoundingClientRect();
                const tipWidth = tip?.width ?? Math.min(320, viewportWidth - MARGIN * 2);
                const tipHeight = tip?.height ?? 100;
                const space = {
                    top: y - GAP - MARGIN,
                    bottom: viewportHeight - y - height - GAP - MARGIN,
                    left: x - GAP - MARGIN,
                    right: viewportWidth - x - width - GAP - MARGIN,
                };
                const opposite = {
                    top: 'bottom',
                    bottom: 'top',
                    left: 'right',
                    right: 'left',
                } as const;
                const needed = placement === 'top' || placement === 'bottom' ? tipHeight : tipWidth;
                const side =
                    space[placement] < needed && space[opposite[placement]] > space[placement]
                        ? opposite[placement]
                        : placement;
                let tooltipX = x + (width - tipWidth) / 2;
                let tooltipY = y + (height - tipHeight) / 2;
                if (side === 'top') tooltipY = y - GAP - tipHeight;
                if (side === 'bottom') tooltipY = y + height + GAP;
                if (side === 'left') tooltipX = x - GAP - tipWidth;
                if (side === 'right') tooltipX = x + width + GAP;
                const next: Geometry = {
                    x,
                    y,
                    width,
                    height,
                    side,
                    tooltipX: Math.max(MARGIN, Math.min(viewportWidth - tipWidth - MARGIN, tooltipX)),
                    tooltipY: Math.max(MARGIN, Math.min(viewportHeight - tipHeight - MARGIN, tooltipY)),
                };
                setGeometry((previous) =>
                    previous &&
                    Object.keys(next).every((key) => previous[key as keyof Geometry] === next[key as keyof Geometry])
                        ? previous
                        : next
                );
            }
            // Tracks scrolling, layout shifts, animations and targets mounted asynchronously.
            frame = requestAnimationFrame(measure);
        };
        measure();
        return () => {
            cancelAnimationFrame(frame);
            detachDescription();
        };
    }, [active, stepIndex, padding, placement, descriptionId]);

    useLayoutEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setDismissed(true);
                onClose?.();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [active, onClose]);

    if (!active || !geometry || typeof document === 'undefined') return null;

    return createPortal(
        <div className={styles.root}>
            <svg className={styles.mask} aria-hidden="true" width="100%" height="100%">
                <defs>
                    <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                        <rect width="100%" height="100%" fill="white" />
                        <rect
                            x={geometry.x}
                            y={geometry.y}
                            width={geometry.width}
                            height={geometry.height}
                            rx={borderRadius}
                            fill="black"
                        />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgb(0 0 0 / 70%)" mask={`url(#${maskId})`} />
            </svg>
            <div
                ref={tooltipRef}
                className={styles.tooltip}
                role="dialog"
                aria-label="Подсказка обучения"
                aria-describedby={descriptionId}
                data-placement={geometry.side}
                data-arrow-position={arrowPosition}
                style={{ left: geometry.tooltipX, top: geometry.tooltipY }}
            >
                <div className={styles.body}>
                    <button type="button" className={styles.close} onClick={close} aria-label="Закрыть подсказку">
                        ×
                    </button>
                    <div id={descriptionId} aria-live="polite">
                        {step.content}
                    </div>
                    <div className={styles.navigation}>
                        <span className={styles.counter}>
                            {stepIndex + 1} / {steps.length}
                        </span>
                        <button
                            type="button"
                            className={styles.navigationButton}
                            disabled={stepIndex === 0}
                            onClick={() => setStepIndex((index) => index - 1)}
                        >
                            Назад
                        </button>
                        <button
                            type="button"
                            className={styles.navigationButton}
                            onClick={() =>
                                stepIndex === steps.length - 1 ? close() : setStepIndex((index) => index + 1)
                            }
                        >
                            {stepIndex === steps.length - 1 ? 'Готово' : 'Далее'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

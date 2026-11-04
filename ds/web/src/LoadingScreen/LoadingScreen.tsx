'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import pickleball from '../assets/pickleball.svg';
import styles from './LoadingScreen.module.css';
import { cn } from '../utils';

export interface LoadingScreenProps {
    /** Fixed overlay covering the viewport; otherwise fills its parent with a 240px minimum height. */
    fullScreen?: boolean;
    backgroundColor?: string;
    /** Background opacity from 0 to 1; does not affect the ball or text. */
    backgroundOpacity?: number;
    /** Image URL; also used as the video poster when both URLs are supplied. */
    backgroundImage?: string;
    /** Muted looping video URL, displayed over the background color/image. */
    backgroundVideo?: string;
    text?: ReactNode;
    className?: string;
    style?: CSSProperties;
}

export function LoadingScreen({
    fullScreen = false,
    backgroundColor = 'var(--ds-background, #101827)',
    backgroundOpacity = 1,
    backgroundImage,
    backgroundVideo,
    text = 'Загрузка…',
    className,
    style,
}: LoadingScreenProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updatePlayback = () => {
            if (preference.matches) video.pause();
            else void video.play().catch(() => undefined);
        };
        updatePlayback();
        preference.addEventListener('change', updatePlayback);
        return () => {
            preference.removeEventListener('change', updatePlayback);
            video.pause();
        };
    }, [backgroundVideo]);

    return (
        <div
            className={cn(fullScreen && 'relative z-[99999]', styles.root, fullScreen && styles.fullScreen, className)}
            style={style}
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div
                className={styles.background}
                aria-hidden="true"
                style={{
                    backgroundColor,
                    opacity: Number.isFinite(backgroundOpacity) ? Math.min(1, Math.max(0, backgroundOpacity)) : 1,
                }}
            >
                {backgroundImage && <img className={styles.media} src={backgroundImage} alt="" />}
                {backgroundVideo && (
                    <video
                        ref={videoRef}
                        className={styles.media}
                        src={backgroundVideo}
                        poster={backgroundImage}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        tabIndex={-1}
                    />
                )}
            </div>
            <div className={styles.content}>
                <div className={styles.animation} aria-hidden="true">
                    <span className={styles.shadow} />
                    <img className={styles.ball} src={pickleball} alt="" draggable={false} />
                </div>
                <div className={styles.text}>{text}</div>
            </div>
        </div>
    );
}

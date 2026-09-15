export type ViewabilityScheduler = (callback: () => void, delayMilliseconds: number) => () => void;

const browserScheduler: ViewabilityScheduler = (callback, delayMilliseconds) => {
    const timer = window.setTimeout(callback, delayMilliseconds);
    return () => {
        window.clearTimeout(timer);
    };
};

export function createViewabilityTracker(
    record: (visiblePercent: number) => void,
    schedule: ViewabilityScheduler = browserScheduler
) {
    let cancel: (() => void) | undefined;
    let sent = false;
    return {
        stop() {
            cancel?.();
            cancel = undefined;
        },
        update(intersectionRatio: number, foreground: boolean) {
            cancel?.();
            cancel = undefined;
            if (sent || !foreground || intersectionRatio < 0.5) return;
            cancel = schedule(() => {
                if (sent) return;
                sent = true;
                record(Math.max(50, Math.floor(intersectionRatio * 100)));
            }, 1000);
        },
    };
}

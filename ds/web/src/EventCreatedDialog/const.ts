export const eventDateOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
} satisfies Intl.DateTimeFormatOptions;

export const eventTimeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
} satisfies Intl.DateTimeFormatOptions;

export const confettiOptions = {
    particleCount: 55,
    spread: 65,
    startVelocity: 42,
    gravity: 0.9,
    ticks: 180,
    scalar: 0.9,
    colors: ['#22d3ee', '#3b82f6', '#a855f7', '#fcd34d'],
    disableForReducedMotion: true,
};

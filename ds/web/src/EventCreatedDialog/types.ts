export interface EventCreatedDialogProps {
    open: boolean;
    startsAt: string;
    timeZone?: string;
    shareMessage?: string;
    onClose: () => void;
    onShare: () => void;
}

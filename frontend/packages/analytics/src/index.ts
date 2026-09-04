import type { ClientChannel } from '@picklehub/domain';

export type FoundationAnalyticsEvent =
    | { readonly name: 'platform.shell_viewed.v1'; readonly channel: ClientChannel }
    | { readonly name: 'platform.connectivity_changed.v1'; readonly channel: ClientChannel; readonly online: boolean };

export interface AnalyticsPort {
    track(event: FoundationAnalyticsEvent): void;
}

export const disabledAnalytics: AnalyticsPort = {
    track: () => undefined,
};

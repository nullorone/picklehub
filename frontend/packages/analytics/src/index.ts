import type { ClientChannel } from '@picklehub/domain';

export type AnalyticsEvent =
    | { readonly name: 'platform.shell_viewed.v1'; readonly channel: ClientChannel }
    | { readonly name: 'platform.connectivity_changed.v1'; readonly channel: ClientChannel; readonly online: boolean }
    | {
          readonly name: 'onboarding_error_shown';
          readonly channel: ClientChannel;
          readonly reason: 'VALIDATION' | 'CONFLICT' | 'OFFLINE' | 'TEMPORARY';
          readonly step: 'PROFILE' | 'PREFERENCES' | 'CONSENTS';
      }
    | {
          readonly name: 'venue_selected';
          readonly channel: ClientChannel;
          readonly surface: 'MAP' | 'LIST' | 'TEXT';
          readonly distanceBucket: 'LT_1KM' | '1_5KM' | '5_20KM' | 'GE_20KM' | 'UNKNOWN';
      };

export interface AnalyticsPort {
    track(event: AnalyticsEvent): void;
}

export const disabledAnalytics: AnalyticsPort = {
    track: () => undefined,
};

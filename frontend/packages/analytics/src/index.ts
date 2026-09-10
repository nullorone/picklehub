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
      }
    | {
          readonly name: 'match_viewed';
          readonly channel: ClientChannel;
          readonly entry: 'SEARCH' | 'INVITE';
          readonly format: 'SINGLES' | 'DOUBLES';
          readonly visibility: 'PUBLIC' | 'UNLISTED';
      }
    | {
          readonly name: 'chat_opened';
          readonly channel: ClientChannel;
          readonly entry: 'MATCH' | 'NOTIFICATION';
          readonly unreadBucket: 'ZERO' | 'ONE_FIVE' | 'SIX_TWENTY' | 'GT_20';
      }
    | {
          readonly name: 'chat_resync_required';
          readonly reason: 'CURSOR_EXPIRED' | 'RETENTION' | 'GAP_LIMIT';
      }
    | {
          readonly name: 'notification_opened';
          readonly ageBucket: 'LT_5M' | '5M_1H' | 'GT_1H';
          readonly category: 'ROSTER' | 'REQUESTS' | 'MATCH_CRITICAL' | 'REMINDERS' | 'RESULTS' | 'CHAT';
          readonly channel: 'IN_APP' | 'TELEGRAM' | 'EMAIL';
      };

export interface AnalyticsPort {
    track(event: AnalyticsEvent): void;
}

export const disabledAnalytics: AnalyticsPort = {
    track: () => undefined,
};

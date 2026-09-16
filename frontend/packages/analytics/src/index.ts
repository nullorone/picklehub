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
          readonly channel: 'IN_APP' | 'TELEGRAM' | 'EMAIL' | 'PUSH';
      }
    | {
          readonly name: 'profile_viewed';
          readonly entry: 'MATCH' | 'HISTORY' | 'DIRECT';
          readonly ownership: 'SELF' | 'OTHER';
          readonly visibility: 'PUBLIC' | 'PRIVATE_SELF';
      }
    | {
          readonly name: 'match_history_opened';
          readonly ownership: 'SELF' | 'OTHER';
          readonly resultBucket: 'ZERO' | 'ONE_FIVE' | 'SIX_TWENTY' | 'GT_TWENTY';
      }
    | {
          readonly name: 'statistics_viewed';
          readonly format: 'ALL' | 'SINGLES' | 'DOUBLES';
          readonly ownership: 'SELF' | 'OTHER';
          readonly state: 'EMPTY' | 'AVAILABLE' | 'UPDATING';
      }
    | {
          readonly name: 'dupr_link_opened';
          readonly ownership: 'SELF' | 'OTHER';
          readonly surface: 'PROFILE';
      }
    | {
          readonly name: 'club_search_completed';
          readonly channel: ClientChannel;
          readonly filter: 'NONE' | 'LOCALITY' | 'VENUE';
          readonly resultBucket: 'ZERO' | 'ONE_FIVE' | 'SIX_TWENTY' | 'GT_TWENTY';
      }
    | {
          readonly name: 'mini_game_started';
          readonly channel: ClientChannel;
          readonly mode: 'STANDARD' | 'CALM';
          readonly connectivity: 'ONLINE';
          readonly entryClass: 'DIRECT';
      }
    | {
          readonly name: 'mini_game_completed';
          readonly channel: ClientChannel;
          readonly mode: 'STANDARD' | 'CALM';
          readonly durationBucket: 'TURN_BASED' | '60_120S';
          readonly rewardOutcomeClass: 'GRANTED' | 'CAPPED_OR_EMPTY' | 'REJECTED' | 'UNAVAILABLE';
      }
    | {
          readonly name: 'mini_game_exit_intent';
          readonly channel: ClientChannel;
          readonly stage: 'ENTRY' | 'ACTIVE' | 'PAUSED' | 'RESULT';
          readonly reasonClass: 'USER';
      };

export interface AnalyticsPort {
    track(event: AnalyticsEvent): void;
}

export const disabledAnalytics: AnalyticsPort = {
    track: () => undefined,
};

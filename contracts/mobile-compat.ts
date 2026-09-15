import type { WebSocketMessage } from './generated/asyncapi';
import type { components, operations } from './generated/openapi';

type NativeSession = components['schemas']['NativeAuthenticatedSession'];
type RegisterPushToken = components['schemas']['RegisterPushToken'];
type RealtimeTicket = components['schemas']['RealtimeTicket'];

export interface ExpoContractSurface {
    readonly consumeMagicLink: operations['consumeNativeMagicLink'];
    readonly refreshSession: operations['refreshNativeSession'];
    readonly registerPush: operations['registerPushToken'];
    readonly revokePush: operations['revokePushRegistration'];
    readonly createRealtimeTicket: operations['createRealtimeTicket'];
    readonly nativeSession: NativeSession;
    readonly pushInput: RegisterPushToken;
    readonly realtimeTicket: RealtimeTicket;
    readonly websocketMessage: WebSocketMessage;
}

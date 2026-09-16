import type { components } from '@picklehub/api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { MobileApiClient } from '../api/mobile-client';
import { uuidV4 } from '../platform/uuid';

type Schemas = components['schemas'];
const installationKey = 'picklehub.mobile.installation.v1';

export async function requestAndRegisterPush(
    api: MobileApiClient,
    environment: Schemas['PushEnvironment']
): Promise<'REGISTERED' | 'DENIED' | 'UNAVAILABLE'> {
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'DENIED';

    // Provider integration is fail-closed until runtime config explicitly enables it.
    const deviceToken = await Notifications.getDevicePushTokenAsync().catch(() => null);
    if (deviceToken === null || typeof deviceToken.data !== 'string') return 'UNAVAILABLE';
    let installationId = await AsyncStorage.getItem(installationKey);
    if (installationId === null) {
        installationId = uuidV4();
        await AsyncStorage.setItem(installationKey, installationId);
    }
    await api.authenticatedCall('/notification-devices', {
        body: { installationId, platform: 'MOBILE' },
        idempotencyKey: uuidV4(),
        method: 'POST',
    });
    await api.authenticatedCall(`/notification-devices/${installationId}/push-registrations`, {
        body: {
            appVersion: Application.nativeApplicationVersion ?? '0.1.0',
            environment,
            operatingSystem: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
            token: deviceToken.data,
        },
        idempotencyKey: uuidV4(),
        method: 'POST',
    });
    return 'REGISTERED';
}

export async function clearLocalPushState(): Promise<void> {
    await AsyncStorage.removeItem(installationKey);
    await Notifications.setBadgeCountAsync(0).catch(() => false);
}

import { createContext, useContext } from 'react';

import type { MobileApiClient } from './api/mobile-client';
import type { ReadCache } from './cache/read-cache';

export interface AppServices {
    readonly api: MobileApiClient;
    readonly cache: ReadCache;
    readonly onLogout: () => Promise<void>;
    readonly online: boolean;
    readonly userId: string;
}

export const AppContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
    const value = useContext(AppContext);
    if (value === null) throw new Error('App services are unavailable.');
    return value;
}

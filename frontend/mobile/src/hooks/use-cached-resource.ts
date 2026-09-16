import { useCallback, useEffect, useState } from 'react';

import { useAppServices } from '../app-context';
import type { CacheSensitivity, ResourceKind } from '../cache/read-cache';

export interface ResourceState<T> {
    readonly error?: string;
    readonly loading: boolean;
    readonly refresh: () => void;
    readonly staleAt?: string;
    readonly value?: T;
}

function isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
}

export function useCachedResource<T>(
    resourceKind: ResourceKind,
    sensitivity: CacheSensitivity,
    load: () => Promise<T>,
    resourceId = 'index'
): ResourceState<T> {
    const { cache, online, userId } = useAppServices();
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState<Omit<ResourceState<T>, 'refresh'>>({ loading: true });
    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            const cached = await cache.get<T>(userId, resourceKind, resourceId);
            if (isAborted(controller.signal)) return;
            if (cached !== null) setState({ loading: online, staleAt: cached.fetchedAt, value: cached.value });
            if (!online) {
                setState((current) =>
                    cached === null
                        ? { ...current, error: 'Нет сохранённых данных.', loading: false }
                        : { loading: false, staleAt: cached.fetchedAt, value: cached.value }
                );
                return;
            }
            try {
                const value = await load();
                await cache.set(userId, resourceKind, sensitivity, value, resourceId);
                if (!isAborted(controller.signal)) setState({ loading: false, value });
            } catch {
                if (!isAborted(controller.signal))
                    setState((current) => ({ ...current, error: 'Не удалось обновить данные.', loading: false }));
            }
        })();
        return () => {
            controller.abort();
        };
    }, [cache, load, online, resourceId, resourceKind, revision, sensitivity, userId]);
    const refresh = useCallback(() => {
        setRevision((value) => value + 1);
    }, []);
    return { ...state, refresh };
}

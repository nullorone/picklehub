import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export interface RequestContext {
    requestId: string;
    correlationId: string;
    locale: 'ru-RU';
}

@Injectable()
export class RequestContextService {
    private readonly storage = new AsyncLocalStorage<RequestContext>();

    run<T>(context: RequestContext, callback: () => T): T {
        return this.storage.run(context, callback);
    }

    get(): RequestContext | undefined {
        return this.storage.getStore();
    }
}

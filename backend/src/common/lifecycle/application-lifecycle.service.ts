import { Injectable } from '@nestjs/common';

@Injectable()
export class ApplicationLifecycleService {
    private acceptingTraffic = true;

    isAcceptingTraffic(): boolean {
        return this.acceptingTraffic;
    }

    beginShutdown(): void {
        this.acceptingTraffic = false;
    }
}

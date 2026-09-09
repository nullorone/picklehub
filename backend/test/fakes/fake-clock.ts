import { Clock } from '../../src/identity/clock';

export class FakeClock extends Clock {
    constructor(private current: Date) {
        super();
    }

    now(): Date {
        return new Date(this.current);
    }

    advance(milliseconds: number): void {
        this.current = new Date(this.current.getTime() + milliseconds);
    }
}

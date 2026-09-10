import { EmailProvider, type MagicEmail } from '../../src/identity/email-provider';

export class FakeEmailProvider extends EmailProvider {
    readonly messages: MagicEmail[] = [];

    sendMagicLink(message: MagicEmail): Promise<void> {
        this.messages.push(message);
        return Promise.resolve();
    }
}

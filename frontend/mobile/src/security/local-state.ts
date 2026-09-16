import { clearLocalPushState } from '../push/push-registration';

export async function purgeAccountLocalState(): Promise<void> {
    await clearLocalPushState();
}

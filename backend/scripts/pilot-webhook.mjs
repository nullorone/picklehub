import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const [action, apiOrigin] = process.argv.slice(2);
if (!['set', 'delete', 'info'].includes(action) || (action === 'set' && !apiOrigin)) {
    process.stderr.write('Usage: npm run pilot:webhook -- set <https-api-origin> | delete | info\n');
    process.exitCode = 2;
} else {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || (action === 'set' && !/^[A-Za-z0-9_-]{1,256}$/.test(secret ?? ''))) {
        process.stderr.write('Configure TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in backend/.env\n');
        process.exitCode = 2;
    } else {
        let webhookUrl;
        if (action === 'set') {
            try {
                const parsed = new URL(apiOrigin);
                if (parsed.protocol !== 'https:' || parsed.origin !== apiOrigin) throw new Error('Invalid origin');
                webhookUrl = `${parsed.origin}/telegram/webhook`;
            } catch {
                process.stderr.write('Expected an HTTPS API origin without a path, query or fragment\n');
                process.exitCode = 2;
            }
        }
        if (process.exitCode !== 2) {
            const method = action === 'set' ? 'setWebhook' : action === 'delete' ? 'deleteWebhook' : 'getWebhookInfo';
            const body =
                action === 'set'
                    ? {
                          url: webhookUrl,
                          secret_token: secret,
                          allowed_updates: ['message'],
                      }
                    : action === 'delete'
                      ? { drop_pending_updates: false }
                      : undefined;
            try {
                const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body ?? {}),
                    signal: AbortSignal.timeout(10000),
                });
                const result = await response.json();
                if (!response.ok || result.ok !== true) throw new Error('Telegram API rejected the request');
                if (action === 'info') {
                    process.stdout.write(
                        `${JSON.stringify({ url: result.result?.url ?? '', pendingUpdateCount: result.result?.pending_update_count ?? 0 })}\n`
                    );
                } else {
                    process.stdout.write(`Webhook ${action === 'set' ? 'registered' : 'removed'}\n`);
                }
            } catch {
                process.stderr.write('Webhook operation failed; check network access and bot configuration\n');
                process.exitCode = 1;
            }
        }
    }
}

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';
import { NotificationWorker } from './notification-worker.js';

async function main(): Promise<void> {
    const config = loadConfig(process.env);
    if (!config.telegramAppUrl) throw new Error('TELEGRAM_APP_URL must be configured for notifications');
    const prisma = new PrismaClient();
    await prisma.$connect();
    const worker = new NotificationWorker(prisma, config.telegramBotToken, config.telegramAppUrl);
    let stopping = false;
    process.once('SIGTERM', () => {
        stopping = true;
    });
    process.once('SIGINT', () => {
        stopping = true;
    });
    try {
        while (!stopping) {
            const worked = await worker.runOne();
            if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    process.stderr.write('Notification worker stopped after an internal error\n');
    process.exitCode = 1;
});

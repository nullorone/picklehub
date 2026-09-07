process.env.NODE_ENV = 'test';
process.env.APP_ROLE = 'api';
process.env.DATABASE_URL ??= 'postgresql://picklehub:picklehub@localhost:5432/picklehub?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
process.env.REDIS_NAMESPACE ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DEPENDENCY_TIMEOUT_MS = '1000';

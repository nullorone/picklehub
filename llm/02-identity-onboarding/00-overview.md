# Identity и onboarding: контекст

Один профиль связывает Telegram и email magic-link identities. Активация — завершённый onboarding. Обязательны display name, timezone, предпочтительная география, singles/doubles preference, самооценка уровня и согласия; DUPR — необязательная внешняя ссылка.

Telegram init data проверяется backend. Magic links одноразовые и хешируются. Web/TMA держат access token в памяти и rotating refresh token в HttpOnly cookie. Account linking требует повторного подтверждения обеих сторон.

Возраст и документы не проверяются. Premium, social OAuth и password auth не входят в scope.

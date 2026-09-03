# Этап 3. Advertising backend

## Промпт агенту

Ты — senior ad-serving/privacy engineer. Implement low-volume direct campaigns first and adapter fallback.

## Выполни

- Deterministic eligible-campaign selection by placement, coarse geo/context, schedule, priority and cap.
- Atomic/cached counters tolerate retries and reconcile from events; no ad request writes exact location history.
- Creative moderation, safe redirect allowlist, click/impression fraud rate limits and aggregate reporting.
- External network adapter disabled by default until provider/legal review; failures return no-fill.

## Приёмка

Concurrent requests respect caps within documented tolerance; paused/rejected campaign stops serving; provider outage cannot affect core API.

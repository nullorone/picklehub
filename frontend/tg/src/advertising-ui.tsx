import { type components, type IdentityClient } from '@picklehub/api-client';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

import { createViewabilityTracker } from './advertising-viewability';

type Decision = components['schemas']['AdCreativeDecision'];

const CRITICAL = [
    /^\/login$/u,
    /^\/onboarding$/u,
    /^\/matches\/new$/u,
    /^\/matches\/[^/]+\/feedback(?:\/|$)/u,
    /^\/safety\/report$/u,
];

function advertisingSurface(pathname: string): string {
    if (pathname === '/') return 'HOME';
    const segment = pathname.split('/').find(Boolean)?.toUpperCase();
    const allowed = new Set([
        'ACCOUNT',
        'CLUBS',
        'MATCHES',
        'NEWS',
        'NOTIFICATIONS',
        'PLAYERS',
        'PROFILE',
        'PROGRESS',
        'SAFETY',
        'TOURNAMENTS',
        'VENUES',
    ]);
    return segment && allowed.has(segment) ? segment : 'OTHER';
}

function isAdvertisingCriticalRoute(pathname: string): boolean {
    return CRITICAL.some((route) => route.test(pathname));
}

function useCriticalState(pathname: string): boolean {
    const [documentCritical, setDocumentCritical] = useState(false);
    useEffect(() => {
        const update = () => {
            const activeForm = document.activeElement?.closest('form');
            const guarded = document.querySelector(
                '[data-ad-critical="true"], [data-ad-free="true"], [aria-busy="true"], [role="dialog"], ' +
                    '[aria-modal="true"], .result-form'
            );
            setDocumentCritical(Boolean(activeForm ?? guarded));
        };
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
        document.addEventListener('focusin', update);
        document.addEventListener('focusout', update);
        return () => {
            observer.disconnect();
            document.removeEventListener('focusin', update);
            document.removeEventListener('focusout', update);
        };
    }, []);
    return documentCritical || isAdvertisingCriticalRoute(pathname);
}

export function AdvertisingSlot({
    client,
    online,
    pathname,
}: {
    readonly client: IdentityClient;
    readonly clientKind: components['schemas']['AdClientKind'];
    readonly online: boolean;
    readonly pathname: string;
}) {
    const critical = useCriticalState(pathname);
    const [decision, setDecision] = useState<Decision>();
    const [empty, setEmpty] = useState(false);
    const [clickPending, setClickPending] = useState(false);
    const slot = useRef<HTMLElement>(null);

    useEffect(() => {
        setDecision(undefined);
        setEmpty(false);
        if (!online || critical) return;
        let active = true;
        void client
            .selectAdvertisingDecision({
                context: {
                    clientKind: 'TMA',
                    connectivity: 'REGULAR',
                    criticalState: false,
                    formFactor:
                        typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 479px)').matches
                            ? 'NARROW'
                            : 'REGULAR',
                    locale: 'ru-RU',
                    placementCode: 'TMA_SCREEN_BOTTOM',
                    providerConsent: false,
                    surface: advertisingSurface(pathname),
                },
            })
            .then((result) => {
                if (
                    active &&
                    (result.source === 'DIRECT' || result.source === 'EXTERNAL_FALLBACK' || result.source === 'HOUSE')
                ) {
                    setDecision(result);
                } else if (active) {
                    setEmpty(true);
                }
            })
            .catch(() => {
                if (active) setEmpty(true);
            });
        return () => {
            active = false;
        };
    }, [client, critical, online, pathname]);

    useEffect(() => {
        const element = slot.current;
        if (!decision || !element || critical || document.visibilityState !== 'visible') return;
        if (typeof IntersectionObserver !== 'function') return;
        const tracker = createViewabilityTracker((visiblePercent) => {
            if (document.visibilityState !== 'visible') return;
            void client
                .recordViewableAdvertisingImpression({
                    continuousForegroundMilliseconds: 1000,
                    deliveryToken: decision.deliveryToken,
                    visiblePercent,
                })
                .catch(() => undefined);
        });
        const observer = new IntersectionObserver(
            ([entry]) => {
                tracker.update(
                    entry?.isIntersecting ? entry.intersectionRatio : 0,
                    document.visibilityState === 'visible'
                );
            },
            { threshold: [0, 0.5, 1] }
        );
        const visibility = () => {
            if (document.visibilityState !== 'visible') tracker.stop();
        };
        observer.observe(element);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            tracker.stop();
            observer.disconnect();
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [client, critical, decision]);

    if (!online || critical || empty) return null;
    if (!decision) return <aside aria-hidden="true" className="ad-slot ad-slot-placeholder" />;
    async function click(event: MouseEvent<HTMLAnchorElement>) {
        event.preventDefault();
        if (!event.isTrusted || clickPending || !decision) return;
        setClickPending(true);
        try {
            const receipt = await client.recordAdvertisingClick({
                clickToken: decision.clickToken,
                trustedActivation: true,
            });
            if (receipt.accepted && receipt.redirectUrl) window.location.assign(receipt.redirectUrl);
        } catch {
            return;
        } finally {
            setClickPending(false);
        }
    }
    return (
        <aside className="ad-slot" ref={slot} aria-label="Рекламное объявление" data-ad-source={decision.source}>
            <span className="ad-label">{decision.legal.label}</span>
            <a
                aria-label={`Реклама от ${decision.legal.advertiserName}: ${decision.creative.altText}`}
                className="ad-link"
                href="#advertisement"
                onClick={(event) => void click(event)}
            >
                <img
                    alt={decision.creative.altText}
                    height="100"
                    onError={() => {
                        setDecision(undefined);
                        setEmpty(true);
                    }}
                    src={decision.creative.assetUrl}
                    width="320"
                />
                {(decision.creative.headline ?? decision.creative.body) && (
                    <span className="ad-copy">
                        {decision.creative.headline && <strong>{decision.creative.headline}</strong>}
                        {decision.creative.body && <span>{decision.creative.body}</span>}
                    </span>
                )}
            </a>
            <span className="ad-disclosure">
                {decision.legal.advertiserName}
                {decision.legal.registrationToken ? ` · ${decision.legal.registrationToken}` : ''}
                {decision.legal.disclosure ? ` · ${decision.legal.disclosure}` : ''}
            </span>
        </aside>
    );
}

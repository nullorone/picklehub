import type { components, IdentityClient } from '@picklehub/api-client';
import { disabledAnalytics } from '@picklehub/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    initialEngine,
    moveAim,
    score,
    seedFrom,
    setAim,
    strike,
    type EngineState,
    type GameDirection,
    type GameMode,
} from './engine';

type GameSession = components['schemas']['GameSession'];
type GameProgress = components['schemas']['GameSeasonProgress'];
type GameRewardClaim = components['schemas']['GameRewardClaim'];
type Phase = 'LANDING' | 'TUTORIAL' | 'PLAYING' | 'PAUSED' | 'SUBMITTING' | 'RESULT';

export interface MiniGameScreenProps {
    readonly channel: 'web' | 'telegram';
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly onClose: () => void;
}

const directionLabel: Readonly<Record<GameDirection, string>> = {
    CENTER: 'по центру',
    LEFT: 'влево',
    RIGHT: 'вправо',
};
const cosmeticLabel: Readonly<Record<components['schemas']['GameCosmeticCode'], string>> = {
    BALL_COLOR: 'Цвет мяча',
    BALL_TRAIL: 'След мяча',
    GAME_PROFILE_FRAME: 'Рамка игрового профиля',
    SEASON_CARD_BACKGROUND: 'Фон сезонной карточки',
};

function randomNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function playTone(enabled: boolean): void {
    if (!enabled) return;
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 420;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.05);
    oscillator.addEventListener('ended', () => void context.close());
}

function CourtCanvas({ reducedMotion, state }: { readonly reducedMotion: boolean; readonly state: EngineState }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, 720, 400);
        context.fillStyle = '#145b49';
        context.fillRect(0, 0, 720, 400);
        context.strokeStyle = '#f5f2d0';
        context.lineWidth = 5;
        context.strokeRect(25, 25, 670, 350);
        context.beginPath();
        context.moveTo(360, 25);
        context.lineTo(360, 375);
        context.moveTo(25, 200);
        context.lineTo(695, 200);
        context.stroke();
        const lane = { LEFT: 150, CENTER: 360, RIGHT: 570 } as const;
        context.fillStyle = '#ffdb4d';
        context.beginPath();
        context.arc(lane[state.target], 90, 28, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f7f8f3';
        context.fillRect(lane[state.aim] - 42, 315, 84, 18);
        if (!reducedMotion) {
            context.fillStyle = '#d8ff49';
            context.beginPath();
            context.arc(lane[state.aim], 285, 12, 0, Math.PI * 2);
            context.fill();
        }
    }, [reducedMotion, state]);
    return (
        <canvas
            aria-hidden="true"
            className={reducedMotion ? 'mini-game-canvas reduced-motion' : 'mini-game-canvas'}
            height="400"
            ref={canvas}
            width="720"
        />
    );
}

function ProgressPanel({ progress }: { readonly progress: GameProgress | undefined }) {
    if (!progress) return null;
    return (
        <section className="mini-game-progress" aria-labelledby="mini-game-progress-title">
            <h2 id="mini-game-progress-title">Прогресс сезона</h2>
            <p>
                Игровых дней: {progress.distinctCompletionDays} · отметок практики: {progress.practiceMarks}
            </p>
            <p>
                Сезон до {new Date(progress.season.endsAt).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC. Дневные
                цели сбрасываются в 00:00 UTC.
            </p>
            <ul>
                {progress.goals.map((goal) => (
                    <li key={goal.code}>
                        {goal.code === 'DAILY_WARM_UP'
                            ? 'Разминка'
                            : goal.code === 'DAILY_ACCURACY'
                              ? '12 успешных возвратов'
                              : 'По два попадания в каждую зону'}
                        : {String(goal.current)}/{String(goal.target)}
                    </li>
                ))}
            </ul>
            <ul>
                {progress.cosmetics.map((item) => (
                    <li key={item.code}>
                        {cosmeticLabel[item.code]}:{' '}
                        {item.state === 'UNLOCKED' ? 'открыто' : `${String(item.current)}/${String(item.target)}`}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function MiniGameScreen({ channel, client, online, onClose }: MiniGameScreenProps) {
    const [mode, setMode] = useState<GameMode>(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'CALM' : 'STANDARD'
    );
    const [phase, setPhase] = useState<Phase>('LANDING');
    const [tutorialServe, setTutorialServe] = useState(0);
    const [gameSession, setGameSession] = useState<GameSession>();
    const [engine, setEngine] = useState(() => initialEngine(seedFrom('offline-practice')));
    const [remainingMilliseconds, setRemainingMilliseconds] = useState(90_000);
    const [activeMilliseconds, setActiveMilliseconds] = useState(0);
    const [pausedMilliseconds, setPausedMilliseconds] = useState(0);
    const [practice, setPractice] = useState(!online);
    const [sound, setSound] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    const [message, setMessage] = useState<string>();
    const [claim, setClaim] = useState<GameRewardClaim>();
    const [progress, setProgress] = useState<GameProgress>();
    const lastFrame = useRef<number | undefined>(undefined);
    const lastStrike = useRef(0);
    const pauseStarted = useRef<number | undefined>(undefined);
    const finishing = useRef(false);
    const startTracked = useRef(false);

    useEffect(() => {
        if (!online) return;
        void client
            .getOwnMiniGameProgress()
            .then(setProgress)
            .catch(() => undefined);
    }, [client, online]);

    const finish = useCallback(
        async (finalEngine: EngineState, elapsed: number, paused: number) => {
            if (finishing.current) return;
            finishing.current = true;
            setPhase('SUBMITTING');
            if (!gameSession || practice || !online) {
                setPractice(true);
                setMessage('Тренировка завершена. Результат не отправлен и награда не начисляется.');
                setPhase('RESULT');
                return;
            }
            try {
                const receipt = await client.submitMiniGameResult(
                    gameSession.id,
                    {
                        activeDurationMilliseconds: mode === 'STANDARD' ? 90_000 : Math.max(1, Math.round(elapsed)),
                        challengeProof: gameSession.challengeProof,
                        configurationVersion: gameSession.configuration.version,
                        counters: finalEngine.counters,
                        mode,
                        nonce: randomNonce(),
                        pausedDurationMilliseconds: Math.min(600_000, Math.round(paused)),
                    },
                    crypto.randomUUID()
                );
                if (receipt.outcome !== 'ACCEPTED' || !receipt.resultProof) {
                    setMessage('Сервер отклонил результат. Награда не начислена.');
                    disabledAnalytics.track({
                        channel,
                        durationBucket: mode === 'STANDARD' ? '60_120S' : 'TURN_BASED',
                        mode,
                        name: 'mini_game_completed',
                        rewardOutcomeClass: 'REJECTED',
                    });
                } else {
                    const rewarded = await client.claimMiniGameRewards(
                        receipt.id,
                        { resultProof: receipt.resultProof },
                        crypto.randomUUID()
                    );
                    setClaim(rewarded);
                    setProgress(rewarded.progress);
                    setMessage('Результат принят. Лимиты применены сервером, каждую награду можно получить один раз.');
                    disabledAnalytics.track({
                        channel,
                        mode,
                        durationBucket: mode === 'STANDARD' ? '60_120S' : 'TURN_BASED',
                        name: 'mini_game_completed',
                        rewardOutcomeClass: rewarded.grants.some((grant) => grant.state === 'GRANTED')
                            ? 'GRANTED'
                            : 'CAPPED_OR_EMPTY',
                    });
                }
            } catch {
                setPractice(true);
                setMessage('Не удалось подтвердить результат. Он не сохранён и не будет отправлен позже.');
                disabledAnalytics.track({
                    channel,
                    durationBucket: mode === 'STANDARD' ? '60_120S' : 'TURN_BASED',
                    mode,
                    name: 'mini_game_completed',
                    rewardOutcomeClass: 'UNAVAILABLE',
                });
            } finally {
                setPhase('RESULT');
            }
        },
        [channel, client, gameSession, mode, online, practice]
    );

    useEffect(() => {
        if (phase !== 'PLAYING' || mode !== 'STANDARD') {
            lastFrame.current = undefined;
            return;
        }
        let frame = 0;
        const tick = (now: number) => {
            const previous = lastFrame.current ?? now;
            const delta = Math.min(100, Math.max(0, now - previous));
            lastFrame.current = now;
            setActiveMilliseconds((value) => value + delta);
            setRemainingMilliseconds((value) => {
                const next = Math.max(0, value - delta);
                if (next === 0) void finish(engine, 90_000, pausedMilliseconds);
                return next;
            });
            if (!finishing.current) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
        };
    }, [engine, finish, mode, pausedMilliseconds, phase]);

    const pause = useCallback(() => {
        if (phase !== 'PLAYING') return;
        pauseStarted.current = performance.now();
        setPhase('PAUSED');
    }, [phase]);
    const resume = useCallback(() => {
        if (phase !== 'PAUSED') return;
        const duration = performance.now() - (pauseStarted.current ?? performance.now());
        if (pausedMilliseconds + duration > 600_000) {
            setPractice(true);
            setMessage('Пауза длилась больше 10 минут. Сессия завершена без награды.');
            setPhase('RESULT');
            return;
        }
        setPausedMilliseconds((value) => value + duration);
        lastFrame.current = undefined;
        setPhase('PLAYING');
    }, [pausedMilliseconds, phase]);

    useEffect(() => {
        const visibility = () => {
            if (document.hidden) pause();
        };
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('blur', pause);
        return () => {
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('blur', pause);
        };
    }, [pause]);

    const hit = useCallback(() => {
        if (phase !== 'PLAYING') return;
        const now = performance.now();
        if (now - lastStrike.current < 450) return;
        lastStrike.current = now;
        if (!startTracked.current && gameSession && !practice) {
            startTracked.current = true;
            disabledAnalytics.track({
                channel,
                connectivity: 'ONLINE',
                entryClass: 'DIRECT',
                mode,
                name: 'mini_game_started',
            });
        }
        const next = strike(engine);
        setEngine(next);
        playTone(sound);
        if (mode === 'CALM' && next.counters.attempts === 20) {
            void finish(next, activeMilliseconds, pausedMilliseconds);
        }
    }, [activeMilliseconds, channel, engine, finish, gameSession, mode, pausedMilliseconds, phase, practice, sound]);

    useEffect(() => {
        const keyboard = (event: KeyboardEvent) => {
            if (phase !== 'PLAYING') return;
            if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') setEngine((value) => moveAim(value, -1));
            if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') setEngine((value) => moveAim(value, 1));
            if (event.key === ' ' || event.key === 'Enter') hit();
        };
        window.addEventListener('keydown', keyboard);
        return () => {
            window.removeEventListener('keydown', keyboard);
        };
    }, [hit, phase]);

    const beginRound = async () => {
        setMessage(undefined);
        setClaim(undefined);
        finishing.current = false;
        startTracked.current = false;
        setActiveMilliseconds(0);
        setPausedMilliseconds(0);
        setRemainingMilliseconds(90_000);
        let issued: GameSession | undefined;
        if (online) {
            try {
                issued = await client.createMiniGameSession(
                    { configurationVersion: '1.0.0', mode },
                    crypto.randomUUID()
                );
            } catch {
                setMessage('Награды сейчас недоступны. Запускаем честно отмеченную тренировку.');
            }
        }
        setGameSession(issued);
        setPractice(!issued);
        setEngine(initialEngine(seedFrom(issued?.task.id ?? `practice-${mode}`)));
        setPhase('PLAYING');
    };

    const tutorialHit = () => {
        const next = tutorialServe + 1;
        setTutorialServe(next);
        playTone(sound);
        if (next === 3) void beginRound();
    };

    const close = () => {
        finishing.current = true;
        disabledAnalytics.track({
            channel,
            name: 'mini_game_exit_intent',
            reasonClass: 'USER',
            stage:
                phase === 'PAUSED'
                    ? 'PAUSED'
                    : phase === 'PLAYING' || phase === 'SUBMITTING'
                      ? 'ACTIVE'
                      : phase === 'RESULT'
                        ? 'RESULT'
                        : 'ENTRY',
        });
        onClose();
    };

    const timeText = useMemo(() => `${String(Math.ceil(remainingMilliseconds / 1000))} с`, [remainingMilliseconds]);
    const active = phase === 'PLAYING' || phase === 'PAUSED' || phase === 'SUBMITTING';
    return (
        <main className="mini-game-screen" data-ad-free={active ? 'true' : undefined} data-channel={channel}>
            <header className="mini-game-header">
                <div>
                    <p className="mini-game-eyebrow">Мини-игра PickleHub</p>
                    <h1>Ралли на точность</h1>
                </div>
                <button type="button" className="mini-game-close" onClick={close}>
                    Закрыть игру
                </button>
            </header>

            {message ? (
                <p className="mini-game-status" role="status">
                    {message}
                </p>
            ) : null}
            {practice ? <p className="mini-game-practice">Тренировка · без награды и отложенной отправки</p> : null}

            {phase === 'LANDING' ? (
                <section className="mini-game-card">
                    <h2>Выберите режим</h2>
                    <p>Награда не зависит от очков или режима. Игра никогда не влияет на рейтинг и подбор матчей.</p>
                    <div className="mini-game-mode-grid">
                        <button
                            type="button"
                            aria-pressed={mode === 'STANDARD'}
                            onClick={() => {
                                setMode('STANDARD');
                            }}
                        >
                            <strong>Обычный</strong>
                            <span>90 секунд активной игры</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={mode === 'CALM'}
                            onClick={() => {
                                setMode('CALM');
                            }}
                        >
                            <strong>Спокойный</strong>
                            <span>20 ходов, без ограничения реакции</span>
                        </button>
                    </div>
                    <label>
                        <input
                            type="checkbox"
                            checked={sound}
                            onChange={(event) => {
                                setSound(event.target.checked);
                            }}
                        />{' '}
                        Звук
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={reducedMotion}
                            onChange={(event) => {
                                setReducedMotion(event.target.checked);
                            }}
                        />{' '}
                        Уменьшить анимацию
                    </label>
                    <button
                        type="button"
                        className="mini-game-primary"
                        onClick={() => {
                            setTutorialServe(0);
                            setPhase('TUTORIAL');
                        }}
                    >
                        Обучение и старт
                    </button>
                </section>
            ) : null}

            {phase === 'TUTORIAL' ? (
                <section className="mini-game-card" data-ad-free="true">
                    <h2>Обучение · подача {tutorialServe + 1} из 3</h2>
                    <p>Выберите направление стрелками, A/D или кнопками. Нажмите пробел, Enter или «Удар».</p>
                    <div className="mini-game-controls">
                        <button
                            type="button"
                            onClick={() => {
                                setEngine((value) => moveAim(value, -1));
                            }}
                        >
                            Влево
                        </button>
                        <button type="button" className="mini-game-hit" onClick={tutorialHit}>
                            Удар
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setEngine((value) => moveAim(value, 1));
                            }}
                        >
                            Вправо
                        </button>
                    </div>
                </section>
            ) : null}

            {phase === 'PLAYING' || phase === 'PAUSED' ? (
                <section className="mini-game-play" aria-label="Игровое поле">
                    <div className="mini-game-hud">
                        <span>Очки: {score(engine.counters)}</span>
                        <span>
                            {mode === 'STANDARD'
                                ? `Время: ${timeText}`
                                : `Ходы: ${String(engine.counters.attempts)}/20`}
                        </span>
                    </div>
                    {mode === 'STANDARD' ? <CourtCanvas reducedMotion={reducedMotion} state={engine} /> : null}
                    <p className="mini-game-text-equivalent" role="status" aria-live="polite">
                        Цель {directionLabel[engine.target]}. Прицел {directionLabel[engine.aim]}. Успешных возвратов{' '}
                        {engine.counters.successfulReturns} из {engine.counters.attempts}.
                    </p>
                    {phase === 'PAUSED' ? (
                        <div className="mini-game-pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
                            <h2 id="pause-title">Пауза</h2>
                            <p>Таймер, ввод и звук остановлены. Продолжить можно в течение 10 минут.</p>
                            <button type="button" className="mini-game-primary" onClick={resume}>
                                Продолжить
                            </button>
                            <button type="button" onClick={close}>
                                Выйти без награды
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="mini-game-lanes" aria-label="Направление удара">
                                {(['LEFT', 'CENTER', 'RIGHT'] as const).map((direction) => (
                                    <button
                                        key={direction}
                                        type="button"
                                        aria-pressed={engine.aim === direction}
                                        onClick={() => {
                                            setEngine((value) => setAim(value, direction));
                                        }}
                                    >
                                        {directionLabel[direction]}
                                    </button>
                                ))}
                            </div>
                            <div className="mini-game-controls">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEngine((value) => moveAim(value, -1));
                                    }}
                                >
                                    Влево
                                </button>
                                <button type="button" className="mini-game-hit" onClick={hit}>
                                    Удар
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEngine((value) => moveAim(value, 1));
                                    }}
                                >
                                    Вправо
                                </button>
                            </div>
                            <button type="button" onClick={pause}>
                                Пауза
                            </button>
                        </>
                    )}
                </section>
            ) : null}

            {phase === 'SUBMITTING' ? (
                <section className="mini-game-card" aria-busy="true">
                    <h2>Проверяем результат…</h2>
                    <p>Не закрывайте экран до ответа сервера.</p>
                </section>
            ) : null}
            {phase === 'RESULT' ? (
                <section className="mini-game-card mini-game-result">
                    <h2>Ралли завершено</h2>
                    <p className="mini-game-score">{score(engine.counters)} очков</p>
                    <p>
                        {engine.counters.successfulReturns} успешных возвратов · {engine.counters.targetHits} точных
                        направлений · лучшая серия {engine.bestStreak}
                    </p>
                    {claim ? (
                        <p>
                            Сервер обработал {claim.grants.length} результата награды с дневными и сезонными лимитами.
                        </p>
                    ) : null}
                    <button
                        type="button"
                        className="mini-game-primary"
                        onClick={() => {
                            setPhase('LANDING');
                            setGameSession(undefined);
                            finishing.current = false;
                        }}
                    >
                        Сыграть ещё
                    </button>
                    <button type="button" onClick={close}>
                        Вернуться в PickleHub
                    </button>
                </section>
            ) : null}
            {!active ? <ProgressPanel progress={progress} /> : null}
        </main>
    );
}

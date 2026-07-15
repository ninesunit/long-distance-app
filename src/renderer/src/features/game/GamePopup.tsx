import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { applyHappinessBoost } from '../../lib/needsStore';
import { supabase } from '../../lib/supabaseClient';
import { resumeAudio, startMusic, stopMusic, playSfx } from '../../lib/gameAudio';
import type { GameSignal } from '../../../../shared/types';

// Normalized play space (0..1, y top→bottom). Tunable.
const CAT_Y = 0.86;
const CATCH_HALF = 0.13;
const CAT_W_PCT = 20;
const CAT_LERP = 0.22;
const BASE_FALL = 0.34;
const FALL_PER_SCORE = 0.006;
const FALL_MAX = 1.0;
const BASE_SPAWN_MS = 1150;
const SPAWN_DEC_PER_SCORE = 20;
const SPAWN_MIN_MS = 480;
const BOMB_PROB = 0.24;

const START_LIVES = 3; // solo
const ROUND_SECONDS = 45; // versus
const COUNTDOWN_MS = 3500; // versus lead-in
const SOLO_COUNTDOWN_MS = 1500;

const HAPPY_PER = 2.5;
const XP_PER = 1.5;
const SOLO_HAPPY_CAP = 45;
const VERSUS_HAPPY_CAP = 70;
const XP_CAP = 40;
const SCORE_SEND_MS = 250;

const TREAT_EMOJI = ['🐟', '🍖', '🍤', '🧀'];
const BOMB_EMOJI = ['💣'];

interface Item {
  id: number;
  x: number;
  y: number;
  type: 'treat' | 'bomb';
  kind: number;
}

type Screen = 'menu' | 'lobby' | 'countdown' | 'playing' | 'over';
type Mode = 'solo' | 'versus';

export default function GamePopup() {
  const { profile, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>('menu');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [catX, setCatX] = useState(0.5);
  const [facing, setFacing] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [partnerScore, setPartnerScore] = useState(0);
  const [partnerName, setPartnerName] = useState('them');
  const [countdownNum, setCountdownNum] = useState(3);
  const [result, setResult] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);

  const screenRef = useRef<Screen>('menu');
  const modeRef = useRef<Mode>('solo');
  const musicEnabledRef = useRef(true);

  const catXRef = useRef(0.5);
  const targetXRef = useRef(0.5);
  const facingRef = useRef(1);
  const itemsRef = useRef<Item[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(START_LIVES);
  const spawnAccRef = useRef(0);
  const nextIdRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const lastScoreSendRef = useRef(0);

  const startAtRef = useRef(0);
  const roundSecondsRef = useRef(ROUND_SECONDS);
  const isHostRef = useRef(false);
  const versusStartedRef = useRef(false);
  const myFinishedRef = useRef(false);
  const partnerFinishedRef = useRef(false);
  const partnerScoreRef = useRef(0);
  const resultComputedRef = useRef(false);
  const startBoardRef = useRef<() => void>(() => {});

  const areaRef = useRef<HTMLDivElement>(null);
  const myId = profile?.id ?? '';

  const goScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreen(s);
  }, []);

  const { sendGameSignal, sendNeedsUpdate } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onGameSignal: (sig: GameSignal) => {
      if (sig.kind === 'versus_ready') {
        if (screenRef.current !== 'lobby' || versusStartedRef.current) return;
        // Both are ready; the lower id hosts the match clock.
        if (myId < sig.actorId) {
          versusStartedRef.current = true;
          const startAt = Date.now() + COUNTDOWN_MS;
          startAtRef.current = startAt;
          roundSecondsRef.current = ROUND_SECONDS;
          isHostRef.current = true;
          sendGameSignal({ kind: 'versus_go', startAt, roundSeconds: ROUND_SECONDS, hostId: myId });
          modeRef.current = 'versus';
          goScreen('countdown');
        }
      } else if (sig.kind === 'versus_go') {
        if (versusStartedRef.current) return;
        versusStartedRef.current = true;
        startAtRef.current = sig.startAt;
        roundSecondsRef.current = sig.roundSeconds;
        isHostRef.current = false;
        modeRef.current = 'versus';
        goScreen('countdown');
      } else if (sig.kind === 'score') {
        partnerScoreRef.current = sig.score;
        setPartnerScore(sig.score);
        if (sig.finished) {
          partnerFinishedRef.current = true;
          maybeComputeResult();
        }
      } else if (sig.kind === 'cancel') {
        if (screenRef.current === 'lobby' || screenRef.current === 'countdown') {
          versusStartedRef.current = false;
          goScreen('menu');
        }
      }
    },
  });

  useEffect(() => {
    if (!profile?.partner_id) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', profile.partner_id)
      .maybeSingle()
      .then(({ data }) => data && setPartnerName(data.display_name));
  }, [profile]);

  const maybeComputeResult = useCallback(async () => {
    if (resultComputedRef.current) return;
    if (!myFinishedRef.current || !partnerFinishedRef.current) return;
    resultComputedRef.current = true;
    const mine = scoreRef.current;
    const theirs = partnerScoreRef.current;
    const total = mine + theirs;
    const h = Math.min(VERSUS_HAPPY_CAP, total * HAPPY_PER);
    const oc = mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
    setOutcome(oc);
    setResult(`You ${mine} · ${partnerName} ${theirs}\nTogether ${total} → +${Math.round(h)} happiness`);
    playSfx(oc === 'win' ? 'win' : oc === 'lose' ? 'lose' : 'go');
    if (isHostRef.current && profile?.partner_id && total > 0) {
      const updated = await applyHappinessBoost(profile.id, profile.partner_id, h, Math.min(XP_CAP, total * XP_PER));
      sendNeedsUpdate({
        fullness: updated.fullness,
        happiness: updated.happiness,
        energy: updated.energy,
        thirst: updated.thirst,
        experience: updated.experience,
        stage: updated.stage,
        updatedAt: updated.updated_at,
        actorId: profile.id,
      });
    }
  }, [partnerName, profile, sendNeedsUpdate]);

  const endRound = useCallback(async () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopMusic();

    if (modeRef.current === 'solo') {
      const s = scoreRef.current;
      const h = Math.min(SOLO_HAPPY_CAP, s * HAPPY_PER);
      setOutcome(null);
      setResult(`${s} treats\n+${Math.round(h)} happiness`);
      playSfx('gameover');
      goScreen('over');
      if (profile?.partner_id && s > 0) {
        // Solo play boosts happiness but grants NO XP — levels come only from
        // playing together (versus).
        const updated = await applyHappinessBoost(profile.id, profile.partner_id, h, 0);
        sendNeedsUpdate({
          fullness: updated.fullness,
          happiness: updated.happiness,
          energy: updated.energy,
          thirst: updated.thirst,
          experience: updated.experience,
          stage: updated.stage,
          updatedAt: updated.updated_at,
          actorId: profile.id,
        });
      }
    } else {
      myFinishedRef.current = true;
      setResult(null);
      goScreen('over');
      if (profile) sendGameSignal({ kind: 'score', score: scoreRef.current, finished: true, actorId: profile.id });
      maybeComputeResult();
    }
  }, [goScreen, maybeComputeResult, profile, sendGameSignal, sendNeedsUpdate]);

  const startBoard = useCallback(() => {
    catXRef.current = 0.5;
    targetXRef.current = 0.5;
    itemsRef.current = [];
    scoreRef.current = 0;
    livesRef.current = START_LIVES;
    spawnAccRef.current = 0;
    nextIdRef.current = 1;
    lastTsRef.current = 0;
    lastScoreSendRef.current = 0;
    myFinishedRef.current = false;
    partnerFinishedRef.current = false;
    partnerScoreRef.current = 0;
    resultComputedRef.current = false;
    setScore(0);
    setLives(START_LIVES);
    setPartnerScore(0);
    setItems([]);
    setCatX(0.5);
    setTimeLeft(roundSecondsRef.current);
    setResult(null);
    setOutcome(null);

    resumeAudio();
    playSfx('go');
    if (musicEnabledRef.current) startMusic();
    goScreen('playing');

    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.04, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const prevX = catXRef.current;
      catXRef.current += (targetXRef.current - prevX) * CAT_LERP;
      if (catXRef.current < prevX - 0.002) facingRef.current = -1;
      else if (catXRef.current > prevX + 0.002) facingRef.current = 1;

      const spawnInterval = Math.max(SPAWN_MIN_MS, BASE_SPAWN_MS - scoreRef.current * SPAWN_DEC_PER_SCORE);
      spawnAccRef.current += dt * 1000;
      if (spawnAccRef.current >= spawnInterval) {
        spawnAccRef.current = 0;
        const isBomb = Math.random() < BOMB_PROB;
        itemsRef.current.push({
          id: nextIdRef.current++,
          x: 0.1 + Math.random() * 0.8,
          y: -0.05,
          type: isBomb ? 'bomb' : 'treat',
          kind: Math.floor(Math.random() * (isBomb ? BOMB_EMOJI.length : TREAT_EMOJI.length)),
        });
      }

      const fall = Math.min(FALL_MAX, BASE_FALL + scoreRef.current * FALL_PER_SCORE);
      const survivors: Item[] = [];
      for (const it of itemsRef.current) {
        it.y += fall * dt;
        const inBand = it.y >= CAT_Y && it.y <= CAT_Y + 0.1;
        if (inBand && Math.abs(it.x - catXRef.current) < CATCH_HALF) {
          if (it.type === 'treat') {
            scoreRef.current += 1;
            playSfx('treat');
          } else if (modeRef.current === 'solo') {
            livesRef.current -= 1;
            playSfx('bomb');
          } else {
            scoreRef.current = Math.max(0, scoreRef.current - 1);
            playSfx('bomb');
          }
          continue;
        }
        if (it.y > 1.08) continue;
        survivors.push(it);
      }
      itemsRef.current = survivors;

      setCatX(catXRef.current);
      setFacing(facingRef.current);
      setItems([...itemsRef.current]);
      setScore(scoreRef.current);

      if (modeRef.current === 'solo') {
        setLives(livesRef.current);
        if (livesRef.current <= 0) {
          endRound();
          return;
        }
      } else {
        const remain = roundSecondsRef.current - (Date.now() - startAtRef.current) / 1000;
        setTimeLeft(Math.max(0, Math.ceil(remain)));
        const now = Date.now();
        if (profile && now - lastScoreSendRef.current > SCORE_SEND_MS) {
          lastScoreSendRef.current = now;
          sendGameSignal({ kind: 'score', score: scoreRef.current, finished: false, actorId: profile.id });
        }
        if (remain <= 0) {
          endRound();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [endRound, goScreen, profile, sendGameSignal]);

  startBoardRef.current = startBoard;

  // Countdown → start the board when the shared start time is reached.
  useEffect(() => {
    if (screen !== 'countdown') return;
    let raf = 0;
    const tick = () => {
      const remain = startAtRef.current - Date.now();
      if (remain <= 0) {
        setCountdownNum(0);
        startBoardRef.current();
        return;
      }
      setCountdownNum(Math.ceil(remain / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // Versus lobby heartbeat so both clients discover each other.
  useEffect(() => {
    if (screen !== 'lobby' || !profile) return;
    const ping = () => sendGameSignal({ kind: 'versus_ready', actorId: profile.id });
    ping();
    const id = window.setInterval(ping, 1000);
    return () => clearInterval(id);
  }, [screen, profile, sendGameSignal]);

  // Fresh menu on reopen unless a match is live.
  useEffect(() => {
    const unsub = window.api.onPopupShown(() => {
      if (screenRef.current === 'playing' || screenRef.current === 'countdown' || screenRef.current === 'lobby') return;
      versusStartedRef.current = false;
      goScreen('menu');
    });
    return unsub;
  }, [goScreen]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopMusic();
    };
  }, []);

  if (loading || !profile || !profile.partner_id) return <div className="w-full h-full" />;

  const playing = screen === 'playing';

  const steer = (clientX: number) => {
    if (!playing || !areaRef.current) return;
    const r = areaRef.current.getBoundingClientRect();
    targetXRef.current = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const toggleMusic = () => {
    resumeAudio();
    const next = !musicEnabled;
    setMusicEnabled(next);
    musicEnabledRef.current = next;
    if (next) startMusic();
    else stopMusic();
  };

  const startSolo = () => {
    modeRef.current = 'solo';
    versusStartedRef.current = false;
    startAtRef.current = Date.now() + SOLO_COUNTDOWN_MS;
    roundSecondsRef.current = ROUND_SECONDS;
    goScreen('countdown');
  };

  const startVersus = () => {
    modeRef.current = 'versus';
    versusStartedRef.current = false;
    goScreen('lobby');
  };

  const cancelLobby = () => {
    if (profile) sendGameSignal({ kind: 'cancel', actorId: profile.id });
    versusStartedRef.current = false;
    goScreen('menu');
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="pixel-window w-full h-full flex flex-col gap-2 p-3 no-drag">
        <div className="flex items-center justify-between">
          <p className="font-pixel text-[10px] text-ink">🐾 Treat Catch</p>
          <div className="flex items-center gap-2">
            {playing && modeRef.current === 'solo' && <span className="text-[11px] leading-none">{'💗'.repeat(Math.max(0, lives))}</span>}
            {playing && modeRef.current === 'versus' && <span className="font-pixel text-[9px] text-ink-soft">⏱{timeLeft}</span>}
            {playing && <span className="font-pixel text-[10px] text-campfire-dark">{score}</span>}
            <button onClick={toggleMusic} className="text-[13px] leading-none" title={musicEnabled ? 'Music on' : 'Music off'}>
              {musicEnabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        <div
          ref={areaRef}
          onMouseMove={(e) => steer(e.clientX)}
          className="relative flex-1 border-2 border-ink bg-cozy overflow-hidden select-none cursor-pointer"
        >
          {playing && (
            <>
              {modeRef.current === 'versus' && (
                <div className="absolute top-1 left-1 font-pixel text-[8px] text-ink-soft pointer-events-none">
                  {partnerName}: {partnerScore}
                </div>
              )}
              {items.map((it) => (
                <span
                  key={it.id}
                  className="absolute select-none pointer-events-none"
                  style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, transform: 'translate(-50%, -50%)', fontSize: 20 }}
                >
                  {it.type === 'treat' ? TREAT_EMOJI[it.kind] : BOMB_EMOJI[it.kind]}
                </span>
              ))}
              <img
                src="./sprites/pixel_cat.gif"
                alt="cat"
                draggable={false}
                className="absolute pixel-art pointer-events-none"
                style={{
                  left: `${catX * 100}%`,
                  top: `${CAT_Y * 100}%`,
                  width: `${CAT_W_PCT}%`,
                  transform: `translate(-50%, -50%) scaleX(${facing})`,
                }}
              />
            </>
          )}

          {screen === 'menu' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="font-pixel text-[9px] text-ink leading-relaxed">Catch the treats!</p>
              <p className="text-[10px] text-ink-soft">Steer the cat with your mouse. Grab 🐟 treats, dodge 💣 bombs.</p>
              <div className="flex flex-col gap-1.5 w-full mt-1">
                <button onClick={startSolo} className="pixel-btn pixel-btn--primary text-[10px] py-1.5">
                  ▶ Solo
                </button>
                <button onClick={startVersus} className="pixel-btn pixel-btn--accent text-[10px] py-1.5">
                  ⚔ Versus {partnerName}
                </button>
              </div>
            </div>
          )}

          {screen === 'lobby' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="font-pixel text-[9px] text-ink">Waiting for {partnerName}…</p>
              <p className="text-[10px] text-ink-soft">Ask them to open Play → Versus too.</p>
              <div className="flex flex-col gap-1.5 w-full mt-1">
                <button onClick={startSolo} className="pixel-btn text-[10px] py-1.5">
                  Play solo instead
                </button>
                <button onClick={cancelLobby} className="pixel-btn text-[10px] py-1.5">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {screen === 'countdown' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-pixel text-2xl text-campfire">{countdownNum > 0 ? countdownNum : 'GO!'}</p>
            </div>
          )}

          {screen === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center bg-paper/85">
              {modeRef.current === 'versus' && !result ? (
                <p className="font-pixel text-[9px] text-ink">Waiting for {partnerName} to finish…</p>
              ) : (
                <>
                  <p className="font-pixel text-[10px] text-ink">
                    {outcome === 'win' ? 'You win! 🏆' : outcome === 'lose' ? `${partnerName} wins!` : outcome === 'draw' ? 'Tie!' : 'Game over'}
                  </p>
                  {result && <p className="text-[11px] text-ink-soft whitespace-pre-line leading-snug">{result}</p>}
                  <button onClick={() => goScreen('menu')} className="pixel-btn pixel-btn--primary text-[10px] px-4 py-1.5 mt-1">
                    ↻ Menu
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-[10px] text-ink-soft text-center h-4">
          {playing
            ? modeRef.current === 'versus'
              ? 'Race your partner for treats!'
              : 'Catch treats, dodge bombs!'
            : 'Play to cheer up your pet'}
        </p>
      </div>
    </div>
  );
}

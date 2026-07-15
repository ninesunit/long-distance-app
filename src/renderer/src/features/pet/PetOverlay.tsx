import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchPetData } from '../../lib/petStore';
import {
  fetchNeeds,
  applyStatDeltas,
  decayNeeds,
  stageColorFilter,
  HUNGRY_THRESHOLD,
  type PetNeeds,
  type StatDeltas,
} from '../../lib/needsStore';
import { playSound, SOUNDS } from '../../lib/sounds';
import {
  playMeow,
  resumeCatAudio,
  playWhoosh,
  playThud,
  playCrunch,
  playSip,
  playPop,
  playSplash,
  playBoing,
  playSparkle,
  playSneeze,
} from '../../lib/catSounds';
import { supabase } from '../../lib/supabaseClient';
import {
  fetchPins,
  addPin,
  removePin,
  updatePin,
  pinOpacity,
  isPinExpired,
  type Pin,
  type PinKind,
} from '../../lib/pinsStore';
import { sandboxDef, type CatAction } from '../../lib/sandboxCatalog';
import type {
  PetBroadcastPayload,
  NoteBroadcastPayload,
  PetPositionPayload,
  NeedsBroadcastPayload,
  MusicBroadcastPayload,
  PetReactionPayload,
} from '../../../../shared/types';

const CLICK_MOVE_THRESHOLD = 5;
const BOUNCE_DAMPING = 0.4;
const MIN_BOUNCE_VELOCITY = 3;
const GRAVITY = 0.32; // gentler, more grounded fall
const IDLE_TIMEOUT_MS = 90000;
const DRAG_BROADCAST_INTERVAL_MS = 66; // ~15/sec — well under Supabase's rate limit
const WALK_DURATION_MS = 5000;
const RUN_DURATION_MS = 1200;
const JUMP_DURATION_MS = 1500;
const GROOM_DURATION_MS = 1800;
const FLING_SPEED = 20; // px/frame at release to count as a fling (vs a gentle drop)
const AIR_FRICTION = 0.985;
const WALL_RESTITUTION = 0.55;
const MAX_FLING_V = 26;
const SANDBOX_GRAVITY = 0.9; // px/frame² for a dropped sticker
const SANDBOX_BOUNCE = 0.34; // bounce damping when a sticker hits the ground
const STICKER_SIZE = 30; // rendered sticker size in px

// SFX for the moment the cat starts reacting to a sticker.
function playActionSfx(action: CatAction): void {
  switch (action) {
    case 'eat':
      playCrunch();
      break;
    case 'drink':
      playSip();
      break;
    case 'warm':
    case 'nest':
      playSparkle();
      break;
    case 'swat':
      playBoing();
      break;
    case 'hunt':
      playBoing();
      playMeow();
      break;
    case 'sniff':
      break; // the sneeze plays on resolve
    default:
      playMeow();
      break;
  }
}

// SFX when the cat gets trapped by a chaos toy.
function playTrapSfx(emoji: string): void {
  if (emoji === '💦') playSplash();
  else if (emoji === '🥒') {
    playBoing();
    playMeow();
  } else playPop(); // box
}

// Verb shown in the little status bubble for each cat reaction.
function actionVerb(action: CatAction): string {
  switch (action) {
    case 'eat':
      return 'gobbled the';
    case 'drink':
      return 'lapped up the';
    case 'warm':
      return 'warmed up by the';
    case 'nest':
      return 'curled up on the';
    case 'sniff':
      return 'sniffed the';
    case 'swat':
      return 'batted the';
    case 'hunt':
      return 'pounced on the';
    default:
      return 'inspected the';
  }
}

// A sticker mid-air, dropped from the Pet popup, before it settles into a pin.
interface FallingSticker {
  id: string;
  emoji: string;
  kind: PinKind;
  x: number; // px (left)
  y: number; // px (top)
  vy: number;
}

export default function PetOverlay() {
  const { profile } = useAuth();
  const [petName, setPetNameState] = useState('Kitty');
  const [catSize, setCatSize] = useState(64);
  const [bottomOffset, setBottomOffset] = useState(-50);
  const [x, setX] = useState(100);
  const [y, setY] = useState<number | null>(null);
  const [facingLeft, setFacingLeft] = useState(false);
  const [heartEvent, setHeartEvent] = useState<string | null>(null);
  const [noteBubble, setNoteBubble] = useState<{ sender: string; content: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [remoteControlled, setRemoteControlled] = useState(false);
  const [remoteState, setRemoteState] = useState<'drag' | 'fall' | 'fling' | null>(null);
  const [falling, setFalling] = useState(false);
  const [asleep, setAsleep] = useState(true);
  const [moving, setMoving] = useState(false);
  const [moveMode, setMoveMode] = useState<'walk' | 'run' | 'jump'>('walk');
  const [grooming, setGrooming] = useState(false);
  const movingTimerRef = useRef<number | null>(null);
  const groomTimeoutRef = useRef<number | null>(null);
  const [needs, setNeeds] = useState<PetNeeds | null>(null);
  const [hungry, setHungry] = useState(false);
  const needsRef = useRef<PetNeeds | null>(null);
  const hungryNotifiedRef = useRef(false);
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  const [partnerName, setPartnerName] = useState('');
  const [pins, setPins] = useState<Pin[]>([]);
  const pinsRef = useRef<Pin[]>([]);
  pinsRef.current = pins;
  const [pinTick, setPinTick] = useState(0); // forces fade/expiry recompute
  const handledPinsRef = useRef<Set<string>>(new Set()); // one-shot reactions already done

  // Falling "sandbox" stickers: dropped from the Pet popup, they fall to the
  // ground, then settle into a resting pin the cat pathfinds to. Physics run in
  // a single rAF loop; rendered from state.
  const [fallingStickers, setFallingStickers] = useState<FallingSticker[]>([]);
  const fallingRef = useRef<FallingSticker[]>([]);
  fallingRef.current = fallingStickers;
  const sandboxRafRef = useRef<number | null>(null);

  // The bespoke reaction the cat is currently playing (eat/drink/warm/…). While
  // set, the roam loop holds off and the render shows the matching pose.
  const [catAction, setCatAction] = useState<CatAction | null>(null);
  const [actionSprite, setActionSprite] = useState<string | null>(null); // override sprite during a reaction
  const [trapSprite, setTrapSprite] = useState<string | null>(null); // chaos: cat locked in this pose
  const [trapPinId, setTrapPinId] = useState<string | null>(null); // the sticker holding the cat
  const trapRef = useRef(false);
  const trapPinIdRef = useRef<string | null>(null);
  trapPinIdRef.current = trapPinId;
  const trapSeenRef = useRef(false); // confirmed the trapping pin exists (avoids a race-release)
  const busyRef = useRef(false); // cat mid-interaction → roam waits
  const swatCountRef = useRef<Record<string, number>>({}); // yarn swats per pin id
  const anchorXRef = useRef<number | null>(null); // campfire the cat idles near
  const interactRef = useRef<((pin: Pin) => void) | null>(null); // breaks the roam⇄interact cycle
  const facingLeftRef = useRef(false);

  // Dragging a resting sticker around the desktop.
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const draggingPinRef = useRef(false);
  draggingPinRef.current = draggingPinId !== null;
  const pinDragOffset = useRef({ x: 0, y: 0 });
  // Stickers fall like the cat: a released sticker drops back to the ground.
  const pinVelRef = useRef<Map<string, number>>(new Map());
  const pinFallRafRef = useRef<number | null>(null);

  // Short-lived leftovers (fishbone, etc.) — local visual only, auto-cleared.
  const [residues, setResidues] = useState<{ id: string; emoji: string; x: number; y: number }[]>([]);
  const addResidue = useCallback((emoji: string, x: number, y: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setResidues((prev) => [...prev, { id, emoji, x, y }]);
    window.setTimeout(() => setResidues((prev) => prev.filter((r) => r.id !== id)), 60000);
  }, []);

  const timerRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const velocityXRef = useRef(0);
  const dragVelRef = useRef({ vx: 0, vy: 0 });
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const flungRef = useRef(false);
  const xRef = useRef(100);
  xRef.current = x;
  facingLeftRef.current = facingLeft;
  const [flinging, setFlinging] = useState(false);
  const fallRafRef = useRef<number | null>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const remoteControlledRef = useRef(false);
  const remoteTimeoutRef = useRef<number | null>(null);
  const interactiveRef = useRef(false);
  const mousePosRef = useRef({ x: -1, y: -1 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const lastDragBroadcast = useRef(0);

  const groundY = window.innerHeight - catSize - bottomOffset;

  const isAuthority = useMemo(() => {
    if (!profile?.id || !profile?.partner_id) return false;
    return profile.id < profile.partner_id;
  }, [profile]);

  useEffect(() => {
    if (!dragging && !falling && !remoteControlled) {
      setY((prev) => prev ?? groundY);
    }
  }, [groundY, dragging, falling, remoteControlled]);

  useEffect(() => {
    window.api.getPetSettings().then((s: any) => {
      setCatSize(s.catSize);
      setBottomOffset(s.bottomOffset ?? -50);
    });
    const unsub = window.api.onPetSettingsChanged((s: any) => {
      setCatSize(s.catSize);
      setBottomOffset(s.bottomOffset ?? -50);
    });
    return unsub;
  }, []);

  const resetIdleTimer = useCallback(() => {
    setAsleep(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      // Never fall asleep while a song is playing — keep the cat up and bopping.
      if (listeningRef.current) {
        resetIdleTimer();
        return;
      }
      if (catRef.current) {
        const rect = catRef.current.getBoundingClientRect();
        setX(rect.left);
      }
      setAsleep(true);
    }, IDLE_TIMEOUT_MS);
  }, []);

  // A song starting/stopping wakes the cat (and stops it sleeping while it plays).
  useEffect(() => {
    if (listening) resetIdleTimer();
  }, [listening, resetIdleTimer]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (movingTimerRef.current) clearTimeout(movingTimerRef.current);
      if (groomTimeoutRef.current) clearTimeout(groomTimeoutRef.current);
      if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
      if (pinFallRafRef.current) cancelAnimationFrame(pinFallRafRef.current);
      if (sandboxRafRef.current) cancelAnimationFrame(sandboxRafRef.current);
    };
  }, []);

  // Flag the cat as moving (walk / run / jump) for `durationMs`, so the render
  // can pick the right sprite + animation. Movement cancels any grooming.
  const markMoving = useCallback((durationMs: number, mode: 'walk' | 'run' | 'jump') => {
    setGrooming(false);
    setMoveMode(mode);
    setMoving(true);
    if (movingTimerRef.current) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = window.setTimeout(() => setMoving(false), durationMs);
  }, []);

  // When the cat is calm and stationary it OCCASIONALLY grooms itself. Kept
  // rare so a resting cat doesn't look like it's constantly "dancing".
  useEffect(() => {
    const id = window.setInterval(() => {
      if (asleep || dragging || falling || remoteControlled || moving || grooming || busyRef.current) return;
      if (Math.random() < 0.18) {
        setGrooming(true);
        if (groomTimeoutRef.current) clearTimeout(groomTimeoutRef.current);
        groomTimeoutRef.current = window.setTimeout(() => setGrooming(false), GROOM_DURATION_MS);
      }
    }, 7000);
    return () => clearInterval(id);
  }, [asleep, dragging, falling, remoteControlled, moving, grooming]);

  // Wake the cat on startup so it roams right away (it sleeps after IDLE_TIMEOUT
  // of no interaction, not immediately).
  useEffect(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  const { sendPetInteraction, sendPetPosition, sendNeedsUpdate, sendPinsChanged, sendPetReaction, partnerPresent } = useCoupleChannel(
    profile?.id,
    profile?.partner_id ?? undefined,
    {
      onPetInteraction: (payload: PetBroadcastPayload) => {
        const verb = payload.interactionType === 'feed' ? 'fed' : 'petted';
        setHeartEvent(`${payload.actorName} ${verb} ${petName}`);
        playMeow();
        resetIdleTimer();
        window.setTimeout(() => setHeartEvent(null), 2500);
      },
      onNoteSent: (payload: NoteBroadcastPayload) => {
        setNoteBubble({ sender: payload.senderName, content: payload.content });
        playSound(SOUNDS.NOTIFICATION);
        window.setTimeout(() => setNoteBubble(null), 6000);
      },
      onPetPosition: (payload: PetPositionPayload) => {
        if (payload.actorId === profile?.id) return;

        if (payload.state === 'drag' || payload.state === 'fall' || payload.state === 'fling') {
          resetIdleTimer(); // partner is handling the cat → wake + show it
          remoteControlledRef.current = true;
          setRemoteControlled(true);
          setRemoteState(payload.state); // mirror the drag/fall/fling animation locally
          // CRITICAL: keep B's full-screen overlay click-through while the
          // partner drags, or it can lock B's entire desktop.
          if (interactiveRef.current) {
            interactiveRef.current = false;
            window.api.setPetInteractive(false);
          }
          setX(payload.x);
          setY(payload.y);
          setFacingLeft(payload.facingLeft);
          // Watchdog: if the stream stops (partner disconnected mid-drag), don't
          // stay stuck remote-controlled forever.
          if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
          remoteTimeoutRef.current = window.setTimeout(() => {
            remoteControlledRef.current = false;
            setRemoteControlled(false);
            setRemoteState(null);
          }, 2500);
        } else if (payload.state === 'idle') {
          if (remoteTimeoutRef.current) {
            clearTimeout(remoteTimeoutRef.current);
            remoteTimeoutRef.current = null;
          }
          resetIdleTimer();
          remoteControlledRef.current = false;
          setRemoteControlled(false);
          setRemoteState(null);
          setX(payload.x);
          setY(payload.y);
          setFacingLeft(payload.facingLeft);
        } else if (payload.state === 'roam' || payload.state === 'run' || payload.state === 'jump') {
          if (remoteTimeoutRef.current) {
            clearTimeout(remoteTimeoutRef.current);
            remoteTimeoutRef.current = null;
          }
          resetIdleTimer(); // partner's cat is moving → keep ours awake + moving too
          remoteControlledRef.current = false;
          setRemoteControlled(false);
          setRemoteState(null);
          setX(payload.x);
          setFacingLeft(payload.facingLeft);
          const mode = payload.state === 'run' ? 'run' : payload.state === 'jump' ? 'jump' : 'walk';
          markMoving(mode === 'run' ? RUN_DURATION_MS : mode === 'jump' ? JUMP_DURATION_MS : WALK_DURATION_MS, mode);
        }
      },
      onNeedsUpdate: (payload: NeedsBroadcastPayload) => {
        setNeeds({
          fullness: payload.fullness,
          happiness: payload.happiness,
          energy: payload.energy,
          thirst: payload.thirst,
          experience: payload.experience,
          stage: payload.stage,
          updated_at: payload.updatedAt,
        });
      },
      onMusicUpdate: (payload: MusicBroadcastPayload) => {
        setListening(payload.isPlaying && !!payload.songId);
      },
      // Replay the partner-driven cat's reaction so BOTH screens show the same
      // sprite change + hear the same SFX (not just the authority client).
      onPetReaction: (payload: PetReactionPayload) => {
        if (payload.actorId === profile?.id) return;
        resetIdleTimer(); // any interaction wakes our cat too
        setHeartEvent(payload.bubble);
        window.setTimeout(() => setHeartEvent(null), 2600);
        if (payload.trap) {
          setCatAction(null);
          setActionSprite(null);
          trapSeenRef.current = false;
          setTrapSprite(payload.sprite);
          setTrapPinId(payload.pinId);
          trapRef.current = true;
          playTrapSfx(payload.emoji);
        } else {
          setTrapSprite(null);
          setTrapPinId(null);
          trapRef.current = false;
          setCatAction(payload.action as CatAction);
          setActionSprite(payload.sprite);
          playActionSfx(payload.action as CatAction);
          window.setTimeout(() => {
            setCatAction(null);
            setActionSprite(null);
          }, payload.arriveMs);
        }
      },
      onPartnerOnline: () => {
        resetIdleTimer(); // wake the cat to greet
        setHeartEvent(partnerName ? `${partnerName} is here 💕` : 'Welcome home 💕');
        playMeow();
        window.setTimeout(() => setHeartEvent(null), 3500);
      },
      onPinsChanged: () => {
        // A dropped/removed sticker wakes our cat — so the authority is awake to
        // go interact with it even if it had fallen asleep.
        resetIdleTimer();
        if (profile?.partner_id) fetchPins(profile.id, profile.partner_id).then(setPins);
      },
    },
    { trackPresence: true }
  );

  // Who drives the cat: when the partner is offline, WE do (so the cat still
  // roams + reacts solo). When both are online, the stable leader (smaller UUID)
  // drives and the other mirrors — avoids two clients fighting over position.
  const isDriver = !partnerPresent || isAuthority;

  useEffect(() => {
    if (!profile?.partner_id) return;
    fetchPetData(profile.id, profile.partner_id).then((data) => setPetNameState(data.pet_name));
    fetchNeeds(profile.id, profile.partner_id).then(setNeeds);
    fetchPins(profile.id, profile.partner_id).then(setPins);
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', profile.partner_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPartnerName(data.display_name);
      });
    // NOTE: intentionally do NOT seed `listening` from now_playing here — that
    // flag can be stale-true (app closed mid-song), which left the cat "dancing"
    // with no audio. Listening is driven only by live music_update events.
  }, [profile]);

  useEffect(() => {
    needsRef.current = needs;
  }, [needs]);

  // Poll the (timestamp-derived) hunger level. Both clients detect independently,
  // so both partners get notified. The sound fires once per hungry episode.
  useEffect(() => {
    const check = () => {
      const n = needsRef.current;
      if (!n) return;
      const nowHungry = decayNeeds(n).fullness < HUNGRY_THRESHOLD;
      setHungry(nowHungry);
      if (nowHungry && !hungryNotifiedRef.current) {
        hungryNotifiedRef.current = true;
        playSound(SOUNDS.NOTIFICATION);
      } else if (!nowHungry) {
        hungryNotifiedRef.current = false;
      }
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  // Coalesce pins_changed while a user spam-drops a scene, so we don't flood the
  // realtime channel (bursty broadcasts have disconnected both clients before).
  const pinsBroadcastTimer = useRef<number | null>(null);
  const queuePinsChanged = useCallback(() => {
    if (pinsBroadcastTimer.current) return;
    pinsBroadcastTimer.current = window.setTimeout(() => {
      pinsBroadcastTimer.current = null;
      sendPinsChanged();
    }, 450);
  }, [sendPinsChanged]);

  // ---- Falling "sandbox" stickers -------------------------------------------
  // A dropped sticker settles into a resting pin. Both partners persist their own
  // drops; the falling animation is local, the resting pin syncs to the partner.
  const settleSticker = useCallback(
    async (s: FallingSticker) => {
      if (!profile?.partner_id) return;
      const nx = Math.max(0.02, Math.min(0.98, (s.x + STICKER_SIZE / 2) / window.innerWidth));
      const ny = Math.max(0.04, Math.min(0.98, (s.y + STICKER_SIZE / 2) / window.innerHeight));
      const pin = await addPin(profile.id, profile.partner_id, s.emoji, nx, ny, s.kind);
      if (pin) {
        setPins((prev) => [...prev, pin]);
        queuePinsChanged();
      }
    },
    [profile, queuePinsChanged]
  );

  // Single rAF physics loop for every airborne sticker.
  const stepSandbox = useCallback(() => {
    const ground = window.innerHeight - STICKER_SIZE - 6;
    const stillFalling: FallingSticker[] = [];
    const justLanded: FallingSticker[] = [];
    for (const s of fallingRef.current) {
      const vy = s.vy + SANDBOX_GRAVITY;
      let y = s.y + vy;
      if (y >= ground) {
        y = ground;
        if (vy > 3.5) stillFalling.push({ ...s, y, vy: -vy * SANDBOX_BOUNCE });
        else justLanded.push({ ...s, y, vy: 0 });
      } else {
        stillFalling.push({ ...s, y, vy });
      }
    }
    fallingRef.current = stillFalling;
    setFallingStickers(stillFalling);
    justLanded.forEach(settleSticker);
    if (stillFalling.length > 0) {
      sandboxRafRef.current = requestAnimationFrame(stepSandbox);
    } else {
      sandboxRafRef.current = null;
    }
  }, [settleSticker]);

  useEffect(() => {
    const unsub = window.api.onSpawnSticker((emoji, kind) => {
      resetIdleTimer(); // a fresh toy wakes the cat
      playPop();
      const s: FallingSticker = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        emoji,
        kind: (kind as PinKind) ?? 'chaos',
        x: window.innerWidth * (0.18 + Math.random() * 0.64) - STICKER_SIZE / 2,
        y: -STICKER_SIZE,
        vy: 0,
      };
      const next = [...fallingRef.current, s];
      fallingRef.current = next;
      setFallingStickers(next);
      if (sandboxRafRef.current == null) sandboxRafRef.current = requestAnimationFrame(stepSandbox);
    });
    return () => {
      unsub();
      if (sandboxRafRef.current) cancelAnimationFrame(sandboxRafRef.current);
    };
  }, [resetIdleTimer, stepSandbox]);

  // ---- Cat interactions (catalog-driven) ------------------------------------
  const applyDeltas = useCallback(
    async (deltas: StatDeltas) => {
      if (!profile?.partner_id || !deltas || Object.keys(deltas).length === 0) return;
      const updated = await applyStatDeltas(profile.id, profile.partner_id, deltas);
      setNeeds(updated);
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
    },
    [profile, sendNeedsUpdate]
  );

  const consumePin = useCallback(
    async (pin: Pin) => {
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      await removePin(pin.id);
      sendPinsChanged();
    },
    [sendPinsChanged]
  );

  // Cupcake sugar rush: a few frantic dashes across the screen.
  const doZoomies = useCallback(() => {
    busyRef.current = true;
    setCatAction(null);
    let n = 0;
    const dash = () => {
      if (n >= 3) {
        busyRef.current = false;
        return;
      }
      n++;
      const maxX = window.innerWidth - catSize;
      const nx = n % 2 === 1 ? maxX * 0.9 : maxX * 0.08;
      const fl = nx < xRef.current;
      setFacingLeft(fl);
      setX(nx);
      if (profile) sendPetPosition({ x: nx, y: groundY, facingLeft: fl, state: 'run', actorId: profile.id });
      markMoving(RUN_DURATION_MS, 'run');
      window.setTimeout(dash, RUN_DURATION_MS + 120);
    };
    dash();
  }, [catSize, profile, groundY, sendPetPosition, markMoving]);

  const resolveInteract = useCallback(
    async (pin: Pin, def: ReturnType<typeof sandboxDef>) => {
      if (!def) return;
      if (def.consume) {
        if (def.residueEmoji) addResidue(def.residueEmoji, pin.x, pin.y);
        await consumePin(pin);
        if (def.zoomies) doZoomies();
        return;
      }
      const maxX = window.innerWidth - catSize;
      switch (def.action) {
        case 'swat': {
          const n = (swatCountRef.current[pin.id] ?? 0) + 1;
          swatCountRef.current[pin.id] = n;
          // Bat it ~50px away from the direction the cat is facing.
          const rollDir = facingLeftRef.current ? 1 : -1;
          const newXpx = Math.max(24, Math.min(window.innerWidth - 24, pin.x * window.innerWidth + rollDir * 50));
          const newXnorm = newXpx / window.innerWidth;
          const broken = n >= (def.swatsToBreak ?? 3);
          const patch = broken ? { x: newXnorm, emoji: def.brokenEmoji ?? pin.emoji } : { x: newXnorm };
          setPins((prev) => prev.map((p) => (p.id === pin.id ? { ...p, ...patch } : p)));
          await updatePin(pin.id, patch);
          sendPinsChanged();
          if (broken) handledPinsRef.current.add(pin.id);
          break;
        }
        case 'warm': {
          handledPinsRef.current.add(pin.id);
          anchorXRef.current = pin.x * window.innerWidth; // idle near the fire now
          break;
        }
        case 'nest': {
          handledPinsRef.current.add(pin.id);
          setX(Math.max(0, Math.min(maxX, pin.x * window.innerWidth - catSize / 2)));
          setAsleep(true); // deep sleep on the pillow
          break;
        }
        case 'sniff': {
          handledPinsRef.current.add(pin.id);
          playSneeze();
          const back = facingLeftRef.current ? 34 : -34; // sneeze knocks it backward
          setX((prev) => Math.max(0, Math.min(maxX, prev + back)));
          break;
        }
        default:
          handledPinsRef.current.add(pin.id); // stub / inspect: look once, then ignore
          break;
      }
    },
    [consumePin, doZoomies, catSize, sendPinsChanged]
  );

  const interact = useCallback(
    async (pin: Pin) => {
      const def = sandboxDef(pin.emoji);
      if (!def || !profile?.partner_id) return;
      if (!pinsRef.current.some((p) => p.id === pin.id)) return; // gone already
      busyRef.current = true;
      resetIdleTimer();
      setCatAction(def.action);
      setActionSprite(def.trap ? null : def.catSprite ?? null); // warming shows its sprite; traps show it on arrival
      playActionSfx(def.action);
      const arriveMs = def.arriveMs ?? 1500;
      const bubble = `${petName} ${actionVerb(def.action)} ${pin.emoji}`;
      setHeartEvent(bubble);
      window.setTimeout(() => setHeartEvent(null), 2600);
      applyDeltas(def.deltas);
      // Tell the partner to play the same reaction (non-traps replay immediately).
      if (!def.trap) {
        sendPetReaction({
          action: def.action,
          sprite: def.catSprite ?? null,
          trap: false,
          pinId: null,
          arriveMs,
          bubble,
          emoji: pin.emoji,
          actorId: profile.id,
        });
      }
      window.setTimeout(() => {
        if (def.trap) {
          // Lock the cat into the chaos pose. The item is hidden while the cat
          // wears its sprite, and the cat stays put until the sticker is toggled
          // off in the app.
          setCatAction(null);
          setActionSprite(null);
          trapSeenRef.current = false;
          setTrapSprite(def.catSprite ?? null);
          setTrapPinId(pin.id);
          trapRef.current = true;
          playTrapSfx(pin.emoji);
          sendPetReaction({
            action: def.action,
            sprite: def.catSprite ?? null,
            trap: true,
            pinId: pin.id,
            arriveMs: 0,
            bubble,
            emoji: pin.emoji,
            actorId: profile.id,
          });
          // busyRef stays true — roam paused until the sticker is removed.
          return;
        }
        resolveInteract(pin, def);
        if (!def.zoomies) {
          busyRef.current = false;
          setCatAction(null);
          setActionSprite(null);
        }
      }, arriveMs);
    },
    [profile, petName, resetIdleTimer, applyDeltas, resolveInteract, sendPetReaction]
  );

  // The cat returns to normal only once its trapping sticker is gone (toggled
  // off / cleared). Watches the pin list for that sticker disappearing.
  const releaseTrap = useCallback(() => {
    trapRef.current = false;
    setTrapSprite(null);
    setTrapPinId(null);
    busyRef.current = false;
    playMeow();
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!trapPinId) return;
    const present = pins.some((p) => p.id === trapPinId);
    if (present) trapSeenRef.current = true; // confirmed it exists
    else if (trapSeenRef.current) releaseTrap(); // …and now it's gone → free the cat
  }, [pins, trapPinId, releaseTrap]);

  useEffect(() => {
    interactRef.current = interact;
  }, [interact]);

  // The next thing worth walking to: eat/catch first, then toys, then cozy spots.
  const pickInteractable = useCallback((): Pin | null => {
    const now = Date.now();
    const usable = pinsRef.current.filter((p) => {
      if (isPinExpired(p, now)) return false;
      const def = sandboxDef(p.emoji);
      if (!def) return false;
      if (def.consume) return true;
      if (def.action === 'swat') return (swatCountRef.current[p.id] ?? 0) < (def.swatsToBreak ?? 3);
      return !handledPinsRef.current.has(p.id); // cozy / stub one-shots
    });
    if (usable.length === 0) return null;
    const prio = (p: Pin) => {
      const def = sandboxDef(p.emoji)!;
      if (def.consume) return 0;
      if (def.action === 'swat') return 1;
      return 2;
    };
    const minPrio = Math.min(...usable.map(prio));
    const group = usable.filter((p) => prio(p) === minPrio);
    let best = group[0];
    let bestDist = Math.abs(best.x * window.innerWidth - xRef.current);
    for (const p of group) {
      const d = Math.abs(p.x * window.innerWidth - xRef.current);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }, []);

  const roam = useCallback(() => {
    if (draggingRef.current || remoteControlledRef.current || falling || asleep || busyRef.current || !isDriver) {
      timerRef.current = window.setTimeout(roam, 1000);
      return;
    }
    const maxX = window.innerWidth - catSize;

    // Something to play with / eat? Go to it, then interact on arrival.
    const target = pickInteractable();
    if (target) {
      const def = sandboxDef(target.emoji);
      const targetX = Math.max(0, Math.min(maxX, target.x * window.innerWidth - catSize / 2));
      const dist = Math.abs(targetX - xRef.current);
      const useJump = def?.action === 'hunt' || dist > maxX * 0.3;
      const mode: 'walk' | 'jump' = useJump ? 'jump' : 'walk';
      const wireState = useJump ? 'jump' : 'roam';
      const durationMs = useJump ? JUMP_DURATION_MS : WALK_DURATION_MS;
      const nextFacingLeft = targetX < xRef.current;
      setFacingLeft(nextFacingLeft);
      setX(targetX);
      if (profile) {
        sendPetPosition({ x: targetX, y: groundY, facingLeft: nextFacingLeft, state: wireState, actorId: profile.id });
      }
      markMoving(durationMs, mode);
      timerRef.current = window.setTimeout(() => {
        interactRef.current?.(target);
        const wait = (def?.arriveMs ?? 1500) + 1600 + Math.random() * 1200;
        timerRef.current = window.setTimeout(roam, wait);
      }, durationMs);
      return;
    }

    // Otherwise amble around (walk / run / jump), biased toward a campfire anchor.
    const r = Math.random();
    const mode: 'walk' | 'run' | 'jump' = r < 0.3 ? 'run' : r < 0.6 ? 'jump' : 'walk';
    const fast = mode === 'run' || mode === 'jump';
    const wireState = mode === 'walk' ? 'roam' : mode;
    const durationMs = mode === 'run' ? RUN_DURATION_MS : mode === 'jump' ? JUMP_DURATION_MS : WALK_DURATION_MS;

    setX((prev) => {
      let nextX: number;
      if (!fast && anchorXRef.current != null && Math.random() < 0.5) {
        nextX = Math.max(0, Math.min(maxX, anchorXRef.current - catSize / 2 + (Math.random() - 0.5) * 130));
      } else if (fast) {
        nextX = Math.random() * maxX;
      } else {
        nextX = Math.max(0, Math.min(maxX, prev + (Math.random() - 0.5) * maxX * 0.6));
      }
      const nextFacingLeft = nextX < prev;
      setFacingLeft(nextFacingLeft);
      if (profile) {
        sendPetPosition({ x: nextX, y: groundY, facingLeft: nextFacingLeft, state: wireState, actorId: profile.id });
      }
      return nextX;
    });
    markMoving(durationMs, mode);
    const pauseMs = fast ? 800 + Math.random() * 1500 : 1500 + Math.random() * 2500;
    timerRef.current = window.setTimeout(roam, durationMs + pauseMs);
  }, [falling, catSize, asleep, isDriver, profile, groundY, sendPetPosition, markMoving, pickInteractable]);

  useEffect(() => {
    timerRef.current = window.setTimeout(roam, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [roam]);

  // Track mouse position passively (cheap, no window API calls here)
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // Age stickers: re-render so ephemeral ones fade, and drop any that have
  // fully expired so the wall stays tidy on both screens.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setPins((prev) => {
        const alive = prev.filter((p) => !isPinExpired(p, now));
        return alive.length === prev.length ? prev : alive;
      });
      setPinTick((t) => t + 1);
    }, 20000);
    return () => clearInterval(id);
  }, []);

  // Only check hover + toggle interactivity on a slow fixed interval,
  // decoupled from mousemove event frequency. This keeps setIgnoreMouseEvents
  // calls capped at 2/sec regardless of how much the mouse actually moves —
  // calling it too frequently was disrupting hardware video acceleration in
  // other apps (e.g. YouTube/Discord freezing during interaction).
  useEffect(() => {
    const interval = setInterval(() => {
      if (draggingRef.current || remoteControlledRef.current || draggingPinRef.current) return;
      if (!catRef.current) return;
      const rect = catRef.current.getBoundingClientRect();
      const { x: mx, y: my } = mousePosRef.current;
      let over = mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom;
      // Also interactive when hovering a resting sticker, so it can be dragged.
      if (!over && mx >= 0) {
        const r = STICKER_SIZE / 2 + 4;
        over = pinsRef.current.some((p) => {
          const cx = p.x * window.innerWidth;
          const cy = p.y * window.innerHeight;
          return mx >= cx - r && mx <= cx + r && my >= cy - r && my <= cy + r;
        });
      }
      if (over !== interactiveRef.current) {
        interactiveRef.current = over;
        window.api.setPetInteractive(over);
      }
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!catRef.current || remoteControlledRef.current) return;
      resumeCatAudio(); // unlock synth audio on this user gesture
      // A trapped cat can still be picked up & thrown (it keeps its trap sprite);
      // a cat mid-quick-reaction is left alone.
      if (busyRef.current && !trapRef.current) return;
      resetIdleTimer();

      const rect = catRef.current.getBoundingClientRect();
      setX(rect.left);
      setY(rect.top);

      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      lastDragPosRef.current = { x: rect.left, y: rect.top };
      dragVelRef.current = { vx: 0, vy: 0 };
      hasMoved.current = false;

      draggingRef.current = true;
      setDragging(true);
      setFalling(false);
      setFlinging(false);
      flungRef.current = false;
      velocityRef.current = 0;
      velocityXRef.current = 0;
    },
    [resetIdleTimer]
  );

  // ---- Drag a resting sticker around the desktop ----------------------------
  const handlePinMouseDown = useCallback((e: React.MouseEvent, pin: Pin) => {
    e.stopPropagation();
    e.preventDefault();
    pinVelRef.current.delete(pin.id); // stop any in-progress fall
    pinDragOffset.current = { x: e.clientX - pin.x * window.innerWidth, y: e.clientY - pin.y * window.innerHeight };
    setDraggingPinId(pin.id);
  }, []);

  // Gravity for released stickers — they drop back to the ground and bounce,
  // just like the cat. One rAF loop advances every falling sticker.
  const stepPinFall = useCallback(() => {
    // Drop velocities for stickers that vanished mid-fall (eaten / cleared).
    for (const id of pinVelRef.current.keys()) {
      if (!pinsRef.current.some((p) => p.id === id)) pinVelRef.current.delete(id);
    }
    const groundCenterY = window.innerHeight - STICKER_SIZE / 2 - 6;
    const settled: { id: string; x: number; y: number }[] = [];
    const next = pinsRef.current.map((p) => {
      const vel = pinVelRef.current.get(p.id);
      if (vel === undefined) return p;
      const vy = vel + SANDBOX_GRAVITY;
      let cy = p.y * window.innerHeight + vy;
      if (cy >= groundCenterY) {
        cy = groundCenterY;
        if (vy > 3.5) pinVelRef.current.set(p.id, -vy * SANDBOX_BOUNCE);
        else {
          pinVelRef.current.delete(p.id);
          settled.push({ id: p.id, x: p.x, y: cy / window.innerHeight });
        }
      } else {
        pinVelRef.current.set(p.id, vy);
      }
      return { ...p, y: cy / window.innerHeight };
    });
    pinsRef.current = next;
    setPins(next);
    if (settled.length > 0) {
      settled.forEach((s) => updatePin(s.id, { x: s.x, y: s.y }));
      queuePinsChanged();
    }
    if (pinVelRef.current.size > 0) pinFallRafRef.current = requestAnimationFrame(stepPinFall);
    else pinFallRafRef.current = null;
  }, [queuePinsChanged]);

  useEffect(() => {
    if (!draggingPinId) return;
    interactiveRef.current = true;
    window.api.setPetInteractive(true);
    const move = (e: MouseEvent) => {
      const nx = Math.max(0.02, Math.min(0.98, (e.clientX - pinDragOffset.current.x) / window.innerWidth));
      const ny = Math.max(0.02, Math.min(0.98, (e.clientY - pinDragOffset.current.y) / window.innerHeight));
      setPins((prev) => prev.map((p) => (p.id === draggingPinId ? { ...p, x: nx, y: ny } : p)));
    };
    const up = () => {
      const id = draggingPinId;
      setDraggingPinId(null);
      interactiveRef.current = false;
      window.api.setPetInteractive(false);
      // Let it fall back to the ground instead of hanging where dropped.
      pinVelRef.current.set(id, 0);
      if (pinFallRafRef.current == null) pinFallRafRef.current = requestAnimationFrame(stepPinFall);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [draggingPinId, stepPinFall]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      if (Math.abs(dx) > CLICK_MOVE_THRESHOLD || Math.abs(dy) > CLICK_MOVE_THRESHOLD) {
        hasMoved.current = true;
      }
      const nextX = Math.max(0, Math.min(window.innerWidth - catSize, e.clientX - dragOffset.current.x));
      const nextY = Math.max(0, Math.min(window.innerHeight - catSize, e.clientY - dragOffset.current.y));

      // Track release velocity (px/frame) for the fling.
      dragVelRef.current = {
        vx: nextX - lastDragPosRef.current.x,
        vy: nextY - lastDragPosRef.current.y,
      };
      lastDragPosRef.current = { x: nextX, y: nextY };

      setX(nextX);
      setY(nextY);

      const now = Date.now();
      if (profile && now - lastDragBroadcast.current > DRAG_BROADCAST_INTERVAL_MS) {
        lastDragBroadcast.current = now;
        sendPetPosition({ x: nextX, y: nextY, facingLeft, state: 'drag', actorId: profile.id });
      }
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      setDragging(false);

      if (!hasMoved.current && profile && !trapRef.current) {
        setHeartEvent(`${profile.display_name} petted ${petName}`);
        playMeow();
        window.setTimeout(() => setHeartEvent(null), 2500);
        sendPetInteraction({ interactionType: 'pet', actorId: profile.id, actorName: profile.display_name });
        if (y !== null) sendPetPosition({ x, y, facingLeft, state: 'idle', actorId: profile.id });
      } else {
        // Fling if released mid-motion, otherwise just drop.
        const { vx, vy } = dragVelRef.current;
        if (Math.hypot(vx, vy) > FLING_SPEED) {
          velocityRef.current = Math.max(-MAX_FLING_V, Math.min(MAX_FLING_V, vy));
          velocityXRef.current = Math.max(-MAX_FLING_V, Math.min(MAX_FLING_V, vx));
          flungRef.current = true;
          setFlinging(true);
          playWhoosh();
        } else {
          velocityRef.current = 0;
          velocityXRef.current = 0;
          flungRef.current = false;
        }
        setFalling(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, catSize, profile, petName, sendPetInteraction, sendPetPosition, x, y, facingLeft]);

  useEffect(() => {
    if (!falling) return;

    const step = () => {
      // Horizontal fling motion (with air friction + wall bounces).
      if (velocityXRef.current !== 0) {
        const maxX = window.innerWidth - catSize;
        let nx = xRef.current + velocityXRef.current;
        if (nx < 0) {
          nx = 0;
          velocityXRef.current = -velocityXRef.current * WALL_RESTITUTION;
        } else if (nx > maxX) {
          nx = maxX;
          velocityXRef.current = -velocityXRef.current * WALL_RESTITUTION;
        }
        velocityXRef.current *= AIR_FRICTION;
        if (Math.abs(velocityXRef.current) < 0.15) velocityXRef.current = 0;
        xRef.current = nx;
        setX(nx);
      }

      setY((prevY) => {
        const current = prevY ?? groundY;
        const wasFlung = flungRef.current; // capture before landing clears it
        velocityRef.current += GRAVITY;
        let next = current + velocityRef.current;
        let landed = false;

        if (next >= groundY) {
          next = groundY;
          if (velocityRef.current > MIN_BOUNCE_VELOCITY) {
            velocityRef.current = -velocityRef.current * BOUNCE_DAMPING;
          } else {
            velocityRef.current = 0;
            velocityXRef.current = 0;
            landed = true;
            setFalling(false);
            if (flungRef.current) {
              flungRef.current = false;
              setFlinging(false); // land upright, on its feet
              playThud();
            }
          }
        }

        // Throttle fall/fling broadcasts (was every frame ~60/sec, which flooded
        // Supabase and disconnected both users). Always send the final 'idle'.
        const nowMs = Date.now();
        if (profile && (landed || nowMs - lastDragBroadcast.current > DRAG_BROADCAST_INTERVAL_MS)) {
          lastDragBroadcast.current = nowMs;
          sendPetPosition({
            x: xRef.current,
            y: next,
            facingLeft,
            state: landed ? 'idle' : wasFlung ? 'fling' : 'fall',
            actorId: profile.id,
          });
        }

        if (!landed) {
          fallRafRef.current = requestAnimationFrame(step);
        }
        return next;
      });
    };
    fallRafRef.current = requestAnimationFrame(step);

    // Safety net: never stay airborne/flinging longer than this, so a physics
    // hiccup can't leave the cat stuck spinning or mid-fall.
    const watchdog = window.setTimeout(() => {
      velocityRef.current = 0;
      velocityXRef.current = 0;
      flungRef.current = false;
      setFlinging(false);
      setFalling(false);
    }, 5000);

    return () => {
      if (fallRafRef.current) cancelAnimationFrame(fallRafRef.current);
      clearTimeout(watchdog);
    };
  }, [falling, groundY, facingLeft, profile, sendPetPosition, catSize]);

  useEffect(() => {
    if (!dragging && !falling && !asleep) {
      const rect = catRef.current?.getBoundingClientRect();
      if (rect) setX(rect.left);
    }
  }, [dragging, falling, asleep]);

  if (!profile?.partner_id || y === null) return <div className="w-full h-full" />;

  const isRoamingTransition = !dragging && !falling && !remoteControlled && !asleep;
  const isPositionedAbsolute = dragging || falling || remoteControlled;
  const moveDurationMs = moveMode === 'run' ? RUN_DURATION_MS : moveMode === 'jump' ? JUMP_DURATION_MS : WALK_DURATION_MS;

  // `trap` = locked in a chaos pose (box/wet/startled). `action` = mid-reaction.
  const motion = trapSprite
    ? 'trap'
    : asleep
    ? 'sleep'
    : dragging
    ? 'drag'
    : falling
    ? 'fall'
    : remoteControlled && remoteState
    ? remoteState // partner is dragging/flinging → show it, not idle
    : catAction
    ? 'action'
    : moving
    ? moveMode // 'walk' | 'run' | 'jump'
    : grooming
    ? 'groom'
    : 'sit';

  // Reaction sprite: warming/etc. can override; a leap uses the jumping pose.
  const actionSrc = actionSprite ?? (catAction === 'hunt' ? './sprites/pixel_cat_jumping.png' : './sprites/pixel_cat_sit.png');
  const actionAnim =
    catAction === 'eat'
      ? 'animate-cat-eat'
      : catAction === 'drink'
      ? 'animate-cat-eat'
      : catAction === 'warm'
      ? 'animate-cat-groom'
      : catAction === 'nest'
      ? 'animate-cat-nest'
      : catAction === 'sniff'
      ? 'animate-cat-sneeze'
      : catAction === 'swat'
      ? 'animate-cat-swat'
      : catAction === 'hunt'
      ? 'animate-cat-jump'
      : ''; // inspect — just sit and look

  const catSrc =
    motion === 'trap'
      ? trapSprite!
      : motion === 'action'
      ? actionSrc
      : motion === 'sleep'
      ? './sprites/pixel_cat_sleeping.gif'
      : motion === 'drag'
      ? './sprites/pixel_cat_drag.png' // being carried
      : motion === 'jump'
      ? './sprites/pixel_cat_jumping.png' // jump arc uses the jumping sprite
      : motion === 'walk' || motion === 'run'
      ? './sprites/pixel_cat.gif' // ORIGINAL sprite for walking / running
      : motion === 'groom' || motion === 'sit'
      ? './sprites/pixel_cat_sit.png'
      : './sprites/pixel_cat_jumping.png'; // fall / fling — airborne pose

  const catAnim =
    motion === 'trap'
      ? 'animate-cat-breathe' // gentle idle while stuck (even when picked up)
      : flinging || motion === 'fling'
      ? 'animate-cat-flip' // spinning while flung (local or mirrored from partner)
      : motion === 'action'
      ? actionAnim
      : motion === 'walk'
      ? 'animate-cat-step'
      : motion === 'run'
      ? 'animate-cat-run' // the 0.3.0 run keyframes on the original sprite
      : motion === 'jump'
      ? 'animate-cat-jump' // up (facing up) then down (facing down)
      : motion === 'groom'
      ? 'animate-cat-groom'
      : motion === 'sleep'
      ? 'animate-cat-breathe'
      : '';

  // Rotate to face down while dropping (jump/fling anims handle their own).
  const imgTransform = motion === 'fall' && !flinging ? 'rotate(180deg)' : undefined;

  // While a track plays, an otherwise-still cat gently bobs to the music.
  const finalAnim =
    listening && !asleep && !dragging && !falling && catAnim === '' ? 'animate-cat-step' : catAnim;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Faded leftovers (fishbone, etc.) — local visual only. */}
      {residues.map((r) => (
        <div
          key={r.id}
          className="absolute pointer-events-none select-none animate-residue-fade"
          style={{
            left: r.x * window.innerWidth,
            top: r.y * window.innerHeight,
            transform: 'translate(-50%, -50%)',
            fontSize: 22,
            filter: 'grayscale(0.3) drop-shadow(1px 2px 1px rgba(0,0,0,0.3))',
          }}
        >
          {r.emoji}
        </div>
      ))}

      {/* Resting sandbox stickers the cat pathfinds to — draggable. Butterflies hover. */}
      {pins.map((p) => {
        void pinTick; // referenced so the fade interval's re-render recomputes opacity
        if (p.id === trapPinId) return null; // hidden while the cat wears its sprite
        const op = pinOpacity(p);
        const isDragging = draggingPinId === p.id;
        const floats = sandboxDef(p.emoji)?.floats && !isDragging;
        return (
          <div
            key={p.id}
            className={`absolute select-none cursor-grab active:cursor-grabbing ${floats ? 'animate-music-float' : ''}`}
            style={{
              left: p.x * window.innerWidth,
              top: p.y * window.innerHeight,
              transform: 'translate(-50%, -50%)',
              fontSize: 26,
              opacity: op,
              filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,0.35))',
              zIndex: isDragging ? 40 : undefined,
            }}
            title="Drag me anywhere"
            onMouseDown={(e) => handlePinMouseDown(e, p)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {p.emoji}
          </div>
        );
      })}

      {/* Airborne stickers mid-drop. */}
      {fallingStickers.map((s) => (
        <div
          key={s.id}
          className="absolute pointer-events-none select-none"
          style={{
            left: s.x,
            top: s.y,
            width: STICKER_SIZE,
            height: STICKER_SIZE,
            fontSize: STICKER_SIZE - 4,
            lineHeight: 1,
            filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.35))',
          }}
        >
          {s.emoji}
        </div>
      ))}

      <div
        ref={catRef}
        className="absolute"
        style={
          isPositionedAbsolute
            ? {
                left: x,
                top: y,
                width: catSize,
                height: catSize,
                transition: 'none',
              }
            : {
                left: x,
                bottom: bottomOffset,
                width: catSize,
                height: catSize,
                transition: isRoamingTransition ? `left ${moveDurationMs}ms linear` : 'none',
              }
        }
      >
        <div style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }} className="relative w-full h-full">
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 font-pixel text-[9px] bg-white/90 text-gray-700 px-1.5 py-0.5 border border-gray-300 shadow-sm whitespace-nowrap select-none pointer-events-none"
            style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }}
          >
            {petName}
          </div>

          {listening && !asleep && (
            <img
              src="./sprites/pixel_music_notes.png"
              alt="music"
              draggable={false}
              className="absolute -top-6 left-1/2 pixel-art select-none pointer-events-none animate-music-float"
              style={{ width: catSize * 0.55, marginLeft: -catSize * 0.275 }}
            />
          )}

          <img
            src={catSrc}
            className={`pixel-art select-none cursor-pointer ${finalAnim}`}
            style={{
              width: catSize,
              height: catSize,
              filter: stageColorFilter(needs?.stage ?? 1),
              transformOrigin: motion === 'groom' ? 'bottom center' : 'center',
              transform: imgTransform,
            }}
            alt={petName}
            draggable={false}
            onMouseDown={handleMouseDown}
            onContextMenu={(e) => e.preventDefault()}
          />

          {heartEvent && (
            <>
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 animate-pet-bounce select-none pointer-events-none">
                <span className="text-2xl">💗</span>
              </div>
              <div
                className="absolute -top-24 left-1/2 -translate-x-1/2 font-sans text-xs bg-white/95 px-2 py-1 rounded-full shadow-md whitespace-nowrap pointer-events-none"
                style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }}
              >
                {heartEvent}
              </div>
            </>
          )}

          {noteBubble && (
            <div
              className="absolute -top-28 left-1/2 -translate-x-1/2 font-pixel text-[9px] bg-white border-2 border-gray-700 shadow-lg px-3 py-2 rounded-none whitespace-normal pointer-events-none"
              style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)', width: 160 }}
            >
              <p className="text-gray-500 mb-1">From {noteBubble.sender}:</p>
              <p className="text-gray-800 leading-snug">{noteBubble.content}</p>
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-gray-700" />
            </div>
          )}

          {hungry && !noteBubble && !heartEvent && (
            <div
              className="absolute -top-14 left-1/2 -translate-x-1/2 font-pixel text-[9px] bg-white border-2 border-ink shadow-lg px-2 py-1 whitespace-nowrap pointer-events-none"
              style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }}
            >
              🍖 {petName} is hungry!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
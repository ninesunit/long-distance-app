import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchPetData } from '../../lib/petStore';
import {
  fetchNeeds,
  applyInteraction,
  decayNeeds,
  stageColorFilter,
  HUNGRY_THRESHOLD,
  type PetNeeds,
} from '../../lib/needsStore';
import { playSound, SOUNDS } from '../../lib/sounds';
import { playMeow, resumeCatAudio, playWhoosh, playThud } from '../../lib/catSounds';
import { supabase } from '../../lib/supabaseClient';
import { fetchPins, type Pin } from '../../lib/pinsStore';
import type {
  PetBroadcastPayload,
  NoteBroadcastPayload,
  PetPositionPayload,
  NeedsBroadcastPayload,
  MusicBroadcastPayload,
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

  const [treatActive, setTreatActive] = useState(false);
  const [treatPos, setTreatPos] = useState({ x: 0, y: 0 });
  const treatDraggingRef = useRef(false);
  const treatModeRef = useRef(false);
  const treatOffset = useRef({ x: 0, y: 0 });
  const treatTimeoutRef = useRef<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const velocityXRef = useRef(0);
  const dragVelRef = useRef({ vx: 0, vy: 0 });
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const flungRef = useRef(false);
  const xRef = useRef(100);
  xRef.current = x;
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
      if (asleep || dragging || falling || remoteControlled || moving || grooming || treatModeRef.current) return;
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

  const { sendPetInteraction, sendPetPosition, sendNeedsUpdate } = useCoupleChannel(
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
          experience: payload.experience,
          stage: payload.stage,
          updated_at: payload.updatedAt,
        });
      },
      onMusicUpdate: (payload: MusicBroadcastPayload) => {
        setListening(payload.isPlaying && !!payload.songId);
      },
      onPartnerOnline: () => {
        resetIdleTimer(); // wake the cat to greet
        setHeartEvent(partnerName ? `${partnerName} is here 💕` : 'Welcome home 💕');
        playMeow();
        window.setTimeout(() => setHeartEvent(null), 3500);
      },
      onPinsChanged: () => {
        if (profile?.partner_id) fetchPins(profile.id, profile.partner_id).then(setPins);
      },
    },
    { trackPresence: true }
  );

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

  // ---- Drag-a-treat co-op feed ----------------------------------------------
  const feedFromTreat = useCallback(async () => {
    if (!profile?.partner_id) return;
    resetIdleTimer();
    setHeartEvent(`${profile.display_name} fed ${petName}`);
    playMeow();
    window.setTimeout(() => setHeartEvent(null), 2500);
    sendPetInteraction({ interactionType: 'feed', actorId: profile.id, actorName: profile.display_name });
    const updated = await applyInteraction(profile.id, profile.partner_id, 'feed');
    setNeeds(updated);
    sendNeedsUpdate({
      fullness: updated.fullness,
      happiness: updated.happiness,
      experience: updated.experience,
      stage: updated.stage,
      updatedAt: updated.updated_at,
      actorId: profile.id,
    });
  }, [profile, petName, resetIdleTimer, sendPetInteraction, sendNeedsUpdate]);

  const endTreat = useCallback(
    (dropX: number, dropY: number) => {
      if (treatTimeoutRef.current) {
        clearTimeout(treatTimeoutRef.current);
        treatTimeoutRef.current = null;
      }
      let fed = false;
      if (dropX >= 0 && catRef.current) {
        const r = catRef.current.getBoundingClientRect();
        fed = dropX >= r.left && dropX <= r.right && dropY >= r.top && dropY <= r.bottom;
      }
      treatDraggingRef.current = false;
      treatModeRef.current = false;
      setTreatActive(false);
      interactiveRef.current = false;
      window.api.setPetInteractive(false);
      if (fed) feedFromTreat();
    },
    [feedFromTreat]
  );

  useEffect(() => {
    const unsub = window.api.onSpawnTreat(() => {
      setTreatPos({ x: window.innerWidth / 2 - 18, y: Math.max(60, window.innerHeight / 2) });
      setTreatActive(true);
      treatModeRef.current = true;
      treatDraggingRef.current = false;
      interactiveRef.current = true;
      window.api.setPetInteractive(true);
      if (treatTimeoutRef.current) clearTimeout(treatTimeoutRef.current);
      // Safety: never leave the whole screen mouse-capturing if the user wanders off.
      treatTimeoutRef.current = window.setTimeout(() => endTreat(-1, -1), 20000);
    });
    return () => {
      unsub();
      if (treatTimeoutRef.current) clearTimeout(treatTimeoutRef.current);
    };
  }, [endTreat]);

  useEffect(() => {
    if (!treatActive) return;
    const move = (e: MouseEvent) => {
      if (!treatDraggingRef.current) return;
      setTreatPos({ x: e.clientX - treatOffset.current.x, y: e.clientY - treatOffset.current.y });
    };
    const up = (e: MouseEvent) => {
      if (!treatDraggingRef.current) return;
      endTreat(e.clientX, e.clientY);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTreat(-1, -1);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('keydown', key);
    };
  }, [treatActive, endTreat]);

  const handleTreatMouseDown = useCallback(
    (e: React.MouseEvent) => {
      treatDraggingRef.current = true;
      treatOffset.current = { x: e.clientX - treatPos.x, y: e.clientY - treatPos.y };
    },
    [treatPos]
  );

  const roam = useCallback(() => {
    if (draggingRef.current || remoteControlledRef.current || falling || asleep || !isAuthority) {
      timerRef.current = window.setTimeout(roam, 1000);
      return;
    }
    const maxX = window.innerWidth - catSize;
    // Pick a movement style: walk (amble), run (dash), or jump (hop arc).
    const r = Math.random();
    const mode: 'walk' | 'run' | 'jump' = r < 0.3 ? 'run' : r < 0.6 ? 'jump' : 'walk';
    const fast = mode === 'run' || mode === 'jump';
    const visitPin = !fast && pinsRef.current.length > 0 && Math.random() < 0.35;
    const wireState = mode === 'walk' ? 'roam' : mode; // 'roam' | 'run' | 'jump'
    const durationMs = mode === 'run' ? RUN_DURATION_MS : mode === 'jump' ? JUMP_DURATION_MS : WALK_DURATION_MS;

    setX((prev) => {
      let nextX: number;
      if (visitPin) {
        const pin = pinsRef.current[Math.floor(Math.random() * pinsRef.current.length)];
        nextX = Math.max(0, Math.min(maxX, pin.x * window.innerWidth - catSize / 2));
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
    // Move, then sit/groom a while before the next outing.
    const pauseMs = fast ? 800 + Math.random() * 1500 : 1500 + Math.random() * 2500;
    timerRef.current = window.setTimeout(roam, durationMs + pauseMs);
  }, [falling, catSize, asleep, isAuthority, profile, groundY, sendPetPosition, markMoving]);

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

  // Only check hover + toggle interactivity on a slow fixed interval,
  // decoupled from mousemove event frequency. This keeps setIgnoreMouseEvents
  // calls capped at 2/sec regardless of how much the mouse actually moves —
  // calling it too frequently was disrupting hardware video acceleration in
  // other apps (e.g. YouTube/Discord freezing during interaction).
  useEffect(() => {
    const interval = setInterval(() => {
      if (treatModeRef.current) return; // treat mode owns interactivity
      if (draggingRef.current || remoteControlledRef.current) return;
      if (!catRef.current) return;
      const rect = catRef.current.getBoundingClientRect();
      const { x: mx, y: my } = mousePosRef.current;
      const over = mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom;
      if (over !== interactiveRef.current) {
        interactiveRef.current = over;
        window.api.setPetInteractive(over);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!catRef.current || remoteControlledRef.current || treatModeRef.current) return;
      resumeCatAudio(); // unlock synth audio on this user gesture
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

      if (!hasMoved.current && profile) {
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

  const motion = asleep
    ? 'sleep'
    : dragging
    ? 'drag'
    : falling
    ? 'fall'
    : remoteControlled && remoteState
    ? remoteState // partner is dragging/flinging → show it, not idle
    : moving
    ? moveMode // 'walk' | 'run' | 'jump'
    : grooming
    ? 'groom'
    : 'sit';

  const catSrc =
    motion === 'sleep'
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
    flinging || motion === 'fling'
      ? 'animate-cat-flip' // spinning while flung (local or mirrored from partner)
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
      {treatActive && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 font-pixel text-[10px] text-ink bg-white border-2 border-ink px-2 py-1 whitespace-nowrap pointer-events-none">
            Drag the treat to {petName}! · Esc to cancel
          </div>
          <div
            className="absolute z-50 cursor-grab active:cursor-grabbing select-none"
            style={{ left: treatPos.x, top: treatPos.y, fontSize: 32, lineHeight: 1 }}
            onMouseDown={handleTreatMouseDown}
            onContextMenu={(e) => e.preventDefault()}
          >
            🍖
          </div>
        </>
      )}
      {pins.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none select-none"
          style={{
            left: p.x * window.innerWidth,
            top: p.y * window.innerHeight,
            transform: 'translate(-50%, -50%)',
            fontSize: 26,
            filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,0.35))',
          }}
        >
          {p.emoji}
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
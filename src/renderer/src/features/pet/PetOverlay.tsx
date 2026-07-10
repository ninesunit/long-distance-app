import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchPetData } from '../../lib/petStore';
import { playSound, SOUNDS } from '../../lib/sounds';
import type { PetBroadcastPayload, NoteBroadcastPayload, PetPositionPayload } from '../../../../shared/types';

const CLICK_MOVE_THRESHOLD = 5;
const BOUNCE_DAMPING = 0.4;
const MIN_BOUNCE_VELOCITY = 3;
const GRAVITY = 0.6;
const IDLE_TIMEOUT_MS = 30000;
const DRAG_BROADCAST_INTERVAL_MS = 50;

export default function PetOverlay() {
  const { profile } = useAuth();
  const [petName, setPetNameState] = useState('Kitty');
  const [taskbarOffset, setTaskbarOffset] = useState(-10);
  const [catSize, setCatSize] = useState(64);
  const [x, setX] = useState(100);
  const [y, setY] = useState<number | null>(null);
  const [facingLeft, setFacingLeft] = useState(false);
  const [heartEvent, setHeartEvent] = useState<string | null>(null);
  const [noteBubble, setNoteBubble] = useState<{ sender: string; content: string } | null>(null);
  const [dragging, setDragging] = useState(false); // local user is dragging
  const [remoteControlled, setRemoteControlled] = useState(false); // partner is currently dragging/falling
  const [falling, setFalling] = useState(false);
  const [asleep, setAsleep] = useState(true);

  const timerRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const fallRafRef = useRef<number | null>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef(false);
  const draggingRef = useRef(false);
  const remoteControlledRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const lastDragBroadcast = useRef(0);

  const groundY = window.innerHeight - taskbarOffset - catSize;

  // Deterministic "authority" — only this side picks new roam targets.
  // Both sides always mirror the same value since it's derived from the
  // same two sorted IDs, so there's no coordination needed to agree on it.
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
    window.api.getPetSettings().then((s) => {
      setTaskbarOffset(s.taskbarOffset);
      setCatSize(s.catSize);
    });
    const unsub = window.api.onPetSettingsChanged((s) => {
      setTaskbarOffset(s.taskbarOffset);
      setCatSize(s.catSize);
    });
    return unsub;
  }, []);

  const resetIdleTimer = useCallback(() => {
    setAsleep(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (catRef.current) {
        const rect = catRef.current.getBoundingClientRect();
        setX(rect.left);
      }
      setAsleep(true);
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const { sendPetInteraction, sendPetPosition } = useCoupleChannel(
    profile?.id,
    profile?.partner_id ?? undefined,
    {
      onPetInteraction: (payload: PetBroadcastPayload) => {
        const verb = payload.interactionType === 'feed' ? 'fed' : 'petted';
        setHeartEvent(`${payload.actorName} ${verb} ${petName}`);
        playSound(SOUNDS.MEOW);
        resetIdleTimer();
        window.setTimeout(() => setHeartEvent(null), 2500);
      },
      onNoteSent: (payload: NoteBroadcastPayload) => {
        setNoteBubble({ sender: payload.senderName, content: payload.content });
        playSound(SOUNDS.NOTIFICATION);
        window.setTimeout(() => setNoteBubble(null), 6000);
      },
      onPetPosition: (payload: PetPositionPayload) => {
        if (payload.actorId === profile?.id) return; // ignore own broadcasts

        if (payload.state === 'drag' || payload.state === 'fall') {
          remoteControlledRef.current = true;
          setRemoteControlled(true);
          setX(payload.x);
          setY(payload.y);
          setFacingLeft(payload.facingLeft);
        } else if (payload.state === 'idle') {
          remoteControlledRef.current = false;
          setRemoteControlled(false);
          setX(payload.x);
          setY(payload.y);
          setFacingLeft(payload.facingLeft);
        } else if (payload.state === 'roam') {
          // Non-authority side receives the authoritative roam target and
          // just animates toward it via the CSS transition on `left`.
          setX(payload.x);
          setFacingLeft(payload.facingLeft);
        }
      },
    }
  );

  useEffect(() => {
    if (!profile?.partner_id) return;
    fetchPetData(profile.id, profile.partner_id).then((data) => setPetNameState(data.pet_name));
  }, [profile]);

  // Only the authority side picks roam targets and broadcasts them
  const roam = useCallback(() => {
    if (draggingRef.current || remoteControlledRef.current || falling || asleep || !isAuthority) {
      timerRef.current = window.setTimeout(roam, 1000);
      return;
    }
    const maxX = window.innerWidth - catSize;
    setX((prev) => {
      const nextX = Math.random() * maxX;
      const nextFacingLeft = nextX < prev;
      setFacingLeft(nextFacingLeft);
      if (profile) {
        sendPetPosition({ x: nextX, y: groundY, facingLeft: nextFacingLeft, state: 'roam', actorId: profile.id });
      }
      return nextX;
    });
    timerRef.current = window.setTimeout(roam, 5000 + Math.random() * 4000);
  }, [falling, catSize, asleep, isAuthority, profile, groundY, sendPetPosition]);

  useEffect(() => {
    timerRef.current = window.setTimeout(roam, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [roam]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (draggingRef.current || remoteControlledRef.current) return;
      if (!catRef.current) return;
      const rect = catRef.current.getBoundingClientRect();
      const over =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (over !== interactiveRef.current) {
        interactiveRef.current = over;
        window.api.setPetInteractive(over);
      }
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!catRef.current || remoteControlledRef.current) return;
      resetIdleTimer();

      const rect = catRef.current.getBoundingClientRect();
      setX(rect.left);
      setY(rect.top);

      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      hasMoved.current = false;

      draggingRef.current = true;
      interactiveRef.current = true;
      window.api.setPetInteractive(true);

      setDragging(true);
      setFalling(false);
      velocityRef.current = 0;
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
        playSound(SOUNDS.MEOW);
        window.setTimeout(() => setHeartEvent(null), 2500);
        sendPetInteraction({ interactionType: 'pet', actorId: profile.id, actorName: profile.display_name });
        if (y !== null) sendPetPosition({ x, y, facingLeft, state: 'idle', actorId: profile.id });
      } else {
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
      setY((prevY) => {
        const current = prevY ?? groundY;
        velocityRef.current += GRAVITY;
        let next = current + velocityRef.current;
        let landed = false;

        if (next >= groundY) {
          next = groundY;
          if (velocityRef.current > MIN_BOUNCE_VELOCITY) {
            velocityRef.current = -velocityRef.current * BOUNCE_DAMPING;
          } else {
            velocityRef.current = 0;
            landed = true;
            setFalling(false);
          }
        }

        if (profile) {
          sendPetPosition({
            x,
            y: next,
            facingLeft,
            state: landed ? 'idle' : 'fall',
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

    return () => {
      if (fallRafRef.current) cancelAnimationFrame(fallRafRef.current);
    };
  }, [falling, groundY, x, facingLeft, profile, sendPetPosition]);

  useEffect(() => {
    if (!dragging && !falling && !asleep) {
      const rect = catRef.current?.getBoundingClientRect();
      if (rect) setX(rect.left);
    }
  }, [dragging, falling, asleep]);

  if (!profile?.partner_id || y === null) return <div className="w-full h-full" />;

  const isMirroring = remoteControlled; // no CSS transition while mirroring live drag/fall data
  const isRoamingTransition = !dragging && !falling && !remoteControlled && !asleep;

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div
        ref={catRef}
        className="absolute"
        style={{
          left: x,
          top: y,
          width: catSize,
          height: catSize,
          transition: isRoamingTransition ? 'left 5000ms linear' : 'none',
        }}
      >
        <div style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }} className="relative w-full h-full">
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 font-pixel text-[9px] bg-white/90 text-gray-700 px-1.5 py-0.5 border border-gray-300 shadow-sm whitespace-nowrap select-none pointer-events-none"
            style={{ transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)' }}
          >
            {petName}
          </div>

          <img
            src={asleep ? './sprites/pixel_cat_sleeping.gif' : './sprites/pixel_cat.gif'}
            className="pixel-art select-none cursor-pointer"
            style={{ width: catSize, height: catSize }}
            alt={petName}
            draggable={false}
            onMouseDown={handleMouseDown}
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
        </div>
      </div>
    </div>
  );
}
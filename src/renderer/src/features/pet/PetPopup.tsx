import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchPetData, setPetName, setPetGender, type PetGender } from '../../lib/petStore';
import {
  fetchNeeds,
  applyInteraction,
  decayNeeds,
  stageProgress,
  HUNGRY_THRESHOLD,
  MAX_STAGE,
  type PetNeeds,
} from '../../lib/needsStore';
import { LampGlowLayer } from '../../components/LampGlow';
import { SANDBOX, type SandboxCategory, type SandboxDef } from '../../lib/sandboxCatalog';
import { fetchPins, removePinsByEmoji, clearPins } from '../../lib/pinsStore';
import { playSweep } from '../../lib/catSounds';
import type { PetBroadcastPayload, NeedsBroadcastPayload } from '../../../../shared/types';

function NeedBar({ label, value, fill }: { label: string; value: number; fill: string }) {
  return (
    <div className="w-full flex items-center gap-1.5">
      <span className="text-[11px] w-4 text-center flex-shrink-0">{label}</span>
      <div className="flex-1 h-3 border-2 border-ink bg-cozy overflow-hidden">
        <div className="h-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: fill }} />
      </div>
      <span className="font-pixel text-[8px] text-ink-soft w-6 text-right flex-shrink-0">{Math.round(value)}</span>
    </div>
  );
}

export default function PetPopup() {
  const { profile, loading } = useAuth();
  const [petName, setPetNameState] = useState('Kitty');
  const [petGender, setPetGenderState] = useState<PetGender>('male');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [needs, setNeeds] = useState<PetNeeds | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [activeStickers, setActiveStickers] = useState<Set<string>>(new Set()); // emojis currently on the desktop
  const [, setTick] = useState(0);
  const [lampGlow, setLampGlow] = useState(0);
  const lampIntensitiesRef = useRef<Record<string, number>>({});
  const petNameRef = useRef(petName);
  petNameRef.current = petName;

  const loadPins = () => {
    if (!profile?.partner_id) return;
    fetchPins(profile.id, profile.partner_id).then((pins) => setActiveStickers(new Set(pins.map((p) => p.emoji))));
  };

  const { sendPetInteraction, sendNeedsUpdate, sendPinsChanged } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onPetInteraction: (payload: PetBroadcastPayload) => {
      const verb = payload.interactionType === 'feed' ? 'fed' : 'petted';
      setLastEvent(`${payload.actorName} ${verb} ${petNameRef.current}`);
      // Meows are played once, by the desktop overlay (the single sound source),
      // so multiple open windows don't stack overlapping meows.
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
    onLampUpdate: (p) => {
      lampIntensitiesRef.current[p.holderId] = p.intensity;
      setLampGlow(Math.max(0, ...Object.values(lampIntensitiesRef.current)));
    },
    onPinsChanged: () => loadPins(),
  });

  const loadNeeds = () => {
    if (!profile?.partner_id) return;
    fetchNeeds(profile.id, profile.partner_id).then(setNeeds);
  };

  useEffect(() => {
    if (!profile?.partner_id) return;
    fetchPetData(profile.id, profile.partner_id).then((data) => {
      setPetNameState(data.pet_name);
      setPetGenderState(data.pet_gender);
    });
    loadNeeds();
    loadPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Refresh when the popup is (re)shown, and tick so the bars visibly decay.
  useEffect(() => {
    const unsub = window.api.onPopupShown(() => {
      loadNeeds();
      loadPins();
    });
    const interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => {
      unsub();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (loading || !profile || !profile.partner_id) return <div className="w-full h-full" />;

  const shown = needs ? decayNeeds(needs) : null;
  const isHungry = shown ? shown.fullness < HUNGRY_THRESHOLD : false;

  const handleInteract = async (type: 'feed' | 'pet') => {
    if (!profile.partner_id) return;
    const verb = type === 'feed' ? 'fed' : 'petted';
    setLastEvent(`${profile.display_name} ${verb} ${petName}`);
    sendPetInteraction({ interactionType: type, actorId: profile.id, actorName: profile.display_name });

    const updated = await applyInteraction(profile.id, profile.partner_id, type);
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
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !profile.partner_id) return;
    await setPetName(profile.id, profile.partner_id, trimmed);
    setPetNameState(trimmed);
    setEditingName(false);
  };

  const handleGenderChange = async (gender: PetGender) => {
    if (!profile.partner_id) return;
    setPetGenderState(gender);
    await setPetGender(profile.id, profile.partner_id, gender);
  };

  // Treats drop every click; everything else toggles on/off.
  const handlePickSticker = async (def: SandboxDef) => {
    if (!profile.partner_id) return;
    if (def.spammable) {
      window.api.spawnSticker(def.emoji, def.category);
      setLastEvent(`Dropped ${def.label} 🐾`);
      return;
    }
    if (activeStickers.has(def.emoji)) {
      setActiveStickers((prev) => {
        const n = new Set(prev);
        n.delete(def.emoji);
        return n;
      });
      await removePinsByEmoji(profile.id, profile.partner_id, def.emoji);
      sendPinsChanged();
    } else {
      setActiveStickers((prev) => new Set(prev).add(def.emoji));
      window.api.spawnSticker(def.emoji, def.category);
      setLastEvent(`Dropped ${def.label} 🐾`);
    }
  };

  const handleClearStickers = async () => {
    if (!profile.partner_id) return;
    playSweep();
    setActiveStickers(new Set());
    await clearPins(profile.id, profile.partner_id);
    sendPinsChanged();
    setLastEvent('Cleared the desktop ✨');
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="pixel-window relative w-full h-full flex flex-col items-center justify-center gap-2 p-4 no-drag">
        <LampGlowLayer intensity={lampGlow} />
        <div className="relative">
          <img src="./sprites/pixel_cat.gif" className="w-14 h-14 pixel-art" alt="cat" />
          {shown && (
            <span className="pixel-badge absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center text-[8px] leading-none">
              {shown.stage}
            </span>
          )}
        </div>

        {editingName ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              maxLength={20}
              className="pixel-input text-xs px-2 py-1 w-24"
              placeholder="Pet name"
            />
            <button onClick={handleSaveName} className="pixel-btn pixel-btn--primary text-[10px] px-2 py-1">
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNameInput(petName);
              setEditingName(true);
            }}
            className="font-pixel text-[11px] text-ink"
            title="Click to rename"
          >
            {petName} ✏️
          </button>
        )}

        {shown && (
          <div className="w-full flex flex-col gap-1.5 px-1">
            <NeedBar label="🍖" value={shown.fullness} fill={isHungry ? '#e24b4a' : '#ff8a5b'} />
            <NeedBar label="💗" value={shown.happiness} fill="#d4537e" />
            <NeedBar label="⚡" value={shown.energy} fill="#f2b705" />
            <NeedBar label="💧" value={shown.thirst} fill="#4aa8e2" />
            <div className="w-full flex items-center gap-1.5">
              <span className="font-pixel text-[8px] text-ink w-8 flex-shrink-0">
                Lv{shown.stage}
              </span>
              <div className="flex-1 h-2 border-2 border-ink bg-cozy overflow-hidden">
                <div
                  className="h-full bg-lavender transition-all duration-500"
                  style={{ width: `${stageProgress(shown.experience) * 100}%` }}
                />
              </div>
              {shown.stage >= MAX_STAGE && <span className="text-[9px]">👑</span>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenderChange('male')}
            className={`w-7 h-7 border-2 flex items-center justify-center transition ${
              petGender === 'male' ? 'border-ink bg-blue-100' : 'border-ink/30 bg-cozy'
            }`}
            title="Male"
          >
            <img src="./sprites/pixel_male.png" className="w-4 h-4 pixel-art" alt="male" />
          </button>
          <button
            onClick={() => handleGenderChange('female')}
            className={`w-7 h-7 border-2 flex items-center justify-center transition ${
              petGender === 'female' ? 'border-ink bg-pink-100' : 'border-ink/30 bg-cozy'
            }`}
            title="Female"
          >
            <img src="./sprites/pixel_female.png" className="w-4 h-4 pixel-art" alt="female" />
          </button>
        </div>

        <p className="text-[11px] text-ink-soft h-4 text-center px-2 truncate w-full">
          {isHungry ? `${petName} is hungry!` : lastEvent ?? `${petName} is roaming your desktop!`}
        </p>

        <div className="flex items-center gap-2">
          <button onClick={() => handleInteract('pet')} className="pixel-btn pixel-btn--accent text-[10px] px-3 py-1.5">
            ✋ Pet
          </button>
          <button
            onClick={() => setShowStickers(true)}
            className="pixel-btn pixel-btn--pink text-[10px] px-3 py-1.5"
            title="Drop treats & toys onto your desktop"
          >
            🧺 Toys
          </button>
        </div>

        <button
          onClick={() => window.api.toggleWindow('game')}
          className="pixel-btn text-[9px] px-3 py-1"
          title="Play a quick co-op game together"
        >
          🎮 Play together
        </button>

        {showStickers && (
          <StickerTray
            petName={petName}
            active={activeStickers}
            onPick={handlePickSticker}
            onClear={handleClearStickers}
            onClose={() => setShowStickers(false)}
          />
        )}
      </div>
    </div>
  );
}

// A tray button's face: a pixel-art icon if one exists, else the emoji. If the
// icon file is missing the <img> errors out and we fall back to the emoji.
function StickerIcon({ def }: { def: SandboxDef }) {
  const [failed, setFailed] = useState(false);
  if (def.icon && !failed) {
    return (
      <img
        src={def.icon}
        alt={def.label}
        className="w-5 h-5 pixel-art"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span>{def.emoji}</span>;
}

// The "sandbox" tray — treats drop every click; toys/cozy/chaos toggle on & off.
function StickerTray({
  petName,
  active,
  onPick,
  onClear,
  onClose,
}: {
  petName: string;
  active: Set<string>;
  onPick: (def: SandboxDef) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const groups: { key: SandboxCategory; label: string }[] = [
    { key: 'consumable', label: '🍱 Treats · click to drop' },
    { key: 'cozy', label: '🛋️ Cozy · toggle' },
    { key: 'toy', label: '🧸 Toys · toggle' },
    { key: 'chaos', label: '🌪️ Chaos · toggle' },
  ];
  return (
    <div className="absolute inset-0 z-20 bg-paper/95 flex flex-col p-2.5 no-drag">
      <div className="flex items-center justify-between mb-1">
        <p className="font-pixel text-[9px] text-ink">🧺 Toys & Treats</p>
        <button onClick={onClose} className="font-pixel text-[10px] text-ink-soft hover:text-ink" title="Close">
          ✕
        </button>
      </div>
      <p className="text-[8px] text-ink-soft mb-1.5 leading-snug">
        Drop treats for {petName} to eat. Toys stay put — drag them anywhere on your desktop.
      </p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
        {groups.map((g) => {
          const items = SANDBOX.filter((s) => s.category === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key}>
              <p className="font-pixel text-[7px] text-ink-soft mb-0.5">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {items.map((s) => {
                  const on = !s.spammable && active.has(s.emoji);
                  return (
                    <button
                      key={s.emoji}
                      onClick={() => onPick(s)}
                      title={s.hint}
                      className={`w-7 h-7 border-2 flex items-center justify-center text-sm shadow-pixel-btn-sm hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                        on ? 'border-campfire bg-blush' : 'border-ink bg-cozy'
                      }`}
                    >
                      <StickerIcon def={s} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={onClear}
        className="pixel-btn text-[9px] px-3 py-1 mt-1.5 self-center"
        title="Remove every sticker from the desktop"
      >
        🧹 Clear all
      </button>
    </div>
  );
}

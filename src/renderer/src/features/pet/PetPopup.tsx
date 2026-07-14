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
  const [, setTick] = useState(0);
  const [lampGlow, setLampGlow] = useState(0);
  const lampIntensitiesRef = useRef<Record<string, number>>({});
  const petNameRef = useRef(petName);
  petNameRef.current = petName;

  const { sendPetInteraction, sendNeedsUpdate } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
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
        experience: payload.experience,
        stage: payload.stage,
        updated_at: payload.updatedAt,
      });
    },
    onLampUpdate: (p) => {
      lampIntensitiesRef.current[p.holderId] = p.intensity;
      setLampGlow(Math.max(0, ...Object.values(lampIntensitiesRef.current)));
    },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Refresh when the popup is (re)shown, and tick so the bars visibly decay.
  useEffect(() => {
    const unsub = window.api.onPopupShown(() => loadNeeds());
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

        <div className="flex gap-2">
          <button
            onClick={() => {
              window.api.spawnTreat();
              window.api.hideAllPopups();
            }}
            className="pixel-btn pixel-btn--pink text-[10px] px-3 py-1.5"
            title="Drag the treat onto the cat"
          >
            🍖 Feed
          </button>
          <button onClick={() => handleInteract('pet')} className="pixel-btn pixel-btn--accent text-[10px] px-3 py-1.5">
            ✋ Pet
          </button>
        </div>

        <button
          onClick={() => window.api.toggleWindow('game')}
          className="pixel-btn text-[9px] px-3 py-1"
          title="Play a quick co-op game together"
        >
          🎮 Play together
        </button>
      </div>
    </div>
  );
}
